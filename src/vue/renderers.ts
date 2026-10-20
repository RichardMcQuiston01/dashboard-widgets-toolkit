import {
  defineComponent,
  h,
  ref,
  useId,
  type Ref,
  type VNode,
  type VNodeChild,
} from 'vue';

import { cellField } from '../core/fields.js';
import {
  queryRows,
  tableDetailData,
  type DetailPage,
  type DetailQuery,
  type DetailSort,
  type ResolvedTableControls,
} from '../core/detail.js';
import {
  formatValue,
  kpiDelta,
  shareOf,
  type KpiDelta,
} from '../core/format.js';
import type {
  AlertListWidgetData,
  BarListWidgetData,
  GaugeWidgetData,
  KpiWidgetData,
  TableCell,
  TableWidgetData,
  TextWidgetData,
  WidgetData,
} from '../core/payload.js';
import { CHART_COLORS, seriesColor } from '../core/palette.js';
import type { SelectionTarget } from '../core/select.js';
import { CellContent } from './cells.js';
import { GraphWidget } from './charts.js';
import { Thumbnail, WidgetLink } from './primitives.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

type SelectHandler = ((target: SelectionTarget) => void) | undefined;

/** TEXT: a headline value and its label. */
export const TextWidget = defineComponent(
  (props: { readonly data: TextWidgetData }) => {
    const slot = useSlotClassName();
    return (): VNode =>
      h('div', { class: slot('text', 'dwt-text') }, [
        h('p', { class: 'dwt-figure' }, props.data.value),
        h('p', { class: 'dwt-figure-label' }, props.data.label),
      ]);
  },
  { name: 'TextWidget', props: ['data'] }
);

const DELTA_ARROWS: Readonly<Record<KpiDelta['direction'], string>> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

/**
 * KPI: a stat tile. The change against the previous period carries an arrow
 * and signed text as well as color, so it never relies on color alone.
 */
export const KpiWidget = defineComponent(
  (props: { readonly data: KpiWidgetData }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { data } = props;
      const { locale, labels } = settings.value;
      const value: string = formatValue(data.value, data.format, {
        locale,
        ...(data.currency === undefined ? {} : { currency: data.currency }),
      });
      const delta: KpiDelta | null = kpiDelta(data.value, data.previous, {
        locale,
        comparisonLabel: labels.comparison,
        ...(data.higherIsBetter === undefined
          ? {}
          : { higherIsBetter: data.higherIsBetter }),
      });
      const meta: VNode[] = [];
      if (delta !== null) {
        meta.push(
          h(
            'span',
            {
              class: `dwt-delta dwt-delta--${delta.sentiment} dwt-delta--${delta.direction}`,
            },
            [
              h(
                'span',
                { 'aria-hidden': 'true', class: 'dwt-delta-arrow' },
                DELTA_ARROWS[delta.direction]
              ),
              ' ',
              delta.text,
              h(
                'span',
                { class: 'dwt-delta-comparison' },
                ` vs ${labels.comparison}`
              ),
            ]
          )
        );
      }
      if (data.hint !== undefined) {
        meta.push(h('span', { class: 'dwt-hint' }, data.hint));
      }
      return h('div', { class: slot('kpi', 'dwt-kpi') }, [
        h('p', { class: 'dwt-figure-label' }, data.label),
        h('p', { class: 'dwt-figure' }, value),
        meta.length > 0 ? h('p', { class: 'dwt-kpi-meta' }, meta) : null,
      ]);
    };
  },
  { name: 'KpiWidget', props: ['data'] }
);

/** GAUGE: a meter whose track is a lighter step of the fill's own hue. */
export const GaugeWidget = defineComponent(
  (props: { readonly data: GaugeWidgetData }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { data } = props;
      const { locale } = settings.value;
      const max: number = data.max > 0 ? data.max : 1;
      const percent: number = Math.max(
        0,
        Math.min(100, (data.value / max) * 100)
      );
      return h('div', { class: slot('gauge', 'dwt-gauge') }, [
        h(
          'div',
          {
            class: 'dwt-meter',
            role: 'meter',
            'aria-valuemin': 0,
            'aria-valuemax': max,
            'aria-valuenow': data.value,
            'aria-label': data.label,
            style: { background: CHART_COLORS.meterTrack },
          },
          [
            h('div', {
              class: 'dwt-meter-fill',
              style: { width: `${percent}%`, background: seriesColor(0) },
            }),
          ]
        ),
        h('p', { class: 'dwt-gauge-caption' }, [
          h('span', { class: 'dwt-gauge-value' }, [
            `${formatValue(data.value, 'number', { locale })} / ${formatValue(max, 'number', { locale })}`,
          ]),
          ' ',
          h('span', { class: 'dwt-figure-label' }, data.label),
        ]),
      ]);
    };
  },
  { name: 'GaugeWidget', props: ['data'] }
);

