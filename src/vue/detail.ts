import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toValue,
  useId,
  watch,
  watchEffect,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
  type VNode,
  type VNodeChild,
} from 'vue';

import {
  SERVER_INPUT_DEBOUNCE_MS,
  createDetailPageCache,
  defaultDetailQuery,
  detailQuerySignature,
  hideColumns,
  providerQuery,
  queryRows,
  serverPage,
  visibleColumnIndexes,
  validateDetailData,
  type DetailCell,
  type DetailColumn,
  type DetailData,
  type DetailLoader,
  type DetailLoadState,
  type DetailMode,
  type DetailPage,
  type DetailPageCache,
  type DetailQuery,
  type DetailSort,
  type ServerDetailOptions,
} from '../core/detail.js';
import type { WidgetDefinition } from '../core/definition.js';
import { detailToCsv, queryToCsv } from '../core/export.js';
import type { OptionValues } from '../core/options.js';
import { BASE_VIEW_KEY } from '../core/views.js';
import { CellContent } from './cells.js';
import {
  csvExportFile,
  deliverExportFile,
  type DetailExportRequest,
  type ExportFile,
  type ExportFormat,
} from '../react/download.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export { SERVER_INPUT_DEBOUNCE_MS };
export type { DetailLoader, DetailLoadState, ServerDetailOptions };

export interface WidgetDetailProps {
  /** Table caption: the widget's title. */
  readonly title: string;
  /** The widget's key, passed to `custom` column formatters. */
  readonly widgetKey?: string | undefined;
  /** The rows to show. Absent while `status` is `loading` or `error`. */
  readonly data?: DetailData | undefined;
  /** Controlled: you own the query, so you can keep it in the URL. */
  readonly query: DetailQuery;
  readonly onQueryChange: (query: DetailQuery) => void;
  /** Default `ok`. */
  readonly status?: 'ok' | 'loading' | 'error' | undefined;
  readonly error?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  /**
   * `client` (default): `data` holds every row and this component filters,
   * sorts and pages it. `server`: `data` is the one page your provider
   * returned for `query` (with `totalRows`); this component only shows it and
   * reports changes through `onQueryChange`. Typing in the search and filter
   * boxes waits `SERVER_INPUT_DEBOUNCE_MS` after the last key.
   */
  readonly mode?: DetailMode | undefined;
  /** True while a new page is loading: the old rows stay, marked busy. */
  readonly busy?: boolean | undefined;
  /**
   * Rows-per-page choices. Two or more adds a "Rows per page" select; the
   * choice goes into `query.pageSize` (and back to page 1's position).
   */
  readonly pageSizes?: readonly number[] | undefined;
  /** Adds a "Columns" menu; hidden columns go into `query.hidden`. */
  readonly columnVisibility?: boolean | undefined;
  /** Heading level of the title, 2 to 6. Default 2. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined;
  /** Id of the heading, so a dialog can label itself with it. */
  readonly headingId?: string | undefined;
  /**
   * Adds a "Download CSV" button (`['csv']`). In client mode the file holds
   * every row the search, filters and sort select, not only the page shown.
   * In server mode the button needs `onExportAll`, because the page on screen
   * is all this component has.
   */
  readonly exportFormats?: readonly ExportFormat[] | undefined;
  /** Server mode: gets all rows matching the query. See `DashboardProps.onExportDetail`. */
  readonly onExportAll?:
    | ((
        request: DetailExportRequest
      ) => DetailData | undefined | Promise<DetailData | undefined>)
    | undefined;
  /** Receives the file instead of the browser downloading it. */
  readonly onExport?: ((file: ExportFile) => void) | undefined;
  /** Called with a readable message when an export fails. */
  readonly onExportError?: ((message: string) => void) | undefined;
  readonly className?: string | undefined;
}

function nextSort(
  current: DetailSort | undefined,
  column: string
): DetailSort | undefined {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc'
    ? { column, direction: 'desc' }
    : undefined;
}

/** `query` with a new sort (or none), back on the first page. */
function withSort(
  query: DetailQuery,
  sort: DetailSort | undefined
): DetailQuery {
  const { sort: _previous, ...rest } = query;
  return sort === undefined ? { ...rest, page: 1 } : { ...rest, sort, page: 1 };
}

/**
 * A search box. With `debounceMs` above 0 it keeps what is typed locally and
 * reports it after that pause (so a server is not asked on every key); a
 * value that changes from outside replaces the text.
 */
