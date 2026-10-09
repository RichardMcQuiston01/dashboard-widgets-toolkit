import { useId, useState, type ReactNode } from 'react';

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
  TableWidgetData,
  TextWidgetData,
  WidgetData,
} from '../core/payload.js';
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
}: {
  readonly data: TableWidgetData;
  /** Search box and sortable headers; see `WidgetDefinition.tableControls`. */
  readonly controls?: ResolvedTableControls | undefined;
  /** The header sort to start with, for example from a `sort` option. */
  readonly initialSort?: DetailSort | undefined;
}): ReactNode {
  if (controls === undefined) {
    return (
      <div className="dwt-table-wrap">
        <TableView data={data} />
        {data.footer !== undefined && <p className="dwt-note">{data.footer}</p>}
      </div>
    );
  }
  return (
    <InteractiveTable
      data={data}
      controls={controls}
      initialSort={initialSort}
    />
  );
}

function TableView({
  data,
  rows = data.rows,
  sort,
  onSort,
}: {
  readonly data: TableWidgetData;
  readonly rows?: TableWidgetData['rows'];
  readonly sort?: DetailSort | undefined;
  /** Makes the headers sort buttons. */
  readonly onSort?: ((columnKey: string) => void) | undefined;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
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
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={
                    data.columns[cellIndex]?.numeric === true
                      ? 'dwt-numeric'
                      : undefined
                  }
                >
                  {cell.href === undefined ? (
                    cell.text
                  ) : (
                    <WidgetLink href={cell.href} className="dwt-link">
                      {cell.text}
                    </WidgetLink>
                  )}
                </td>
              ))}
            </tr>
          ))}
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
}: {
  readonly data: TableWidgetData;
  readonly controls: ResolvedTableControls;
  readonly initialSort: DetailSort | undefined;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels, locale } = useWidgetSettings();
  const searchId: string = useId();
  const [search, setSearch] = useState<string>('');
  const [sort, setSort] = useState<DetailSort | undefined>(initialSort);
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
}: {
  readonly data: BarListWidgetData;
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
          <li key={`${index}-${item.label}`} className="dwt-bar-row">
            <span className="dwt-bar-label">{item.label}</span>
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
}: {
  readonly data: AlertListWidgetData;
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
          <li key={`${index}-${item.title}`} className="dwt-alert-row">
            <Thumbnail url={item.thumbnailUrl} />
            <span className="dwt-alert-main">
              <WidgetLink href={item.href} className="dwt-alert-title">
                {item.title}
              </WidgetLink>
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
}: {
  readonly data: WidgetData;
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
        />
      );
    case 'BAR_LIST':
      return <BarListWidget data={data} />;
    case 'ALERT_LIST':
      return <AlertListWidget data={data} />;
    case 'GRAPH':
      return <GraphWidget data={data} />;
  }
}