/** Whether a click landed on the row itself or on its select button, not on a link or control. */
function isPlainClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  const control: Element | null = target.closest(
    'a, button, input, select, textarea, summary, label'
  );
  return control === null || control.classList.contains('dwt-select');
}

/** The first cell that can hold the select button: plain text or a color, not a link. */
function selectButtonCell(
  data: TableWidgetData,
  row: readonly TableCell[]
): number {
  return row.findIndex((cell, index) => {
    if (cell.href !== undefined) return false;
    const column = data.columns[index];
    const kind: string =
      column === undefined ? 'text' : cellField(column, cell).kind;
    return kind === 'text' || kind === 'color';
  });
}

interface TableViewProps {
  readonly data: TableWidgetData;
  readonly widgetKey: string;
  readonly onSelect?: SelectHandler;
  readonly rows?: TableWidgetData['rows'] | undefined;
  readonly sort?: DetailSort | undefined;
  /** Makes the headers sort buttons. */
  readonly onSort?: ((columnKey: string) => void) | undefined;
}

const TableView = defineComponent(
  (props: TableViewProps) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { data, widgetKey, onSelect, sort, onSort } = props;
      const rows: TableWidgetData['rows'] = props.rows ?? data.rows;
      const { labels } = settings.value;
      // Sorting and search reorder `rows`; a selection reports the place in the payload.
      const originalIndex = new Map<readonly TableCell[], number>(
        data.rows.map((row, index) => [row, index])
      );
      return h('table', { class: slot('table', 'dwt-table') }, [
        h('thead', [
          h(
            'tr',
            data.columns.map((column, index) => {
              const key = `c${index}`;
              const sorted: boolean = sort?.column === key;
              return h(
                'th',
                {
                  scope: 'col',
                  ...(column.numeric === true ? { class: 'dwt-numeric' } : {}),
                  'aria-sort': sorted
                    ? sort?.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined,
                },
                onSort === undefined
                  ? column.label
                  : [
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'dwt-detail-sort',
                          'aria-label': labels.sortBy(column.label),
                          onClick: () => onSort(key),
                        },
                        [
                          column.label,
                          h(
                            'span',
                            { 'aria-hidden': 'true' },
                            !sorted
                              ? ' ↕'
                              : sort?.direction === 'asc'
                                ? ' ↑'
                                : ' ↓'
                          ),
                        ]
                      ),
                    ]
              );
            })
          ),
        ]),
        h(
          'tbody',
          rows.map((row, rowIndex) => {
            // The first plain cell gets the button that makes the row
            // reachable by keyboard; a click anywhere else on the row works too.
            const buttonCell: number =
              onSelect === undefined ? -1 : selectButtonCell(data, row);
            const original: number = originalIndex.get(row) ?? rowIndex;
            return h(
              'tr',
              onSelect === undefined
                ? {}
                : {
                    class: 'dwt-selectable',
                    onClick: (event: MouseEvent) => {
                      if (isPlainClick(event.target)) {
                        onSelect({ type: 'row', index: original, cells: row });
                      }
                    },
                  },
              row.map((cell, cellIndex) => {
                const content: VNode = h(CellContent, {
                  widgetKey,
                  columnKey: `c${cellIndex}`,
                  column: data.columns[cellIndex],
                  cell,
                  row,
                });
                return h(
                  'td',
                  data.columns[cellIndex]?.numeric === true
                    ? { class: 'dwt-numeric' }
                    : {},
                  cellIndex === buttonCell
                    ? [
                        h('button', { type: 'button', class: 'dwt-select' }, [
                          content,
                        ]),
                      ]
                    : [content]
                );
              })
            );
          })
        ),
      ]);
    };
  },
  {
    name: 'TableView',
    props: ['data', 'widgetKey', 'onSelect', 'rows', 'sort', 'onSort'],
  }
);

/** Next sort for a click on a header: ascending, descending, then none. */
function nextTableSort(
  current: DetailSort | undefined,
  column: string
): DetailSort | undefined {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc'
    ? { column, direction: 'desc' }
    : undefined;
}

interface TableWidgetProps {
  readonly data: TableWidgetData;
  /** Makes rows selectable; the target's `index` is the row's place in `data.rows`. */
  readonly onSelect?: SelectHandler;
  /** The widget's key, passed to `custom` column formatters. */
  readonly widgetKey?: string | undefined;
  /** Search box and sortable headers; see `WidgetDefinition.tableControls`. */
  readonly controls?: ResolvedTableControls | undefined;
  /** The header sort to start with, for example from a `sort` option. */
  readonly initialSort?: DetailSort | undefined;
}

