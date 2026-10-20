import {
  defineComponent,
  h,
  ref,
  useId,
  type Ref,
  type VNode,
  type VNodeChild,
} from 'vue';

import {
  CHART_BAR_GAP,
  CHART_HEIGHT,
  CHART_INNER_HEIGHT,
  CHART_INNER_WIDTH,
  CHART_MARGIN,
  CHART_MAX_BAR_WIDTH,
  CHART_MAX_MARKED_POINTS,
  CHART_WIDTH,
  barPath,
  buildChartModel,
  chartAreaPath,
  chartHitBand,
  chartLinePath,
  chartX,
  chartY,
  describeChart,
  type ChartModel,
} from '../core/chart-model.js';
import { formatValue } from '../core/format.js';
import { CHART_COLORS, seriesColor } from '../core/palette.js';
import type { GraphWidgetData } from '../core/payload.js';
import { labelStride } from '../core/scale.js';
import type { SelectionTarget } from '../core/select.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export { barPath, buildChartModel, describeChart };

/**
 * GRAPH renderer: inline SVG bar (grouped) or line chart with one y axis,
 * drawn from the same model and geometry as the React renderer. Hover or
 * keyboard focus (arrow keys) shows every series at that position, and every
 * value is also in the "View as table" twin, so the tooltip never gates a
 * value.
 */
