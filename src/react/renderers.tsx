import type { ReactNode } from 'react';

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
}: {
  readonly data: TableWidgetData;
}): ReactNode {
  const slot = useSlotClassName();
  return (
    <div className="dwt-table-wrap">
      <table className={slot('table', 'dwt-table')}>
        <thead>
          <tr>
            {data.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={column.numeric === true ? 'dwt-numeric' : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
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
}: {
  readonly data: WidgetData;
}): ReactNode {
  switch (data.kind) {
    case 'TEXT':
      return <TextWidget data={data} />;
    case 'KPI':
      return <KpiWidget data={data} />;
    case 'GAUGE':
      return <GaugeWidget data={data} />;
    case 'TABLE':
      return <TableWidget data={data} />;
    case 'BAR_LIST':
      return <BarListWidget data={data} />;
    case 'ALERT_LIST':
      return <AlertListWidget data={data} />;
    case 'GRAPH':
      return <GraphWidget data={data} />;
  }
}