const InteractiveTable = defineComponent(
  (props: TableWidgetProps & { readonly controls: ResolvedTableControls }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const searchId: string = useId();
    const search: Ref<string> = ref('');
    const sort: Ref<DetailSort | undefined> = ref(props.initialSort);
    let seededWith: string = seedOf(props.initialSort);
    return (): VNode => {
      const { data, controls, onSelect } = props;
      const { labels, locale } = settings.value;
      // A changed sort option replaces the header sort.
      const seed: string = seedOf(props.initialSort);
      if (seededWith !== seed) {
        seededWith = seed;
        sort.value = props.initialSort;
      }
      const localeTag: string | undefined =
        typeof locale === 'string' ? locale : locale?.[0];
      const query: DetailQuery = {
        page: 1,
        pageSize: Math.max(1, data.rows.length),
        ...(controls.search && search.value !== ''
          ? { search: search.value }
          : {}),
        ...(controls.sort && sort.value !== undefined
          ? { sort: sort.value }
          : {}),
      };
      const result = queryRows(tableDetailData(data), query, localeTag);
      const page: DetailPage | undefined = result.ok ? result.value : undefined;
      const body: VNodeChild[] = [];
      if (controls.search) {
        body.push(
          h('div', { class: 'dwt-table-search' }, [
            h(
              'label',
              { for: searchId, class: 'dwt-visually-hidden' },
              labels.search
            ),
            h('input', {
              id: searchId,
              type: 'search',
              placeholder: labels.search,
              value: search.value,
              onInput: (event: Event) => {
                search.value = (event.target as HTMLInputElement).value;
              },
            }),
          ])
        );
      }
      if (result.ok) {
        body.push(
          h(
            'p',
            {
              class: 'dwt-visually-hidden',
              role: 'status',
              'aria-live': 'polite',
              'aria-atomic': 'true',
            },
            page !== undefined && page.totalRows === 0
              ? labels.noResults
              : page === undefined
                ? ''
                : labels.showingRows(1, page.rows.length, page.totalRows)
          ),
          h(TableView, {
            data,
            widgetKey: props.widgetKey ?? '',
            onSelect,
            rows: page?.rows ?? data.rows,
            sort: sort.value,
            onSort: controls.sort
              ? (column: string) => {
                  sort.value = nextTableSort(sort.value, column);
                }
              : undefined,
          })
        );
        if (page !== undefined && page.totalRows === 0) {
          body.push(h('p', { class: 'dwt-note' }, labels.noResults));
        }
      } else {
        body.push(
          h(
            'p',
            { role: 'alert', class: slot('error', 'dwt-error') },
            result.error
          )
        );
      }
      if (data.footer !== undefined) {
        body.push(h('p', { class: 'dwt-note' }, data.footer));
      }
      return h('div', { class: 'dwt-table-wrap' }, body);
    };
  },
  {
    name: 'InteractiveTable',
    props: ['data', 'controls', 'initialSort', 'widgetKey', 'onSelect'],
  }
);

function seedOf(initialSort: DetailSort | undefined): string {
  return initialSort === undefined
    ? ''
    : `${initialSort.column}:${initialSort.direction}`;
}

/** TABLE: a data table; cells with a safe `href` become links. */
export const TableWidget = defineComponent(
  (props: TableWidgetProps) => (): VNode => {
    const { data, controls, initialSort, onSelect } = props;
    const widgetKey: string = props.widgetKey ?? '';
    if (controls === undefined) {
      return h('div', { class: 'dwt-table-wrap' }, [
        h(TableView, { data, widgetKey, onSelect }),
        data.footer !== undefined
          ? h('p', { class: 'dwt-note' }, data.footer)
          : null,
      ]);
    }
    return h(InteractiveTable, {
      data,
      controls,
      initialSort,
      widgetKey,
      onSelect,
    });
  },
  {
    name: 'TableWidget',
    props: ['data', 'controls', 'initialSort', 'widgetKey', 'onSelect'],
  }
);

/**
 * BAR_LIST: labelled horizontal bars. One series, so one color (slot 1)
 * for every bar; the value text sits beside the bar, never inside it.
 */