const QueryInput = defineComponent(
  (props: {
    readonly value: string;
    readonly debounceMs: number;
    readonly onValue: (value: string) => void;
  }) => {
    const text: Ref<string> = ref(props.value);
    let sent: string = props.value;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clear(): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }

    watch(
      () => props.value,
      (value) => {
        if (value !== sent) {
          sent = value;
          text.value = value;
        }
      }
    );
    watch([text, () => props.debounceMs], ([current, debounceMs]) => {
      clear();
      if (debounceMs <= 0 || current === sent) return;
      timer = setTimeout(() => {
        sent = current;
        props.onValue(current);
      }, debounceMs);
    });
    onBeforeUnmount(clear);

    return (): VNode =>
      h('input', {
        type: 'search',
        value: props.debounceMs > 0 ? text.value : props.value,
        onInput: (event: Event) => {
          const typed: string = (event.target as HTMLInputElement).value;
          if (props.debounceMs > 0) text.value = typed;
          else props.onValue(typed);
        },
      });
  },
  { name: 'QueryInput', props: ['value', 'debounceMs', 'onValue'] }
);

function sortGlyph(sort: DetailSort | undefined, column: string): VNode {
  if (sort?.column !== column)
    return h('span', { 'aria-hidden': 'true' }, ' ↕');
  return h(
    'span',
    { 'aria-hidden': 'true' },
    sort.direction === 'asc' ? ' ↑' : ' ↓'
  );
}

/**
 * The detail view of a widget: search and column filters, a sortable table
 * and paging, over data you give it (client mode: it filters, sorts and pages
 * in memory with `queryRows`). Controlled by `query`. Use it on its own as a
 * page, or inside `WidgetDetailDialog`.
 */
