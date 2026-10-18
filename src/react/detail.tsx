import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import {
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
  type DetailMode,
  type DetailPageCache,
  type DetailProviderOptions,
  type DetailPage,
  type DetailQuery,
  type DetailSort,
} from '../core/detail.js';
import type { WidgetDefinition } from '../core/definition.js';
import type { OptionValues } from '../core/options.js';
import { detailToCsv, queryToCsv } from '../core/export.js';
import { BASE_VIEW_KEY } from '../core/views.js';
import { CellContent } from './cells.js';
import {
  csvExportFile,
  deliverExportFile,
  type DetailExportRequest,
  type ExportFile,
  type ExportFormat,
} from './download.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

/**
 * Loads a widget's full detail data. Close over your own context (a Prisma
 * client, a fetch) here; the package never fetches. See `DetailProvider`.
 * Return `undefined` for a widget you have no extra data for: the card's own
 * data is used when it is complete (see `deriveDetailData`).
 */
export type DetailLoader = (
  definition: WidgetDefinition,
  options: DetailProviderOptions
) => DetailData | undefined | Promise<DetailData | undefined>;

export interface WidgetDetailProps {
  /** Table caption: the widget's title. */
  readonly title: string;
  /** The widget's key, passed to `custom` column formatters. */
  readonly widgetKey?: string;
  /** The rows to show. Absent while `status` is `loading` or `error`. */
  readonly data?: DetailData;
  /** Controlled: you own the query, so you can keep it in the URL. */
  readonly query: DetailQuery;
  readonly onQueryChange: (query: DetailQuery) => void;
  /** Default `ok`. */
  readonly status?: 'ok' | 'loading' | 'error';
  readonly error?: string;
  readonly onRetry?: () => void;
  /**
   * `client` (default): `data` holds every row and this component filters,
   * sorts and pages it. `server`: `data` is the one page your provider
   * returned for `query` (with `totalRows`); this component only shows it and
   * reports changes through `onQueryChange`. Typing in the search and filter
   * boxes waits `SERVER_INPUT_DEBOUNCE_MS` after the last key.
   */
  readonly mode?: DetailMode;
  /** True while a new page is loading: the old rows stay, marked busy. */
  readonly busy?: boolean;
  /**
   * Rows-per-page choices. Two or more adds a "Rows per page" select; the
   * choice goes into `query.pageSize` (and back to page 1's position).
   */
  readonly pageSizes?: readonly number[];
  /** Adds a "Columns" menu; hidden columns go into `query.hidden`. */
  readonly columnVisibility?: boolean;
  /** Heading level of the title, 2 to 6. Default 2. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Id of the heading, so a dialog can label itself with it. */
  readonly headingId?: string;
  /**
   * Adds a "Download CSV" button (`['csv']`). In client mode the file holds
   * every row the search, filters and sort select, not only the page shown.
   * In server mode the button needs `onExportAll`, because the page on screen
   * is all this component has.
   */
  readonly exportFormats?: readonly ExportFormat[];
  /** Server mode: gets all rows matching the query. See `DashboardProps.onExportDetail`. */
  readonly onExportAll?: (
    request: DetailExportRequest
  ) => DetailData | undefined | Promise<DetailData | undefined>;
  /** Receives the file instead of the browser downloading it. */
  readonly onExport?: (file: ExportFile) => void;
  /** Called with a readable message when an export fails. */
  readonly onExportError?: (message: string) => void;
  readonly className?: string;
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

/** How long server mode waits after the last key before asking again. */
export const SERVER_INPUT_DEBOUNCE_MS = 300;

/**
 * A search box. With `debounceMs` above 0 it keeps what is typed locally and
 * reports it after that pause (so a server is not asked on every key); a
 * value that changes from outside replaces the text.
 */
function QueryInput({
  value,
  debounceMs,
  onValue,
}: {
  readonly value: string;
  readonly debounceMs: number;
  readonly onValue: (value: string) => void;
}): ReactNode {
  const [text, setText] = useState<string>(value);
  const latest = useRef<(value: string) => void>(onValue);
  latest.current = onValue;
  const sent = useRef<string>(value);

  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (debounceMs <= 0 || text === sent.current) return undefined;
    const timer = setTimeout(() => {
      sent.current = text;
      latest.current(text);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [text, debounceMs]);

  return (
    <input
      type="search"
      value={debounceMs > 0 ? text : value}
      onChange={(event) => {
        if (debounceMs > 0) setText(event.target.value);
        else onValue(event.target.value);
      }}
    />
  );
}

function SortGlyph({
  sort,
  column,
}: {
  readonly sort: DetailSort | undefined;
  readonly column: string;
}): ReactNode {
  if (sort?.column !== column) return <span aria-hidden="true"> ↕</span>;
  return (
    <span aria-hidden="true">{sort.direction === 'asc' ? ' ↑' : ' ↓'}</span>
  );
}

function Cell({
  cell,
  column,
  row,
  widgetKey,
}: {
  readonly cell: DetailCell;
  readonly column: DetailColumn | undefined;
  readonly row: readonly DetailCell[];
  readonly widgetKey: string;
}): ReactNode {
  return (
    <td className={column?.numeric === true ? 'dwt-numeric' : undefined}>
      <CellContent
        widgetKey={widgetKey}
        columnKey={column?.key ?? ''}
        column={column}
        cell={cell}
        row={row}
      />
    </td>
  );
}

/**
 * The detail view of a widget: search and column filters, a sortable table
 * and paging, over data you give it (client mode: it filters, sorts and pages
 * in memory with `queryRows`). Controlled by `query`. Use it on its own as a
 * page, or inside `WidgetDetailDialog`.
 */
export function WidgetDetail({
  title,
  data,
  query,
  onQueryChange,
  status = 'ok',
  error,
  onRetry,
  mode = 'client',
  busy = false,
  pageSizes,
  columnVisibility = false,
  headingLevel = 2,
  headingId,
  exportFormats,
  onExportAll,
  onExport,
  onExportError,
  className,
  widgetKey = '',
}: WidgetDetailProps): ReactNode {
  const slot = useSlotClassName();
  const { labels, locale } = useWidgetSettings();
  const id: string = useId();
  const Heading = `h${headingLevel}` as const;
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

  function change(patch: Partial<DetailQuery>): void {
    onQueryChange({ ...query, ...patch, page: patch.page ?? 1 });
  }

  const [exporting, setExporting] = useState<boolean>(false);
  const canExport: boolean =
    exportFormats?.includes('csv') === true &&
    (mode === 'client' || onExportAll !== undefined);

  function finishExport(text: string): void {
    const failure: string | null = deliverExportFile(
      csvExportFile(widgetKey, title, text),
      onExport
    );
    if (failure !== null) onExportError?.(failure);
  }

  async function exportCsv(): Promise<void> {
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
    setExporting(true);
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
      setExporting(false);
    }
  }

  const inputDebounceMs: number =
    mode === 'server' ? SERVER_INPUT_DEBOUNCE_MS : 0;

  let body: ReactNode;
  if (status === 'loading') {
    body = (
      <p role="status" className={slot('status', 'dwt-status')}>
        {labels.loading}
      </p>
    );
  } else if (status === 'error' || problem !== undefined) {
    body = (
      <div role="alert" className={slot('error', 'dwt-error')}>
        <p className="dwt-error-message">{error ?? problem ?? ''}</p>
        {onRetry !== undefined && (
          <button
            type="button"
            className={slot('button', 'dwt-button')}
            onClick={onRetry}
          >
            {labels.retry}
          </button>
        )}
      </div>
    );
  } else if (data !== undefined && page !== undefined) {
    const columns: readonly DetailColumn[] = data.columns;
    const shownIndexes: readonly number[] = visibleColumnIndexes(
      data,
      query.hidden
    );
    const choices: readonly number[] = pageSizes ?? [];
    const from: number = (page.page - 1) * query.pageSize + 1;
    const to: number = from + page.rows.length - 1;
    body = (
      <>
        <div className="dwt-detail-controls">
          <label className="dwt-detail-field">
            <span>{labels.search}</span>
            <QueryInput
              value={query.search ?? ''}
              debounceMs={inputDebounceMs}
              onValue={(search) => change({ search })}
            />
          </label>
          {columns
            .filter((column) => column.filterable === true)
            .map((column) => (
              <label key={column.key} className="dwt-detail-field">
                <span>{labels.filterBy(column.label)}</span>
                <QueryInput
                  value={query.filters?.[column.key] ?? ''}
                  debounceMs={inputDebounceMs}
                  onValue={(text) =>
                    change({
                      filters: { ...query.filters, [column.key]: text },
                    })
                  }
                />
              </label>
            ))}
          {choices.length >= 2 && (
            <label className="dwt-detail-field">
              <span>{labels.rowsPerPage}</span>
              <select
                value={query.pageSize}
                onChange={(event) => {
                  const pageSize: number = Number(event.target.value);
                  // Keep the first row on screen: the page that holds it.
                  onQueryChange({
                    ...query,
                    pageSize,
                    page: Math.floor((from - 1) / pageSize) + 1,
                  });
                }}
              >
                {(choices.includes(query.pageSize)
                  ? choices
                  : [...choices, query.pageSize].sort((a, b) => a - b)
                ).map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          )}
          {columnVisibility && columns.length > 1 && (
            <details className="dwt-detail-columns">
              <summary>{labels.columnsMenu}</summary>
              <ul>
                {columns.map((column, index) => {
                  const shown: boolean = shownIndexes.includes(index);
                  return (
                    <li key={column.key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={shown}
                          // The last visible column stays: a table needs one.
                          disabled={shown && shownIndexes.length === 1}
                          onChange={() => {
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
                          }}
                        />
                        {column.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {canExport && (
            <button
              type="button"
              className={slot('button', 'dwt-button', 'dwt-detail-export')}
              disabled={exporting || page.totalRows === 0}
              onClick={() => void exportCsv()}
            >
              {labels.downloadCsv(title)}
            </button>
          )}
        </div>
        <p
          className="dwt-detail-summary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {page.totalRows === 0
            ? labels.noResults
            : labels.showingRows(from, to, page.totalRows)}
        </p>
        <div
          className="dwt-table-wrap"
          aria-busy={busy ? 'true' : undefined}
          data-busy={busy ? 'true' : undefined}
        >
          <table className={slot('table', 'dwt-table', 'dwt-detail-table')}>
            <caption className="dwt-visually-hidden">{title}</caption>
            <thead>
              <tr>
                {shownIndexes.map((columnIndex) => {
                  const column: DetailColumn | undefined = columns[columnIndex];
                  if (column === undefined) return null;
                  const sorted: boolean = query.sort?.column === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={
                        column.numeric === true ? 'dwt-numeric' : undefined
                      }
                      aria-sort={
                        sorted
                          ? query.sort?.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {column.sortable === false ? (
                        column.label
                      ) : (
                        <button
                          type="button"
                          className="dwt-detail-sort"
                          aria-label={labels.sortBy(column.label)}
                          onClick={() =>
                            onQueryChange(
                              withSort(query, nextSort(query.sort, column.key))
                            )
                          }
                        >
                          {column.label}
                          <SortGlyph sort={query.sort} column={column.key} />
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {shownIndexes.map((cellIndex) => {
                    const cell: DetailCell | undefined = row[cellIndex];
                    return cell === undefined ? null : (
                      <Cell
                        key={cellIndex}
                        cell={cell}
                        column={columns[cellIndex]}
                        row={row}
                        widgetKey={widgetKey}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {page.pageCount > 1 && (
          <nav className="dwt-detail-pager" aria-label={labels.pagination}>
            <button
              type="button"
              className={slot('button', 'dwt-button')}
              disabled={page.page <= 1}
              onClick={() => onQueryChange({ ...query, page: page.page - 1 })}
            >
              {labels.previousPage}
            </button>
            <span>{labels.pageOf(page.page, page.pageCount)}</span>
            <button
              type="button"
              className={slot('button', 'dwt-button')}
              disabled={page.page >= page.pageCount}
              onClick={() => onQueryChange({ ...query, page: page.page + 1 })}
            >
              {labels.nextPage}
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby={headingId ?? `${id}-title`}
      className={slot('detail', 'dwt-detail', className)}
    >
      <Heading
        id={headingId ?? `${id}-title`}
        className={slot('cardTitle', 'dwt-card-title', 'dwt-detail-title')}
      >
        {title}
      </Heading>
      {body}
    </section>
  );
}

export interface WidgetDetailDialogProps {
  readonly title: string;
  readonly open: boolean;
  /** Called on Esc, the Close button and a click on the backdrop. */
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A native modal `<dialog>`: focus is trapped, Esc closes it, the page behind
 * is inert, and focus returns to the control that opened it.
 */
export function WidgetDetailDialog({
  title,
  open,
  onClose,
  children,
}: WidgetDetailDialogProps): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const dialogRef: RefObject<HTMLDialogElement | null> =
    useRef<HTMLDialogElement>(null);
  const titleId: string = useId();

  useEffect(() => {
    const dialog: HTMLDialogElement | null = dialogRef.current;
    if (dialog === null || !open) return undefined;
    // Remember what had focus so closing (or unmounting) can give it back.
    const opener: Element | null = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dwt-detail-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      {open && (
        <div className="dwt-detail-dialog-body">
          <button
            type="button"
            className={slot('button', 'dwt-button', 'dwt-detail-close')}
            onClick={onClose}
          >
            {labels.close}
          </button>
          <span id={titleId} className="dwt-visually-hidden">
            {title}
          </span>
          {children}
        </div>
      )}
    </dialog>
  );
}

const NO_OPTION_VALUES: OptionValues = Object.freeze({});

export interface DetailLoadState {
  readonly status: 'loading' | 'ok' | 'error';
  readonly data?: DetailData;
  readonly error?: string;
  /**
   * Server mode: a new query is loading and `data` is still the previous
   * page. Show it as busy instead of replacing it with a spinner.
   */
  readonly refreshing?: boolean;
}

/** Server-mode inputs for `useDetailData`. */
export interface ServerDetailOptions {
  /** The current query. Every change asks the loader again. */
  readonly query: DetailQuery;
}

/**
 * Loads a widget's detail data while `enabled`: calls `load` with an abort
 * signal (aborted on close, retry or unmount), validates the result and
 * reports loading, ok or error. When `load` is missing or returns
 * `undefined`, `fallback` (for example the card's own complete data) is used
 * instead. `reload` runs it again. Keep `load` and `fallback` referentially
 * stable (`useCallback` / `useMemo`): a new value restarts the load.
 * `optionValues` (the widget's resolved options) go to the loader as
 * `options.options`, `filterValues` (the dashboard filters the widget uses) as
 * `options.filters`, and `view` (the view the card loads: `base` or a view the
 * provider supplies; a change reloads) as `options.view`.
 *
 * Pass `server` for `detail.mode: 'server'`: the loader receives the current
 * `query` and must return one page plus `totalRows`; each query change aborts
 * the request before it and asks again, keeping the previous page on screen
 * (`state.refreshing`). The card's own data is never used as a fallback.
 */
export function useDetailData(
  definition: WidgetDefinition,
  load: DetailLoader | undefined,
  enabled: boolean,
  fallback?: DetailData,
  optionValues: OptionValues = NO_OPTION_VALUES,
  server?: ServerDetailOptions,
  filterValues: OptionValues = NO_OPTION_VALUES,
  view: string = BASE_VIEW_KEY
): { readonly state: DetailLoadState; readonly reload: () => void } {
  const [state, setState] = useState<DetailLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const isServer: boolean = server !== undefined;
  const queryRef = useRef<DetailQuery>(server?.query ?? defaultDetailQuery());
  queryRef.current = server?.query ?? queryRef.current;
  // Server-mode pages already loaded for this open detail view. What they
  // answer depends on everything but the query, so any of those changing
  // (including a retry) starts a fresh cache.
  const pageCache = useRef<{
    scope: readonly unknown[];
    pages: DetailPageCache;
  } | null>(null);
  const querySignature: string = useMemo(
    () => (server === undefined ? '' : detailQuerySignature(server.query)),
    [server]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const query: DetailQuery = isServer
      ? providerQuery(queryRef.current)
      : defaultDetailQuery();
    const scope: readonly unknown[] = [
      load,
      definition,
      optionValues,
      filterValues,
      view,
      attempt,
    ];
    if (
      pageCache.current === null ||
      pageCache.current.scope.some((part, index) => part !== scope[index])
    ) {
      pageCache.current = { scope, pages: createDetailPageCache() };
    }
    const pages: DetailPageCache = pageCache.current.pages;
    // An earlier answer for this very query shows at once (busy, while the
    // provider is asked again); otherwise the previous page stays until the
    // new one arrives.
    const remembered: DetailData | undefined = isServer
      ? pages.get(query)
      : undefined;
    setState((previous) =>
      remembered !== undefined
        ? { status: 'ok', data: remembered, refreshing: true }
        : isServer && previous.data !== undefined
          ? { status: 'ok', data: previous.data, refreshing: true }
          : { status: 'loading' }
    );
    Promise.resolve()
      .then(() =>
        load === undefined
          ? undefined
          : load(definition, {
              signal: controller.signal,
              options: optionValues,
              filters: filterValues,
              view,
              query,
            })
      )
      .then((raw) => {
        if (controller.signal.aborted) return;
        const data: DetailData | undefined = isServer ? raw : (raw ?? fallback);
        if (data === undefined) {
          setState({
            status: 'error',
            error: isServer
              ? `Widget "${definition.key}" detail: no data. The widget is in server mode (detail.mode), so the loader must return one page of rows and totalRows for the query it is given.`
              : `Widget "${definition.key}" detail: no data. The loader returned nothing for this widget and its card does not hold the full data (use a loader that returns rows, or a TABLE without a footer or a BAR_LIST).`,
          });
          return;
        }
        const checked = validateDetailData(
          data,
          `Widget "${definition.key}" detail`,
          isServer ? { mode: 'server', pageSize: query.pageSize } : {}
        );
        if (checked.ok && isServer) pages.set(query, checked.value);
        setState(
          checked.ok
            ? { status: 'ok', data: checked.value }
            : { status: 'error', error: checked.error }
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: `Widget "${definition.key}" detail: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        });
      });
    return () => controller.abort();
  }, [
    enabled,
    load,
    fallback,
    definition,
    optionValues,
    filterValues,
    view,
    attempt,
    isServer,
    querySignature,
  ]);

  return { state, reload: () => setAttempt((count) => count + 1) };
}