export const BarListWidget = defineComponent(
  (props: {
    readonly data: BarListWidgetData;
    readonly onSelect?: SelectHandler;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { data, onSelect } = props;
      const { locale } = settings.value;
      const denominator: number =
        data.total !== undefined && data.total > 0
          ? data.total
          : Math.max(0, ...data.items.map((item) => item.value));
      return h(
        'ul',
        { class: slot('barList', 'dwt-bar-list') },
        data.items.map((item, index) => {
          const width: number =
            denominator > 0
              ? Math.max(0, Math.min(100, (item.value / denominator) * 100))
              : 0;
          const display: string =
            item.display ??
            (data.total !== undefined
              ? `${formatValue(item.value, 'number', { locale })} (${shareOf(item.value, data.total)}%)`
              : formatValue(item.value, 'number', { locale }));
          return h(
            'li',
            {
              key: `${index}-${item.label}`,
              class:
                onSelect === undefined
                  ? 'dwt-bar-row'
                  : 'dwt-bar-row dwt-selectable',
              ...(onSelect === undefined
                ? {}
                : { onClick: () => onSelect({ type: 'bar', index, item }) }),
            },
            [
              h(
                'span',
                { class: 'dwt-bar-label' },
                onSelect === undefined
                  ? item.label
                  : [
                      h(
                        'button',
                        { type: 'button', class: 'dwt-select' },
                        item.label
                      ),
                    ]
              ),
              h('span', { class: 'dwt-bar-value' }, display),
              h(
                'span',
                {
                  class: 'dwt-bar-track',
                  'aria-hidden': 'true',
                  style: { background: CHART_COLORS.barTrack },
                },
                [
                  h('span', {
                    class: 'dwt-bar-fill',
                    style: { width: `${width}%`, background: seriesColor(0) },
                  }),
                ]
              ),
            ]
          );
        })
      );
    };
  },
  { name: 'BarListWidget', props: ['data', 'onSelect'] }
);

/** ALERT_LIST: rows needing attention, with thumbnail, link and value. */
export const AlertListWidget = defineComponent(
  (props: {
    readonly data: AlertListWidgetData;
    readonly onSelect?: SelectHandler;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { data, onSelect } = props;
      const { labels } = settings.value;
      if (data.items.length === 0) {
        return h('p', { class: slot('empty', 'dwt-empty') }, data.emptyText);
      }
      const more: number = data.total - data.items.length;
      return h('div', [
        h(
          'ul',
          { class: slot('alertList', 'dwt-alert-list') },
          data.items.map((item, index) => {
            const selectable: boolean =
              onSelect !== undefined && item.href === undefined;
            return h(
              'li',
              {
                key: `${index}-${item.title}`,
                class: selectable
                  ? 'dwt-alert-row dwt-selectable'
                  : 'dwt-alert-row',
                ...(selectable && onSelect !== undefined
                  ? { onClick: () => onSelect({ type: 'alert', index, item }) }
                  : {}),
              },
              [
                h(Thumbnail, { url: item.thumbnailUrl }),
                h('span', { class: 'dwt-alert-main' }, [
                  selectable
                    ? h(
                        'button',
                        { type: 'button', class: 'dwt-select dwt-alert-title' },
                        item.title
                      )
                    : h(
                        WidgetLink,
                        { href: item.href, className: 'dwt-alert-title' },
                        () => item.title
                      ),
                  item.detail !== undefined
                    ? h('span', { class: 'dwt-alert-detail' }, item.detail)
                    : null,
                ]),
                h('span', { class: 'dwt-alert-value' }, item.valueLabel),
              ]
            );
          })
        ),
        more > 0 ? h('p', { class: 'dwt-note' }, labels.andMore(more)) : null,
      ]);
    };
  },
  { name: 'AlertListWidget', props: ['data', 'onSelect'] }
);

/** Renders any payload with the renderer for its kind. */
export const WidgetContent = defineComponent(
  (props: {
    readonly data: WidgetData;
    /**
     * Makes table rows, bars, alert items and chart positions selectable.
     * Called with what was picked; `ResolvedWidgetCard` adds the widget's key
     * and kind.
     */
    readonly onSelect?: SelectHandler;
    /** The widget's key, for `custom` column formatters. */
    readonly widgetKey?: string | undefined;
    /** Search and sort for TABLE data; see `resolveTableControls`. */
    readonly tableControls?: ResolvedTableControls | undefined;
    /** TABLE header sort to start with; see `sortFromOptions`. */
    readonly initialSort?: DetailSort | undefined;
  }) =>
    (): VNode => {
      const { data, onSelect } = props;
      switch (data.kind) {
        case 'TEXT':
          return h(TextWidget, { data });
        case 'KPI':
          return h(KpiWidget, { data });
        case 'GAUGE':
          return h(GaugeWidget, { data });
        case 'TABLE':
          return h(TableWidget, {
            data,
            controls: props.tableControls,
            initialSort: props.initialSort,
            widgetKey: props.widgetKey,
            onSelect,
          });
        case 'BAR_LIST':
          return h(BarListWidget, { data, onSelect });
        case 'ALERT_LIST':
          return h(AlertListWidget, { data, onSelect });
        case 'GRAPH':
          return h(GraphWidget, { data, onSelect });
      }
    },
  {
    name: 'WidgetContent',
    props: ['data', 'onSelect', 'widgetKey', 'tableControls', 'initialSort'],
  }
);