export const WidgetDetail = defineComponent(
  (props: WidgetDetailProps) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const id: string = useId();
    const exporting: Ref<boolean> = ref(false);

    return (): VNode => {
      const { labels, locale } = settings.value;
      const {
        title,
        data,
        query,
        onQueryChange,
        status = 'ok',
        mode = 'client',
        onExportAll,
        onExport,
        onExportError,
        exportFormats,
        widgetKey = '',
      } = props;
      const headingId: string = props.headingId ?? `${id}-title`;
      const localeTag: string | undefined =
        typeof locale === 'string' ? locale : locale?.[0];

      let page: DetailPage | undefined;
      let problem: string | undefined;
      if (status === 'ok' && data !== undefined) {
        const result =
          mode === 'server'
            ? serverPage(data, query)
            : queryRows(data, query, localeTag);
        if (result.ok) page = result.value;
        else problem = result.error;
      }

      const change = (patch: Partial<DetailQuery>): void =>
        onQueryChange({ ...query, ...patch, page: patch.page ?? 1 });

      const canExport: boolean =
        exportFormats?.includes('csv') === true &&
        (mode === 'client' || onExportAll !== undefined);

      const finishExport = (text: string): void => {
        const failure: string | null = deliverExportFile(
          csvExportFile(widgetKey, title, text),
          onExport
        );
        if (failure !== null) onExportError?.(failure);
      };

      const exportCsv = async (): Promise<void> => {
        if (data === undefined) return;
        if (mode === 'client') {
          const csv = queryToCsv(
            data,
            query,
            localeTag === undefined ? {} : { locale: localeTag }
          );
          if (csv.ok) finishExport(csv.value);
          else onExportError?.(csv.error);
          return;
        }
        if (onExportAll === undefined || page === undefined) return;
        exporting.value = true;
        try {
          const all: DetailData | undefined = await onExportAll({
            widgetKey,
            title,
            query: providerQuery({
              ...query,
              page: 1,
              pageSize: Math.max(1, page.totalRows),
            }),
            totalRows: page.totalRows,
          });
          // Undefined: the host saved the file itself.
          if (all === undefined) return;
          const csv = detailToCsv(hideColumns(all, query.hidden));
          if (csv.ok) finishExport(csv.value);
          else onExportError?.(csv.error);
        } catch (cause) {
          onExportError?.(
            `Could not export "${title}": ${cause instanceof Error ? cause.message : String(cause)}`
          );
        } finally {
          exporting.value = false;
        }
      };

      const inputDebounceMs: number =
        mode === 'server' ? SERVER_INPUT_DEBOUNCE_MS : 0;

      let body: VNodeChild;
      if (status === 'loading') {
        body = h(
          'p',
          { role: 'status', class: slot('status', 'dwt-status') },
          labels.loading
        );
      } else if (status === 'error' || problem !== undefined) {
        body = h('div', { role: 'alert', class: slot('error', 'dwt-error') }, [
          h('p', { class: 'dwt-error-message' }, props.error ?? problem ?? ''),
          props.onRetry === undefined
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  class: slot('button', 'dwt-button'),
                  onClick: props.onRetry,
                },
                labels.retry
              ),
        ]);
      } else if (data !== undefined && page !== undefined) {
        const shownPage: DetailPage = page;
        const columns: readonly DetailColumn[] = data.columns;
        const shownIndexes: readonly number[] = visibleColumnIndexes(
          data,
          query.hidden
        );
        const choices: readonly number[] = props.pageSizes ?? [];
        const from: number = (shownPage.page - 1) * query.pageSize + 1;
        const to: number = from + shownPage.rows.length - 1;
        const busy: boolean = props.busy ?? false;

        const controls: VNodeChild[] = [
          h('label', { class: 'dwt-detail-field' }, [
            h('span', labels.search),
            h(QueryInput, {
              value: query.search ?? '',
              debounceMs: inputDebounceMs,
              onValue: (search: string) => change({ search }),
            }),
          ]),
          ...columns
            .filter((column) => column.filterable === true)
            .map((column) =>
              h('label', { key: column.key, class: 'dwt-detail-field' }, [
                h('span', labels.filterBy(column.label)),
                h(QueryInput, {
                  value: query.filters?.[column.key] ?? '',
                  debounceMs: inputDebounceMs,
                  onValue: (text: string) =>
                    change({
                      filters: { ...query.filters, [column.key]: text },
                    }),
                }),
              ])
            ),
        ];
        if (choices.length >= 2) {
          const sizes: readonly number[] = choices.includes(query.pageSize)
            ? choices
            : [...choices, query.pageSize].sort((a, b) => a - b);
          controls.push(
            h('label', { class: 'dwt-detail-field' }, [
              h('span', labels.rowsPerPage),
              h(
                'select',
                {
                  onChange: (event: Event) => {
                    const pageSize: number = Number(
                      (event.target as HTMLSelectElement).value
                    );
                    // Keep the first row on screen: the page that holds it.
                    onQueryChange({
                      ...query,
                      pageSize,
                      page: Math.floor((from - 1) / pageSize) + 1,
                    });
                  },
                },
                sizes.map((size) =>
                  h(
                    'option',
                    {
                      key: size,
                      value: size,
                      selected: size === query.pageSize,
                    },
                    String(size)
                  )
                )
              ),
            ])
          );
        }
        if (props.columnVisibility === true && columns.length > 1) {
          controls.push(
            h('details', { class: 'dwt-detail-columns' }, [
              h('summary', labels.columnsMenu),
              h(
                'ul',
                columns.map((column, index) => {
                  const shown: boolean = shownIndexes.includes(index);
                  return h('li', { key: column.key }, [
                    h('label', [
                      h('input', {
                        type: 'checkbox',
                        checked: shown,
                        // The last visible column stays: a table needs one.
                        disabled: shown && shownIndexes.length === 1,
                        onChange: () => {
                          const hiddenKeys: string[] = (
                            query.hidden ?? []
                          ).filter((key) => key !== column.key);
                          if (shown) hiddenKeys.push(column.key);
                          const { hidden: _previous, ...rest } = query;
                          onQueryChange({
                            ...rest,
                            ...(hiddenKeys.length === 0
                              ? {}
                              : { hidden: hiddenKeys }),
                          });
                        },
                      }),
                      column.label,
                    ]),
                  ]);
                })
              ),
            ])
          );
        }
        if (canExport) {
          controls.push(
            h(
              'button',
              {
                type: 'button',
                class: slot('button', 'dwt-button', 'dwt-detail-export'),
                disabled: exporting.value || shownPage.totalRows === 0,
                onClick: () => void exportCsv(),
              },
              labels.downloadCsv(title)
            )
          );
        }

        const headerCells: VNodeChild[] = [];
        for (const columnIndex of shownIndexes) {
          const column: DetailColumn | undefined = columns[columnIndex];
          if (column === undefined) continue;
          const sorted: boolean = query.sort?.column === column.key;
          headerCells.push(
            h(
              'th',
              {
                key: column.key,
                scope: 'col',
                ...(column.numeric === true ? { class: 'dwt-numeric' } : {}),
                ...(sorted
                  ? {
                      'aria-sort':
                        query.sort?.direction === 'asc'
                          ? 'ascending'
                          : 'descending',
                    }
                  : {}),
              },
              column.sortable === false
                ? column.label
                : [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'dwt-detail-sort',
                        'aria-label': labels.sortBy(column.label),
                        onClick: () =>
                          onQueryChange(
                            withSort(query, nextSort(query.sort, column.key))
                          ),
                      },
                      [column.label, sortGlyph(query.sort, column.key)]
                    ),
                  ]
            )
          );
        }

        const rows: VNode[] = shownPage.rows.map((row, rowIndex) => {
          const cells: VNodeChild[] = [];
          for (const cellIndex of shownIndexes) {
            const cell: DetailCell | undefined = row[cellIndex];
            if (cell === undefined) continue;
            const column: DetailColumn | undefined = columns[cellIndex];
            cells.push(
              h(
                'td',
                {
                  key: cellIndex,
                  ...(column?.numeric === true ? { class: 'dwt-numeric' } : {}),
                },
                [
                  h(CellContent, {
                    widgetKey,
                    columnKey: column?.key ?? '',
                    column,
                    cell,
                    row,
                  }),
                ]
              )
            );
          }
          return h('tr', { key: rowIndex }, cells);
        });

        body = [
          h('div', { class: 'dwt-detail-controls' }, controls),
          h(
            'p',
            {
              class: 'dwt-detail-summary',
              role: 'status',
              'aria-live': 'polite',
              'aria-atomic': 'true',
            },
            shownPage.totalRows === 0
              ? labels.noResults
              : labels.showingRows(from, to, shownPage.totalRows)
          ),
          h(
            'div',
            {
              class: 'dwt-table-wrap',
              ...(busy ? { 'aria-busy': 'true', 'data-busy': 'true' } : {}),
            },
            [
              h(
                'table',
                { class: slot('table', 'dwt-table', 'dwt-detail-table') },
                [
                  h('caption', { class: 'dwt-visually-hidden' }, title),
                  h('thead', [h('tr', headerCells)]),
                  h('tbody', rows),
                ]
              ),
            ]
          ),
          shownPage.pageCount > 1
            ? h(
                'nav',
                { class: 'dwt-detail-pager', 'aria-label': labels.pagination },
                [
                  h(
                    'button',
                    {
                      type: 'button',
                      class: slot('button', 'dwt-button'),
                      disabled: shownPage.page <= 1,
                      onClick: () =>
                        onQueryChange({ ...query, page: shownPage.page - 1 }),
                    },
                    labels.previousPage
                  ),
                  h('span', labels.pageOf(shownPage.page, shownPage.pageCount)),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: slot('button', 'dwt-button'),
                      disabled: shownPage.page >= shownPage.pageCount,
                      onClick: () =>
                        onQueryChange({ ...query, page: shownPage.page + 1 }),
                    },
                    labels.nextPage
                  ),
                ]
              )
            : null,
        ];
      }

      return h(
        'section',
        {
          'aria-labelledby': headingId,
          class: slot('detail', 'dwt-detail', props.className),
        },
        [
          h(
            `h${props.headingLevel ?? 2}`,
            {
              id: headingId,
              class: slot('cardTitle', 'dwt-card-title', 'dwt-detail-title'),
            },
            title
          ),
          body,
        ]
      );
    };
  },
  {
    name: 'WidgetDetail',
    props: [
      'title',
      'widgetKey',
      'data',
      'query',
      'onQueryChange',
      'status',
      'error',
      'onRetry',
      'mode',
      'busy',
      'pageSizes',
      'columnVisibility',
      'headingLevel',
      'headingId',
      'exportFormats',
      'onExportAll',
      'onExport',
      'onExportError',
      'className',
    ],
  }
);

