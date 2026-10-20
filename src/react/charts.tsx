import {
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { formatValue } from '../core/format.js';
import type { GraphWidgetData } from '../core/payload.js';
import type { SelectionTarget } from '../core/select.js';
import { labelStride } from '../core/scale.js';
import { CHART_COLORS, seriesColor } from './palette.js';
import {
  barPath,
  buildChartModel,
  describeChart,
  CHART_BAR_GAP,
  CHART_HEIGHT,
  CHART_INNER_HEIGHT,
  CHART_INNER_WIDTH,
  CHART_MARGIN,
  CHART_MAX_BAR_WIDTH,
  CHART_MAX_MARKED_POINTS,
  CHART_WIDTH,
  chartAreaPath,
  chartHitBand,
  chartLinePath,
  chartX,
  chartY,
  type ChartModel,
} from '../core/chart-model.js';

export { barPath, buildChartModel, describeChart };

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

export function GraphWidget({
  data,
  title,
  onSelect,
}: {
  readonly data: GraphWidgetData;
  /** The accessible name; defaults to the series names. */
  readonly title?: string;
  /**
   * Makes each x position selectable: a click on it, or Enter or Space on the
   * highlighted position (arrow keys move it). Reports the label and every
   * series' value there.
   */
  readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
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
  const description: string = `${describeChart(data, model, format)}${onSelect === undefined ? '' : ` ${text.chartSelectHint}`}`;
  const stride: number = labelStride(count);
  const zeroY: number = chartY(
    model.domain,
    Math.max(model.domain.min, Math.min(0, model.domain.max))
  );
  const seriesCount: number = data.series.length;
  const isBar: boolean = data.chartType === 'bar';

  // Bar geometry: thin bars, capped, with the slot's leftover left as air.
  const slotWidth: number = CHART_INNER_WIDTH / Math.max(1, count);
  const barWidth: number = Math.max(
    1,
    Math.min(
      CHART_MAX_BAR_WIDTH,
      (slotWidth * 0.7 - CHART_BAR_GAP * (seriesCount - 1)) /
        Math.max(1, seriesCount)
    )
  );
  const groupWidth: number =
    barWidth * seriesCount + CHART_BAR_GAP * (seriesCount - 1);

  function select(index: number): void {
    if (onSelect === undefined) return;
    onSelect({
      type: 'point',
      index,
      label: model.labels[index] ?? '',
      values: data.series.map((series, s) => ({
        series: series.name,
        value: model.values[s]?.[index] ?? null,
      })),
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<SVGSVGElement>): void {
    if (count === 0) return;
    let next: number | null;
    switch (event.key) {
      case 'Enter':
      case ' ':
        if (onSelect === undefined || active === null) return;
        event.preventDefault();
        select(active);
        return;
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
      className={slot(
        'chart',
        'dwt-chart',
        `dwt-chart--${data.chartType}`,
        onSelect !== undefined && 'dwt-chart--selectable'
      )}
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
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
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
                  x1={CHART_MARGIN.left}
                  x2={CHART_WIDTH - CHART_MARGIN.right}
                  y1={chartY(model.domain, tick)}
                  y2={chartY(model.domain, tick)}
                  stroke={CHART_COLORS.grid}
                  strokeWidth={1}
                />
                <text
                  x={CHART_MARGIN.left - 8}
                  y={chartY(model.domain, tick)}
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
              x1={CHART_MARGIN.left}
              x2={CHART_WIDTH - CHART_MARGIN.right}
              y1={zeroY}
              y2={zeroY}
              stroke={CHART_COLORS.baseline}
              strokeWidth={1}
            />
            {model.labels.map((label, index) =>
              index % stride === 0 || index === count - 1 ? (
                <text
                  key={index}
                  x={chartX(data.chartType, count, index)}
                  y={CHART_HEIGHT - 8}
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
                      chartX('bar', count, index) -
                      groupWidth / 2 +
                      s * (barWidth + CHART_BAR_GAP);
                    const valueY: number = chartY(model.domain, value);
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
                  const area: string | null = chartAreaPath(
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
                  d={chartLinePath(values, model.domain, count)}
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
                  if (
                    count > CHART_MAX_MARKED_POINTS &&
                    !isLast &&
                    index !== active
                  )
                    return null;
                  return (
                    <circle
                      key={`${s}-${index}`}
                      className="dwt-marker"
                      cx={chartX('line', count, index)}
                      cy={chartY(model.domain, value)}
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
                      x={chartX('line', count, count - 1)}
                      y={chartY(model.domain, last) - 10}
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
                  x1={chartX('line', count, active)}
                  x2={chartX('line', count, active)}
                  y1={CHART_MARGIN.top}
                  y2={CHART_MARGIN.top + CHART_INNER_HEIGHT}
                  stroke={CHART_COLORS.crosshair}
                  strokeWidth={1}
                />
              )}
            </g>
          )}

          <g className="dwt-hit-layer">
            {model.labels.map((_, index) => {
              const band = chartHitBand(data.chartType, count, index);
              return (
                <rect
                  key={index}
                  x={band.x}
                  y={CHART_MARGIN.top}
                  width={Math.max(0, band.width)}
                  height={CHART_INNER_HEIGHT}
                  fill="transparent"
                  onPointerEnter={() => setActive(index)}
                  onPointerMove={() => setActive(index)}
                  {...(onSelect === undefined
                    ? {}
                    : { onClick: () => select(index) })}
                />
              );
            })}
          </g>
        </svg>
        {active !== null && activeLabel !== null && (
          <div
            className={slot('tooltip', 'dwt-tooltip')}
            style={{
              left: `${(chartX(data.chartType, count, active) / CHART_WIDTH) * 100}%`,
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
