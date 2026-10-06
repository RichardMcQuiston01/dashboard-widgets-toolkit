import {
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { formatValue } from '../core/format.js';
import type { GraphWidgetData } from '../core/payload.js';
import { labelStride, niceDomain, type NiceDomain } from '../core/scale.js';
import { CHART_COLORS, seriesColor } from './palette.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

/**
 * GRAPH renderer: inline SVG bar (grouped) or line chart with one y axis.
 *
 * Follows the dataviz marks spec: bars at most 24px thick with a 4px rounded
 * data end and a square baseline end, 2px gaps between adjacent bars; 2px
 * lines; markers r=4 with a 2px surface ring; a 10% wash under a single
 * line; solid hairline grid. Two or more series get a legend; a single
 * series is named by the widget title. Hover or keyboard focus (arrow keys)
 * shows every series at that position, and every value is also in the
 * "View as table" twin, so the tooltip never gates a value.
 */

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 20, bottom: 28, left: 56 } as const;
const INNER_WIDTH: number = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT: number = HEIGHT - MARGIN.top - MARGIN.bottom;
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;
const BAR_RADIUS = 4;
/** Above this many points, line markers are only drawn at the end. */
const MAX_MARKED_POINTS = 24;

/** A bar with a rounded data end and a square end on the baseline. */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  roundedEnd: 'top' | 'bottom'
): string {
  const r: number = Math.max(0, Math.min(BAR_RADIUS, width / 2, height));
  const right: number = x + width;
  const bottom: number = y + height;
  const f = (n: number): string => n.toFixed(2);
  if (roundedEnd === 'top') {
    return `M${f(x)},${f(bottom)}V${f(y + r)}Q${f(x)},${f(y)} ${f(x + r)},${f(y)}H${f(right - r)}Q${f(right)},${f(y)} ${f(right)},${f(y + r)}V${f(bottom)}Z`;
  }
  return `M${f(x)},${f(y)}V${f(bottom - r)}Q${f(x)},${f(bottom)} ${f(x + r)},${f(bottom)}H${f(right - r)}Q${f(right)},${f(bottom)} ${f(right)},${f(bottom - r)}V${f(y)}Z`;
}

interface ChartModel {
  readonly labels: readonly string[];
  /** values[series][index]; null where a series has no point. */
  readonly values: readonly (readonly (number | null)[])[];
  readonly domain: NiceDomain;
}

/** Labels by position (first series that has one) and a value matrix. */
export function buildChartModel(data: GraphWidgetData): ChartModel {
  const count: number = Math.max(0, ...data.series.map((s) => s.points.length));
  const labels: string[] = [];
  for (let index = 0; index < count; index++) {
    const label: string | undefined = data.series.find(
      (s) => s.points[index] !== undefined
    )?.points[index]?.label;
    labels.push(label ?? '');
  }
  const values: (number | null)[][] = data.series.map((s) =>
    labels.map((_, index) => s.points[index]?.value ?? null)
  );
  const all: number[] = values.flat().filter((v): v is number => v !== null);
  return { labels, values, domain: niceDomain(all) };
}

function yFor(domain: NiceDomain, value: number): number {
  const range: number = domain.max - domain.min || 1;
  return MARGIN.top + INNER_HEIGHT * ((domain.max - value) / range);
}

/** Bar charts center each label in a slot; lines span the full width. */
function xFor(chartType: 'bar' | 'line', count: number, index: number): number {
  if (chartType === 'bar') {
    const slot: number = INNER_WIDTH / Math.max(1, count);
    return MARGIN.left + slot * index + slot / 2;
  }
  return count <= 1
    ? MARGIN.left + INNER_WIDTH / 2
    : MARGIN.left + (index / (count - 1)) * INNER_WIDTH;
}