export interface WidgetDetailDialogProps {
  readonly title: string;
  readonly open: boolean;
  /** Called on Esc, the Close button and a click on the backdrop. */
  readonly onClose: () => void;
}

/**
 * A native modal `<dialog>`: focus is trapped, Esc closes it, the page behind
 * is inert, and focus returns to the control that opened it. The default slot
 * is the content, usually a `WidgetDetail`.
 */
export const WidgetDetailDialog = defineComponent(
  (props: WidgetDetailDialogProps, { slots }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const dialogRef: Ref<HTMLDialogElement | null> = ref(null);
    const titleId: string = useId();
    // What had focus when the dialog opened, so closing can give it back.
    let opener: Element | null = null;

    function show(): void {
      const dialog: HTMLDialogElement | null = dialogRef.value;
      if (dialog === null) return;
      opener = document.activeElement;
      // Without `showModal` (an old browser) the dialog stays in the page.
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    }
    function hide(): void {
      const dialog: HTMLDialogElement | null = dialogRef.value;
      if (dialog?.open === true && typeof dialog.close === 'function') {
        dialog.close();
      }
      if (opener instanceof HTMLElement) opener.focus();
      opener = null;
    }

    onMounted(() => {
      if (props.open) show();
    });
    watch(
      () => props.open,
      (open) => {
        if (open) void nextTick(show);
        else hide();
      }
    );
    onBeforeUnmount(() => {
      if (props.open) hide();
    });

    return (): VNode =>
      h(
        'dialog',
        {
          ref: dialogRef,
          class: 'dwt-detail-dialog',
          'aria-labelledby': titleId,
          onCancel: (event: Event) => {
            event.preventDefault();
            props.onClose();
          },
          onClick: (event: MouseEvent) => {
            if (event.target === dialogRef.value) props.onClose();
          },
        },
        props.open
          ? [
              h('div', { class: 'dwt-detail-dialog-body' }, [
                h(
                  'button',
                  {
                    type: 'button',
                    class: slot('button', 'dwt-button', 'dwt-detail-close'),
                    onClick: props.onClose,
                  },
                  settings.value.labels.close
                ),
                h(
                  'span',
                  { id: titleId, class: 'dwt-visually-hidden' },
                  props.title
                ),
                slots['default']?.(),
              ]),
            ]
          : []
      );
  },
  { name: 'WidgetDetailDialog', props: ['title', 'open', 'onClose'] }
);