export const GraphWidget = defineComponent(
  (props: {
    readonly data: GraphWidgetData;
    /** The accessible name; defaults to the series names. */
    readonly title?: string | undefined;
    /**
     * Makes each x position selectable: a click on it, or Enter or Space on
     * the highlighted position (arrow keys move it). Reports the label and
     * every series' value there.
     */
    readonly onSelect?: ((target: SelectionTarget) => void) | undefined;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const id: string = useId();
    const active: Ref<number | null> = ref(null);

    return (): VNode => {
      const { data, title, onSelect } = props;
      const { locale, labels: text } = settings.value;
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
      const chartTitle: string =
        title ?? data.series.map((s) => s.name).join(', ');
      const description: string = `${describeChart(data, model, format)}${onSelect === undefined ? '' : ` ${text.chartSelectHint}`}`;
      const stride: number = labelStride(count);
      const zeroY: number = chartY(
        model.domain,
        Math.max(model.domain.min, Math.min(0, model.domain.max))
      );
      const seriesCount: number = data.series.length;
      const isBar: boolean = data.chartType === 'bar';
      const current: number | null = active.value;

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

      const select = (index: number): void => {
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
      };

      const handleKeyDown = (event: KeyboardEvent): void => {
        if (count === 0) return;
        let next: number | null;
        switch (event.key) {
          case 'Enter':
          case ' ':
            if (onSelect === undefined || active.value === null) return;
            event.preventDefault();
            select(active.value);
            return;
          case 'ArrowRight':
            next = Math.min(count - 1, (active.value ?? -1) + 1);
            break;
          case 'ArrowLeft':
            next = Math.max(0, (active.value ?? count) - 1);
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
        active.value = next;
      };

      const activeLabel: string | null =
        current === null ? null : (model.labels[current] ?? null);

      const legend: VNode | null =
        seriesCount >= 2
          ? h(
              'ul',
              { class: slot('legend', 'dwt-legend') },
              data.series.map((series, s) =>
                h('li', { class: 'dwt-legend-item' }, [
                  h(
                    'svg',
                    {
                      width: '16',
                      height: '10',
                      'aria-hidden': 'true',
                      class: 'dwt-legend-key',
                    },
                    [
                      isBar
                        ? h('rect', {
                            x: '3',
                            y: '0',
                            width: '10',
                            height: '10',
                            rx: '2',
                            fill: seriesColor(s),
                          })
                        : h('line', {
                            x1: '1',
                            x2: '15',
                            y1: '5',
                            y2: '5',
                            stroke: seriesColor(s),
                            'stroke-width': '2',
                            'stroke-linecap': 'round',
                          }),
                    ]
                  ),
                  series.name,
                ])
              )
            )
          : null;

      const grid: VNode = h(
        'g',
        { class: 'dwt-chart-grid', 'aria-hidden': 'true' },
        [
          ...model.domain.ticks.map((tick) =>
            h('g', { key: tick }, [
              h('line', {
                x1: CHART_MARGIN.left,
                x2: CHART_WIDTH - CHART_MARGIN.right,
                y1: chartY(model.domain, tick),
                y2: chartY(model.domain, tick),
                stroke: CHART_COLORS.grid,
                'stroke-width': 1,
              }),
              h(
                'text',
                {
                  x: CHART_MARGIN.left - 8,
                  y: chartY(model.domain, tick),
                  'text-anchor': 'end',
                  'dominant-baseline': 'middle',
                  class: 'dwt-axis-label dwt-axis-label--y',
                  fill: CHART_COLORS.textMuted,
                  'font-size': 11,
                },
                formatTick(tick)
              ),
            ])
          ),
          h('line', {
            x1: CHART_MARGIN.left,
            x2: CHART_WIDTH - CHART_MARGIN.right,
            y1: zeroY,
            y2: zeroY,
            stroke: CHART_COLORS.baseline,
            'stroke-width': 1,
          }),
          ...model.labels.map((label, index) =>
            index % stride === 0 || index === count - 1
              ? h(
                  'text',
                  {
                    key: index,
                    x: chartX(data.chartType, count, index),
                    y: CHART_HEIGHT - 8,
                    'text-anchor':
                      !isBar && count > 1 && index === 0
                        ? 'start'
                        : !isBar && count > 1 && index === count - 1
                          ? 'end'
                          : 'middle',
                    class: 'dwt-axis-label dwt-axis-label--x',
                    fill: CHART_COLORS.textMuted,
                    'font-size': 11,
                  },
                  label
                )
              : null
          ),
        ]
      );

      let marks: VNode;
      if (isBar) {
        marks = h(
          'g',
          { class: 'dwt-chart-marks', 'aria-hidden': 'true' },
          model.labels.map((_, index) =>
            h(
              'g',
              {
                key: index,
                class:
                  current !== null && current !== index
                    ? 'dwt-mark-group dwt-mark-group--dimmed'
                    : 'dwt-mark-group',
                opacity: current !== null && current !== index ? 0.55 : 1,
              },
              model.values.map((values, s) => {
                const value: number | null = values[index] ?? null;
                if (value === null || value === 0) return null;
                const x: number =
                  chartX('bar', count, index) -
                  groupWidth / 2 +
                  s * (barWidth + CHART_BAR_GAP);
                const valueY: number = chartY(model.domain, value);
                const top: number = Math.min(valueY, zeroY);
                const height: number = Math.abs(zeroY - valueY);
                return h('path', {
                  key: s,
                  class: 'dwt-bar',
                  d: barPath(
                    x,
                    top,
                    barWidth,
                    height,
                    value >= 0 ? 'top' : 'bottom'
                  ),
                  fill: seriesColor(s),
                });
              })
            )
          )
        );
      } else {
        const lastValue: number | null = model.values[0]?.[count - 1] ?? null;
        const area: string | null =
          seriesCount === 1
            ? chartAreaPath(model.values[0] ?? [], model.domain, count)
            : null;
        const children: VNodeChild[] = [
          area === null
            ? null
            : h('path', {
                d: area,
                fill: seriesColor(0),
                'fill-opacity': 0.1,
                stroke: 'none',
              }),
          ...model.values.map((values, s) =>
            h('path', {
              key: s,
              class: 'dwt-line',
              d: chartLinePath(values, model.domain, count),
              fill: 'none',
              stroke: seriesColor(s),
              'stroke-width': 2,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            })
          ),
          ...model.values.flatMap((values, s) =>
            values.map((value, index) => {
              const isLast: boolean = index === count - 1;
              if (value === null) return null;
              if (
                count > CHART_MAX_MARKED_POINTS &&
                !isLast &&
                index !== current
              ) {
                return null;
              }
              return h('circle', {
                key: `${s}-${index}`,
                class: 'dwt-marker',
                cx: chartX('line', count, index),
                cy: chartY(model.domain, value),
                r: index === current ? 5 : 4,
                fill: seriesColor(s),
                stroke: CHART_COLORS.surface,
                'stroke-width': 2,
              });
            })
          ),
          seriesCount === 1 && lastValue !== null
            ? h(
                'text',
                {
                  class: 'dwt-end-label',
                  x: chartX('line', count, count - 1),
                  y: chartY(model.domain, lastValue) - 10,
                  'text-anchor': 'end',
                  fill: CHART_COLORS.textPrimary,
                  'font-size': 12,
                  'font-weight': 600,
                },
                format(lastValue)
              )
            : null,
          current !== null
            ? h('line', {
                class: 'dwt-crosshair',
                x1: chartX('line', count, current),
                x2: chartX('line', count, current),
                y1: CHART_MARGIN.top,
                y2: CHART_MARGIN.top + CHART_INNER_HEIGHT,
                stroke: CHART_COLORS.crosshair,
                'stroke-width': 1,
              })
            : null,
        ];
        marks = h(
          'g',
          { class: 'dwt-chart-marks', 'aria-hidden': 'true' },
          children
        );
      }

      const hitLayer: VNode = h(
        'g',
        { class: 'dwt-hit-layer' },
        model.labels.map((_, index) => {
          const band = chartHitBand(data.chartType, count, index);
          return h('rect', {
            key: index,
            x: band.x,
            y: CHART_MARGIN.top,
            width: Math.max(0, band.width),
            height: CHART_INNER_HEIGHT,
            fill: 'transparent',
            onPointerenter: () => {
              active.value = index;
            },
            onPointermove: () => {
              active.value = index;
            },
            ...(onSelect === undefined ? {} : { onClick: () => select(index) }),
          });
        })
      );

      const tooltip: VNode | null =
        current !== null && activeLabel !== null
          ? h(
              'div',
              {
                class: slot('tooltip', 'dwt-tooltip'),
                style: {
                  left: `${(chartX(data.chartType, count, current) / CHART_WIDTH) * 100}%`,
                },
              },
              [
                h('p', { class: 'dwt-tooltip-label' }, activeLabel),
                h(
                  'ul',
                  { class: 'dwt-tooltip-rows' },
                  data.series.map((series, s) => {
                    const value: number | null =
                      model.values[s]?.[current] ?? null;
                    return h('li', { key: s, class: 'dwt-tooltip-row' }, [
                      h(
                        'svg',
                        { width: '12', height: '4', 'aria-hidden': 'true' },
                        [
                          h('line', {
                            x1: '0',
                            x2: '12',
                            y1: '2',
                            y2: '2',
                            stroke: seriesColor(s),
                            'stroke-width': '3',
                            'stroke-linecap': 'round',
                          }),
                        ]
                      ),
                      h(
                        'strong',
                        { class: 'dwt-tooltip-value' },
                        value === null ? '—' : format(value)
                      ),
                      seriesCount >= 2
                        ? h(
                            'span',
                            { class: 'dwt-tooltip-series' },
                            series.name
                          )
                        : null,
                    ]);
                  })
                ),
              ]
            )
          : null;

      const twin: VNode = h(
        'details',
        { class: slot('tableTwin', 'dwt-table-twin') },
        [
          h('summary', text.viewAsTable),
          h('table', { class: slot('table', 'dwt-table') }, [
            h('thead', [
              h('tr', [
                h('th', { scope: 'col' }, data.xLabel ?? 'Label'),
                ...data.series.map((series, s) =>
                  h(
                    'th',
                    { key: s, scope: 'col', class: 'dwt-numeric' },
                    series.name
                  )
                ),
              ]),
            ]),
            h(
              'tbody',
              model.labels.map((label, index) =>
                h('tr', { key: index }, [
                  h('th', { scope: 'row' }, label),
                  ...model.values.map((values, s) => {
                    const value: number | null = values[index] ?? null;
                    return h(
                      'td',
                      { key: s, class: 'dwt-numeric' },
                      value === null ? '—' : format(value)
                    );
                  }),
                ])
              )
            ),
          ]),
        ]
      );

      return h(
        'figure',
        {
          class: slot(
            'chart',
            'dwt-chart',
            `dwt-chart--${data.chartType}`,
            onSelect !== undefined && 'dwt-chart--selectable'
          ),
        },
        [
          legend,
          h('div', { class: 'dwt-chart-frame' }, [
            h(
              'svg',
              {
                viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
                class: 'dwt-chart-svg',
                role: 'img',
                'aria-labelledby': `${id}-title ${id}-desc`,
                tabindex: 0,
                onKeydown: handleKeyDown,
                onBlur: () => {
                  active.value = null;
                },
                onPointerleave: () => {
                  active.value = null;
                },
                width: '100%',
              },
              [
                h('title', { id: `${id}-title` }, chartTitle),
                h('desc', { id: `${id}-desc` }, description),
                grid,
                marks,
                hitLayer,
              ]
            ),
            tooltip,
          ]),
          twin,
        ]
      );
    };
  },
  { name: 'GraphWidget', props: ['data', 'title', 'onSelect'] }
);