/** The x band a pointer must be in to select `index` (bigger than the mark). */
function hitBand(
  chartType: 'bar' | 'line',
  count: number,
  index: number
): { x: number; width: number } {
  if (chartType === 'bar' || count <= 1) {
    const slot: number = INNER_WIDTH / Math.max(1, count);
    return { x: MARGIN.left + slot * index, width: slot };
  }
  const step: number = INNER_WIDTH / (count - 1);
  const left: number = Math.max(
    MARGIN.left,
    xFor('line', count, index) - step / 2
  );
  const right: number = Math.min(
    MARGIN.left + INNER_WIDTH,
    xFor('line', count, index) + step / 2
  );
  return { x: left, width: right - left };
}

function linePath(
  values: readonly (number | null)[],
  domain: NiceDomain,
  count: number
): string {
  let path = '';
  let penDown = false;
  values.forEach((value, index) => {
    if (value === null) {
      penDown = false;
      return;
    }
    path += `${penDown ? 'L' : 'M'}${xFor('line', count, index).toFixed(2)},${yFor(domain, value).toFixed(2)}`;
    penDown = true;
  });
  return path;
}

function areaPath(
  values: readonly (number | null)[],
  domain: NiceDomain,
  count: number
): string | null {
  if (values.some((value) => value === null) || values.length < 2) {
    return null;
  }
  const baseline: number = yFor(
    domain,
    Math.max(domain.min, Math.min(0, domain.max))
  );
  const first: string = xFor('line', count, 0).toFixed(2);
  const last: string = xFor('line', count, count - 1).toFixed(2);
  return `M${first},${baseline.toFixed(2)}${linePath(values, domain, count).replace(/^M/, 'L')}L${last},${baseline.toFixed(2)}Z`;
}

/** A plain-language summary of the chart, for its SVG <desc>. */
export function describeChart(
  data: GraphWidgetData,
  model: ChartModel,
  format: (value: number) => string
): string {
  const first: string = model.labels[0] ?? '';
  const last: string = model.labels[model.labels.length - 1] ?? '';
  const span: string =
    model.labels.length <= 1 ? first : `from ${first} to ${last}`;
  const parts: string[] = data.series.map((series, s) => {
    const present: number[] = (model.values[s] ?? []).filter(
      (v): v is number => v !== null
    );
    if (present.length === 0) return `${series.name}: no values.`;
    const latest: number = present[present.length - 1] ?? 0;
    return `${series.name}: latest ${format(latest)}, high ${format(Math.max(...present))}, low ${format(Math.min(...present))}.`;
  });
  return `${data.chartType === 'bar' ? 'Bar' : 'Line'} chart, ${model.labels.length} point(s) ${span}. ${parts.join(' ')}`;
}