const NO_OPTION_VALUES: OptionValues = Object.freeze({});

export interface UseDetailDataResult {
  readonly state: ShallowRef<DetailLoadState>;
  /** Runs the load again (the Retry button). */
  readonly reload: () => void;
}

/**
 * Loads a widget's detail data while `enabled`: calls `load` with an abort
 * signal (aborted on close, retry or unmount), validates the result and
 * reports loading, ok or error in `state`. When `load` is missing or returns
 * `undefined`, `fallback` (for example the card's own complete data) is used
 * instead. `reload` runs it again. Every input may be a ref or a getter (`load`
 * must be: give `() => loader`, because a bare function is read as a getter); a
 * new value restarts the load, so keep `load` and `fallback` stable.
 * `optionValues` (the widget's resolved options) go to the loader as
 * `options.options`, `filterValues` (the dashboard filters the widget uses) as
 * `options.filters`, and `view` (the view the card loads: `base` or a view the
 * provider supplies; a change reloads) as `options.view`.
 *
 * Pass `server` for `detail.mode: 'server'`: the loader receives the current
 * `query` and must return one page plus `totalRows`; each query change aborts
 * the request before it and asks again, keeping the previous page on screen
 * (`state.refreshing`). The card's own data is never used as a fallback.
 *
 * Loading starts after the component mounts, so server rendering starts
 * nothing and shows the loading state.
 */
