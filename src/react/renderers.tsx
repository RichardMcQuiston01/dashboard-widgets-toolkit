import { useId, useState, type ReactNode } from 'react';

import { CellContent } from './cells.js';

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
import { cellField } from '../core/fields.js';
import type { SelectionTarget } from '../core/select.js';
import { GraphWidget } from './charts.js';
import { CHART_COLORS, seriesColor } from './palette.js';
import { Thumbnail, WidgetLink } from './primitives.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

/** TEXT: a headline value and its label. */
export function TextWidget({
  data,
}: {
  readonly data: TextWidgetData;
}): ReactNode {
  const slot = useSlotClassName();
  return (
    <div className={slot('text', 'dwt-text')}>
      <p className="dwt-figure">{data.value}</p>
      <p className="dwt-figure-label">{data.label}</p>
    </div>
  );
}

const DELTA_ARROWS: Readonly<Record<KpiDelta['direction'], string>> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

/**
 * KPI: a stat tile. The change against the previous period carries an arrow
 * and signed text as well as color, so it never relies on color alone.
 */
export function KpiWidget({
  data,
}: {
  readonly data: KpiWidgetData;
}): ReactNode {
  const slot = useSlotClassName();
  const { locale, labels } = useWidgetSettings();
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
  return (
    <div className={slot('kpi', 'dwt-kpi')}>
      <p className="dwt-figure-label">{data.label}</p>
      <p className="dwt-figure">{value}</p>
      {(delta !== null || data.hint !== undefined) && (
        <p className="dwt-kpi-meta">
          {delta !== null && (
            <span
              className={`dwt-delta dwt-delta--${delta.sentiment} dwt-delta--${delta.direction}`}
            >
              <span aria-hidden="true" className="dwt-delta-arrow">
                {DELTA_ARROWS[delta.direction]}
              </span>{' '}
              {delta.text}
              <span className="dwt-delta-comparison">
                {' '}
                vs {labels.comparison}
              </span>
            </span>
          )}
          {data.hint !== undefined && (
            <span className="dwt-hint">{data.hint}</span>
          )}
        </p>
      )}
    </div>
  );
}

/** GAUGE: a meter whose track is a lighter step of the fill's own hue. */
export function GaugeWidget({
  data,
}: {
  readonly data: GaugeWidgetData;
}): ReactNode {
  const slot = useSlotClassName();
  const { locale } = useWidgetSettings();
  const max: number = data.max > 0 ? data.max : 1;
  const percent: number = Math.max(0, Math.min(100, (data.value / max) * 100));
  return (
    <div className={slot('gauge', 'dwt-gauge')}>
      <div
        className="dwt-meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={data.value}
        aria-label={data.label}
        style={{ background: CHART_COLORS.meterTrack }}
      >
        <div
          className="dwt-meter-fill"
          style={{ width: `${percent}%`, background: seriesColor(0) }}
        />
      </div>
      <p className="dwt-gauge-caption">
        <span className="dwt-gauge-value">
          {formatValue(data.value, 'number', { locale })} /{' '}
          {formatValue(max, 'number', { locale })}
        </span>{' '}
        <span className="dwt-figure-label">{data.label}</span>
      </p>
    </div>
  );
}

/** TABLE: a data table; cells with a safe `href` become links. */
export function TableWidget({
  data,
  controls,
  initialSort,
  widgetKey = '',
  onSelect,
}: {
  readonly data: TableWidgetData;
  /** Makes rows selectable; the target's `index` is the row's place in `data.rows`. */
  readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
  /** The widget's key, passed to `custom` column formatters. */
  readonly widgetKey?: string;
  /** Search box and sortable headers; see `WidgetDefinition.tableControls`. */
  readonly controls?: ResolvedTableControls | undefined;
  /** The header sort to start with, for example from a `sort` option. */
  readonly initialSort?: DetailSort | undefined;
}): ReactNode {
  if (controls === undefined) {
    return (
      <div className="dwt-table-wrap">
        <TableView data={data} widgetKey={widgetKey} onSelect={onSelect} />
        {data.footer !== undefined && <p className="dwt-note">{data.footer}</p>}
      </div>
    );
  }
  return (
    <InteractiveTable
      data={data}
      controls={controls}
      initialSort={initialSort}
      widgetKey={widgetKey}
      onSelect={onSelect}
    />
  );
}