export function GraphWidget({
  data,
  title,
}: {
  readonly data: GraphWidgetData;
  /** The accessible name; defaults to the series names. */
  readonly title?: string;
}): ReactNode {
  const slot = useSlotClassName();
  const { locale, labels: text } = useWidgetSettings();
  const id: string = useId();
  const [active, setActive] = useState<number | null>(null);

  const model: ChartModel = buildChartModel(data);
  const count: number = model.labels.length;
  const currency =
    data.currency === undefined ? {} : { currency: data.currency };
  const format = (value: number): string =>
    formatValue(value, data.valueFormat, { locale, ...currency });
  const formatTick = (value: number): string =>
    formatValue(value, data.valueFormat, {
      locale,
      compact: true,
      ...currency,
    });
  const chartTitle: string = title ?? data.series.map((s) => s.name).join(', ');
  const description: string = describeChart(data, model, format);
  const stride: number = labelStride(count);
  const zeroY: number = yFor(
    model.domain,
    Math.max(model.domain.min, Math.min(0, model.domain.max))
  );
  const seriesCount: number = data.series.length;
  const isBar: boolean = data.chartType === 'bar';

  // Bar geometry: thin bars, capped, with the slot's leftover left as air.
  const slotWidth: number = INNER_WIDTH / Math.max(1, count);
  const barWidth: number = Math.max(
    1,
    Math.min(
      MAX_BAR_WIDTH,
      (slotWidth * 0.7 - BAR_GAP * (seriesCount - 1)) / Math.max(1, seriesCount)
    )
  );
  const groupWidth: number =
    barWidth * seriesCount + BAR_GAP * (seriesCount - 1);

  function handleKeyDown(event: ReactKeyboardEvent<SVGSVGElement>): void {
    if (count === 0) return;
    let next: number | null;
    switch (event.key) {
      case 'ArrowRight':
        next = Math.min(count - 1, (active ?? -1) + 1);
        break;
      case 'ArrowLeft':
        next = Math.max(0, (active ?? count) - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      case 'Escape':
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
  }

  const activeLabel: string | null =
    active === null ? null : (model.labels[active] ?? null);

  return (
    <figure
      className={slot('chart', 'dwt-chart', `dwt-chart--${data.chartType}`)}
    >
      {seriesCount >= 2 && (
        <ul className={slot('legend', 'dwt-legend')}>
          {data.series.map((series, s) => (
            <li key={s} className="dwt-legend-item">
              <svg
                width="16"
                height="10"
                aria-hidden="true"
                className="dwt-legend-key"
              >
                {isBar ? (
                  <rect
                    x="3"
                    y="0"
                    width="10"
                    height="10"
                    rx="2"
                    fill={seriesColor(s)}
                  />
                ) : (
                  <line
                    x1="1"
                    x2="15"
                    y1="5"
                    y2="5"
                    stroke={seriesColor(s)}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
              {series.name}
            </li>
          ))}
        </ul>
      )}
      <div className="dwt-chart-frame">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="dwt-chart-svg"
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          width="100%"
        >
          <title id={`${id}-title`}>{chartTitle}</title>
          <desc id={`${id}-desc`}>{description}</desc>

          <g className="dwt-chart-grid" aria-hidden="true">
            {model.domain.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={yFor(model.domain, tick)}
                  y2={yFor(model.domain, tick)}
                  stroke={CHART_COLORS.grid}
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={yFor(model.domain, tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="dwt-axis-label dwt-axis-label--y"
                  fill={CHART_COLORS.textMuted}
                  fontSize={11}
                >
                  {formatTick(tick)}
                </text>
              </g>
            ))}
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={zeroY}
              y2={zeroY}
              stroke={CHART_COLORS.baseline}
              strokeWidth={1}
            />
            {model.labels.map((label, index) =>
              index % stride === 0 || index === count - 1 ? (
                <text
                  key={index}
                  x={xFor(data.chartType, count, index)}
                  y={HEIGHT - 8}
                  textAnchor={
                    !isBar && count > 1 && index === 0
                      ? 'start'
                      : !isBar && count > 1 && index === count - 1
                        ? 'end'
                        : 'middle'
                  }
                  className="dwt-axis-label dwt-axis-label--x"
                  fill={CHART_COLORS.textMuted}
                  fontSize={11}
                >
                  {label}
                </text>
              ) : null
            )}
          </g>

          {isBar ? (
            <g className="dwt-chart-marks" aria-hidden="true">
              {model.labels.map((_, index) => (
                <g
                  key={index}
                  className={
                    active !== null && active !== index
                      ? 'dwt-mark-group dwt-mark-group--dimmed'
                      : 'dwt-mark-group'
                  }
                  opacity={active !== null && active !== index ? 0.55 : 1}
                >
                  {model.values.map((values, s) => {
                    const value: number | null = values[index] ?? null;
                    if (value === null || value === 0) return null;
                    const x: number =
                      xFor('bar', count, index) -
                      groupWidth / 2 +
                      s * (barWidth + BAR_GAP);
                    const valueY: number = yFor(model.domain, value);
                    const top: number = Math.min(valueY, zeroY);
                    const height: number = Math.abs(zeroY - valueY);
                    return (
                      <path
                        key={s}
                        className="dwt-bar"
                        d={barPath(
                          x,
                          top,
                          barWidth,
                          height,
                          value >= 0 ? 'top' : 'bottom'
                        )}
                        fill={seriesColor(s)}
                      />
                    );
                  })}
                </g>
              ))}
            </g>
          ) : (
            <g className="dwt-chart-marks" aria-hidden="true">
              {seriesCount === 1 &&
                (() => {
                  const area: string | null = areaPath(
                    model.values[0] ?? [],
                    model.domain,
                    count
                  );
                  return area === null ? null : (
                    <path
                      d={area}
                      fill={seriesColor(0)}
                      fillOpacity={0.1}
                      stroke="none"
                    />
                  );
                })()}
              {model.values.map((values, s) => (
                <path
                  key={s}
                  className="dwt-line"
                  d={linePath(values, model.domain, count)}
                  fill="none"
                  stroke={seriesColor(s)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {model.values.map((values, s) =>
                values.map((value, index) => {
                  const isLast: boolean = index === count - 1;
                  if (value === null) return null;
                  if (count > MAX_MARKED_POINTS && !isLast && index !== active)
                    return null;
                  return (
                    <circle
                      key={`${s}-${index}`}
                      className="dwt-marker"
                      cx={xFor('line', count, index)}
                      cy={yFor(model.domain, value)}
                      r={index === active ? 5 : 4}
                      fill={seriesColor(s)}
                      stroke={CHART_COLORS.surface}
                      strokeWidth={2}
                    />
                  );
                })
              )}
              {seriesCount === 1 &&
                (() => {
                  const last: number | null =
                    model.values[0]?.[count - 1] ?? null;
                  if (last === null) return null;
                  return (
                    <text
                      className="dwt-end-label"
                      x={xFor('line', count, count - 1)}
                      y={yFor(model.domain, last) - 10}
                      textAnchor="end"
                      fill={CHART_COLORS.textPrimary}
                      fontSize={12}
                      fontWeight={600}
                    >
                      {format(last)}
                    </text>
                  );
                })()}
              {active !== null && (
                <line
                  className="dwt-crosshair"
                  x1={xFor('line', count, active)}
                  x2={xFor('line', count, active)}
                  y1={MARGIN.top}
                  y2={MARGIN.top + INNER_HEIGHT}
                  stroke={CHART_COLORS.crosshair}
                  strokeWidth={1}
                />
              )}
            </g>
          )}

          <g className="dwt-hit-layer">
            {model.labels.map((_, index) => {
              const band = hitBand(data.chartType, count, index);
              return (
                <rect
                  key={index}
                  x={band.x}
                  y={MARGIN.top}
                  width={Math.max(0, band.width)}
                  height={INNER_HEIGHT}
                  fill="transparent"
                  onPointerEnter={() => setActive(index)}
                  onPointerMove={() => setActive(index)}
                />
              );
            })}
          </g>
        </svg>
        {active !== null && activeLabel !== null && (
          <div
            className={slot('tooltip', 'dwt-tooltip')}
            style={{
              left: `${(xFor(data.chartType, count, active) / WIDTH) * 100}%`,
            }}
          >
            <p className="dwt-tooltip-label">{activeLabel}</p>
            <ul className="dwt-tooltip-rows">
              {data.series.map((series, s) => {
                const value: number | null = model.values[s]?.[active] ?? null;
                return (
                  <li key={s} className="dwt-tooltip-row">
                    <svg width="12" height="4" aria-hidden="true">
                      <line
                        x1="0"
                        x2="12"
                        y1="2"
                        y2="2"
                        stroke={seriesColor(s)}
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                    <strong className="dwt-tooltip-value">
                      {value === null ? '—' : format(value)}
                    </strong>
                    {seriesCount >= 2 && (
                      <span className="dwt-tooltip-series">{series.name}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <details className={slot('tableTwin', 'dwt-table-twin')}>
        <summary>{text.viewAsTable}</summary>
        <table className={slot('table', 'dwt-table')}>
          <thead>
            <tr>
              <th scope="col">{data.xLabel ?? 'Label'}</th>
              {data.series.map((series, s) => (
                <th key={s} scope="col" className="dwt-numeric">
                  {series.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.labels.map((label, index) => (
              <tr key={index}>
                <th scope="row">{label}</th>
                {model.values.map((values, s) => {
                  const value: number | null = values[index] ?? null;
                  return (
                    <td key={s} className="dwt-numeric">
                      {value === null ? '—' : format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