export function useDetailData(
  definition: MaybeRefOrGetter<WidgetDefinition>,
  load: Ref<DetailLoader | undefined> | (() => DetailLoader | undefined),
  enabled: MaybeRefOrGetter<boolean>,
  fallback?: MaybeRefOrGetter<DetailData | undefined>,
  optionValues: MaybeRefOrGetter<OptionValues> = NO_OPTION_VALUES,
  server?: MaybeRefOrGetter<ServerDetailOptions | undefined>,
  filterValues: MaybeRefOrGetter<OptionValues> = NO_OPTION_VALUES,
  view: MaybeRefOrGetter<string> = BASE_VIEW_KEY
): UseDetailDataResult {
  // A function here is the getter of the loader, never the loader itself
  // (`toValue` would call it), so wrap a fixed loader as `() => loader`.
  const currentLoader = (): DetailLoader | undefined =>
    typeof load === 'function' ? load() : load.value;
  const state: ShallowRef<DetailLoadState> = shallowRef({ status: 'loading' });
  const attempt: Ref<number> = ref(0);
  const mounted: Ref<boolean> = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  // Server-mode pages already loaded for this open detail view. What they
  // answer depends on everything but the query, so any of those changing
  // (including a retry) starts a fresh cache.
  let pageCache: {
    scope: readonly unknown[];
    pages: DetailPageCache;
  } | null = null;
  let lastQuery: DetailQuery = toValue(server)?.query ?? defaultDetailQuery();

  // The inputs that restart the load, compared one by one: a getter that
  // returns a fresh array would look changed on every re-evaluation, which
  // would abort and restart the load whenever the dashboard re-renders.
  const inputs: ShallowRef<readonly unknown[]> = shallowRef([]);
  watchEffect(
    () => {
      const serverOptions: ServerDetailOptions | undefined = toValue(server);
      const next: readonly unknown[] = [
        mounted.value,
        toValue(enabled),
        currentLoader(),
        toValue(fallback),
        toValue(definition),
        toValue(optionValues),
        toValue(filterValues),
        toValue(view),
        attempt.value,
        serverOptions !== undefined,
        serverOptions === undefined
          ? ''
          : detailQuerySignature(serverOptions.query),
      ];
      const previous: readonly unknown[] = inputs.value;
      if (
        previous.length !== next.length ||
        next.some((value, index) => !Object.is(value, previous[index]))
      ) {
        inputs.value = next;
      }
    },
    { flush: 'sync' }
  );

  watch(
    inputs,
    (_next, _previous, onCleanup) => {
      if (!mounted.value || !toValue(enabled)) return;
      const controller = new AbortController();
      onCleanup(() => controller.abort());

      const serverOptions: ServerDetailOptions | undefined = toValue(server);
      const isServer: boolean = serverOptions !== undefined;
      lastQuery = serverOptions?.query ?? lastQuery;
      const query: DetailQuery = isServer
        ? providerQuery(lastQuery)
        : defaultDetailQuery();
      const loader: DetailLoader | undefined = currentLoader();
      const def: WidgetDefinition = toValue(definition);
      const options: OptionValues = toValue(optionValues);
      const filters: OptionValues = toValue(filterValues);
      const viewKey: string = toValue(view);
      const scope: readonly unknown[] = [
        loader,
        def,
        options,
        filters,
        viewKey,
        attempt.value,
      ];
      if (
        pageCache === null ||
        pageCache.scope.some((part, index) => part !== scope[index])
      ) {
        pageCache = { scope, pages: createDetailPageCache() };
      }
      const pages: DetailPageCache = pageCache.pages;
      // An earlier answer for this very query shows at once (busy, while the
      // provider is asked again); otherwise the previous page stays until the
      // new one arrives.
      const remembered: DetailData | undefined = isServer
        ? pages.get(query)
        : undefined;
      const previous: DetailLoadState = state.value;
      state.value =
        remembered !== undefined
          ? { status: 'ok', data: remembered, refreshing: true }
          : isServer && previous.data !== undefined
            ? { status: 'ok', data: previous.data, refreshing: true }
            : { status: 'loading' };

      Promise.resolve()
        .then(() =>
          loader === undefined
            ? undefined
            : loader(def, {
                signal: controller.signal,
                options,
                filters,
                view: viewKey,
                query,
              })
        )
        .then((raw) => {
          if (controller.signal.aborted) return;
          const data: DetailData | undefined = isServer
            ? raw
            : (raw ?? toValue(fallback));
          if (data === undefined) {
            state.value = {
              status: 'error',
              error: isServer
                ? `Widget "${def.key}" detail: no data. The widget is in server mode (detail.mode), so the loader must return one page of rows and totalRows for the query it is given.`
                : `Widget "${def.key}" detail: no data. The loader returned nothing for this widget and its card does not hold the full data (use a loader that returns rows, or a TABLE without a footer or a BAR_LIST).`,
            };
            return;
          }
          const checked = validateDetailData(
            data,
            `Widget "${def.key}" detail`,
            isServer ? { mode: 'server', pageSize: query.pageSize } : {}
          );
          if (checked.ok && isServer) pages.set(query, checked.value);
          state.value = checked.ok
            ? { status: 'ok', data: checked.value }
            : { status: 'error', error: checked.error };
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          state.value = {
            status: 'error',
            error: `Widget "${def.key}" detail: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
          };
        });
    },
    { immediate: true }
  );

  return {
    state,
    reload: (): void => {
      attempt.value += 1;
    },
  };
}