/** Whether a click landed on the row itself or on its select button, not on a link or control. */
function isPlainClick(target: EventTarget): boolean {
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

function TableView({
  data,
  rows = data.rows,
  sort,
  onSort,
  widgetKey,
  onSelect,
}: {
  readonly data: TableWidgetData;
  readonly widgetKey: string;
  readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
  readonly rows?: TableWidgetData['rows'];
  readonly sort?: DetailSort | undefined;
  /** Makes the headers sort buttons. */
  readonly onSort?: ((columnKey: string) => void) | undefined;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  // Sorting and search reorder `rows`; a selection reports the place in the payload.
  const originalIndex = new Map<readonly TableCell[], number>(
    data.rows.map((row, index) => [row, index])
  );
  return (
    <>
      <table className={slot('table', 'dwt-table')}>
        <thead>
          <tr>
            {data.columns.map((column, index) => {
              const key = `c${index}`;
              const sorted: boolean = sort?.column === key;
              return (
                <th
                  key={index}
                  scope="col"
                  className={
                    column.numeric === true ? 'dwt-numeric' : undefined
                  }
                  aria-sort={
                    sorted
                      ? sort?.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {onSort === undefined ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      className="dwt-detail-sort"
                      aria-label={labels.sortBy(column.label)}
                      onClick={() => onSort(key)}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {!sorted
                          ? ' ↕'
                          : sort?.direction === 'asc'
                            ? ' ↑'
                            : ' ↓'}
                      </span>
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            // The first plain cell gets the button that makes the row
            // reachable by keyboard; a click anywhere else on the row works too.
            const buttonCell: number =
              onSelect === undefined ? -1 : selectButtonCell(data, row);
            const original: number = originalIndex.get(row) ?? rowIndex;
            return (
              <tr
                key={rowIndex}
                {...(onSelect === undefined
                  ? {}
                  : {
                      className: 'dwt-selectable',
                      onClick: (event) => {
                        if (isPlainClick(event.target)) {
                          onSelect({
                            type: 'row',
                            index: original,
                            cells: row,
                          });
                        }
                      },
                    })}
              >
                {row.map((cell, cellIndex) => {
                  const content: ReactNode = (
                    <CellContent
                      widgetKey={widgetKey}
                      columnKey={`c${cellIndex}`}
                      column={data.columns[cellIndex]}
                      cell={cell}
                      row={row}
                    />
                  );
                  return (
                    <td
                      key={cellIndex}
                      className={
                        data.columns[cellIndex]?.numeric === true
                          ? 'dwt-numeric'
                          : undefined
                      }
                    >
                      {cellIndex === buttonCell ? (
                        <button type="button" className="dwt-select">
                          {content}
                        </button>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

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

function InteractiveTable({
  data,
  controls,
  initialSort,
  widgetKey,
  onSelect,
}: {
  readonly data: TableWidgetData;
  readonly widgetKey: string;
  readonly onSelect: ((target: SelectionTarget) => void) | undefined;
  readonly controls: ResolvedTableControls;
  readonly initialSort: DetailSort | undefined;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels, locale } = useWidgetSettings();
  const searchId: string = useId();
  const [search, setSearch] = useState<string>('');
  const [sort, setSort] = useState<DetailSort | undefined>(initialSort);
  // A changed sort option replaces the header sort (derived state, so no
  // effect and no extra render with stale rows).
  const seed: string =
    initialSort === undefined
      ? ''
      : `${initialSort.column}:${initialSort.direction}`;
  const [seededWith, setSeededWith] = useState<string>(seed);
  if (seededWith !== seed) {
    setSeededWith(seed);
    setSort(initialSort);
  }
  const localeTag: string | undefined =
    typeof locale === 'string' ? locale : locale?.[0];

  const query: DetailQuery = {
    page: 1,
    pageSize: Math.max(1, data.rows.length),
    ...(controls.search && search !== '' ? { search } : {}),
    ...(controls.sort && sort !== undefined ? { sort } : {}),
  };
  const result = queryRows(tableDetailData(data), query, localeTag);
  const page: DetailPage | undefined = result.ok ? result.value : undefined;

  return (
    <div className="dwt-table-wrap">
      {controls.search && (
        <div className="dwt-table-search">
          <label htmlFor={searchId} className="dwt-visually-hidden">
            {labels.search}
          </label>
          <input
            id={searchId}
            type="search"
            placeholder={labels.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      )}
      {result.ok ? (
        <>
          <p
            className="dwt-visually-hidden"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {page !== undefined && page.totalRows === 0
              ? labels.noResults
              : page === undefined
                ? ''
                : labels.showingRows(1, page.rows.length, page.totalRows)}
          </p>
          <TableView
            data={data}
            widgetKey={widgetKey}
            onSelect={onSelect}
            rows={page?.rows ?? data.rows}
            sort={sort}
            onSort={
              controls.sort
                ? (column) => setSort(nextTableSort(sort, column))
                : undefined
            }
          />
          {page !== undefined && page.totalRows === 0 && (
            <p className="dwt-note">{labels.noResults}</p>
          )}
        </>
      ) : (
        <p role="alert" className={slot('error', 'dwt-error')}>
          {result.error}
        </p>
      )}
      {data.footer !== undefined && <p className="dwt-note">{data.footer}</p>}
    </div>
  );
}

/**
 * BAR_LIST: labelled horizontal bars. One series, so one color (slot 1)
 * for every bar; the value text sits beside the bar, never inside it.
 */
export function BarListWidget({
  data,
  onSelect,
}: {
  readonly data: BarListWidgetData;
  /** Makes each bar selectable (a button on its label, and the row clickable). */
  readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
}): ReactNode {
  const slot = useSlotClassName();
  const { locale } = useWidgetSettings();
  const denominator: number =
    data.total !== undefined && data.total > 0
      ? data.total
      : Math.max(0, ...data.items.map((item) => item.value));
  return (
    <ul className={slot('barList', 'dwt-bar-list')}>
      {data.items.map((item, index) => {
        const width: number =
          denominator > 0
            ? Math.max(0, Math.min(100, (item.value / denominator) * 100))
            : 0;
        const display: string =
          item.display ??
          (data.total !== undefined
            ? `${formatValue(item.value, 'number', { locale })} (${shareOf(item.value, data.total)}%)`
            : formatValue(item.value, 'number', { locale }));
        return (
          <li
            key={`${index}-${item.label}`}
            className={
              onSelect === undefined
                ? 'dwt-bar-row'
                : 'dwt-bar-row dwt-selectable'
            }
            {...(onSelect === undefined
              ? {}
              : {
                  onClick: () => onSelect({ type: 'bar', index, item }),
                })}
          >
            <span className="dwt-bar-label">
              {onSelect === undefined ? (
                item.label
              ) : (
                <button type="button" className="dwt-select">
                  {item.label}
                </button>
              )}
            </span>
            <span className="dwt-bar-value">{display}</span>
            <span
              className="dwt-bar-track"
              aria-hidden="true"
              style={{ background: CHART_COLORS.barTrack }}
            >
              <span
                className="dwt-bar-fill"
                style={{ width: `${width}%`, background: seriesColor(0) }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** ALERT_LIST: rows needing attention, with thumbnail, link and value. */
export function AlertListWidget({
  data,
  onSelect,
}: {
  readonly data: AlertListWidgetData;
  /** Makes items without their own `href` selectable. */
  readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  if (data.items.length === 0) {
    return <p className={slot('empty', 'dwt-empty')}>{data.emptyText}</p>;
  }
  const more: number = data.total - data.items.length;
  return (
    <div>
      <ul className={slot('alertList', 'dwt-alert-list')}>
        {data.items.map((item, index) => (
          <li
            key={`${index}-${item.title}`}
            className={
              onSelect !== undefined && item.href === undefined
                ? 'dwt-alert-row dwt-selectable'
                : 'dwt-alert-row'
            }
            {...(onSelect !== undefined && item.href === undefined
              ? {
                  onClick: () => onSelect({ type: 'alert', index, item }),
                }
              : {})}
          >
            <Thumbnail url={item.thumbnailUrl} />
            <span className="dwt-alert-main">
              {onSelect !== undefined && item.href === undefined ? (
                <button type="button" className="dwt-select dwt-alert-title">
                  {item.title}
                </button>
              ) : (
                <WidgetLink href={item.href} className="dwt-alert-title">
                  {item.title}
                </WidgetLink>
              )}
              {item.detail !== undefined && (
                <span className="dwt-alert-detail">{item.detail}</span>
              )}
            </span>
            <span className="dwt-alert-value">{item.valueLabel}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="dwt-note">{labels.andMore(more)}</p>}
    </div>
  );
}

/** Renders any payload with the renderer for its kind. */
export function WidgetContent({
  data,
  tableControls,
  initialSort,
  widgetKey,
  onSelect,
}: {
  readonly data: WidgetData;
  /**
   * Makes table rows, bars, alert items and chart positions selectable. Called
   * with what was picked; `ResolvedWidgetCard` adds the widget's key and kind.
   */
  readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
  /** The widget's key, for `custom` column formatters. */
  readonly widgetKey?: string;
  /** Search and sort for TABLE data; see `resolveTableControls`. */
  readonly tableControls?: ResolvedTableControls | undefined;
  /** TABLE header sort to start with; see `sortFromOptions`. */
  readonly initialSort?: DetailSort | undefined;
}): ReactNode {
  switch (data.kind) {
    case 'TEXT':
      return <TextWidget data={data} />;
    case 'KPI':
      return <KpiWidget data={data} />;
    case 'GAUGE':
      return <GaugeWidget data={data} />;
    case 'TABLE':
      return (
        <TableWidget
          data={data}
          controls={tableControls}
          initialSort={initialSort}
          {...(widgetKey === undefined ? {} : { widgetKey })}
          onSelect={onSelect}
        />
      );
    case 'BAR_LIST':
      return <BarListWidget data={data} onSelect={onSelect} />;
    case 'ALERT_LIST':
      return <AlertListWidget data={data} onSelect={onSelect} />;
    case 'GRAPH':
      return <GraphWidget data={data} onSelect={onSelect} />;
  }
}
