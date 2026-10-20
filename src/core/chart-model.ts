import type { GraphWidgetData } from './payload.js';
import { niceDomain, type NiceDomain } from './scale.js';

/**
 * The geometry and data model of the GRAPH chart: pure functions, so every
 * renderer (React, Vue) draws the same marks. Follows the dataviz marks spec
 * (see CLAUDE.md, Charts).
 */

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 220;
export const CHART_MARGIN = {
  top: 16,
  right: 20,
  bottom: 28,
  left: 56,
} as const;
export const CHART_INNER_WIDTH: number =
  CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
export const CHART_INNER_HEIGHT: number =
  CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
export const CHART_MAX_BAR_WIDTH = 24;
export const CHART_BAR_GAP = 2;
export const CHART_BAR_RADIUS = 4;
/** Above this many points, line markers are only drawn at the end. */
export const CHART_MAX_MARKED_POINTS = 24;

/** A bar with a rounded data end and a square end on the baseline. */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  roundedEnd: 'top' | 'bottom'
): string {
  const r: number = Math.max(0, Math.min(CHART_BAR_RADIUS, width / 2, height));
  const right: number = x + width;
  const bottom: number = y + height;
  const f = (n: number): string => n.toFixed(2);
  if (roundedEnd === 'top') {
    return `M${f(x)},${f(bottom)}V${f(y + r)}Q${f(x)},${f(y)} ${f(x + r)},${f(y)}H${f(right - r)}Q${f(right)},${f(y)} ${f(right)},${f(y + r)}V${f(bottom)}Z`;
  }
  return `M${f(x)},${f(y)}V${f(bottom - r)}Q${f(x)},${f(bottom)} ${f(x + r)},${f(bottom)}H${f(right - r)}Q${f(right)},${f(bottom)} ${f(right)},${f(bottom - r)}V${f(y)}Z`;
}

export interface ChartModel {
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

export function chartY(domain: NiceDomain, value: number): number {
  const range: number = domain.max - domain.min || 1;
  return CHART_MARGIN.top + CHART_INNER_HEIGHT * ((domain.max - value) / range);
}

/** Bar charts center each label in a slot; lines span the full width. */
export function chartX(
  chartType: 'bar' | 'line',
  count: number,
  index: number
): number {
  if (chartType === 'bar') {
    const slot: number = CHART_INNER_WIDTH / Math.max(1, count);
    return CHART_MARGIN.left + slot * index + slot / 2;
  }
  return count <= 1
    ? CHART_MARGIN.left + CHART_INNER_WIDTH / 2
    : CHART_MARGIN.left + (index / (count - 1)) * CHART_INNER_WIDTH;
}

/** The x band a pointer must be in to select `index` (bigger than the mark). */
export function chartHitBand(
  chartType: 'bar' | 'line',
  count: number,
  index: number
): { x: number; width: number } {
  if (chartType === 'bar' || count <= 1) {
    const slot: number = CHART_INNER_WIDTH / Math.max(1, count);
    return { x: CHART_MARGIN.left + slot * index, width: slot };
  }
  const step: number = CHART_INNER_WIDTH / (count - 1);
  const left: number = Math.max(
    CHART_MARGIN.left,
    chartX('line', count, index) - step / 2
  );
  const right: number = Math.min(
    CHART_MARGIN.left + CHART_INNER_WIDTH,
    chartX('line', count, index) + step / 2
  );
  return { x: left, width: right - left };
}

export function chartLinePath(
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
    path += `${penDown ? 'L' : 'M'}${chartX('line', count, index).toFixed(2)},${chartY(domain, value).toFixed(2)}`;
    penDown = true;
  });
  return path;
}

export function chartAreaPath(
  values: readonly (number | null)[],
  domain: NiceDomain,
  count: number
): string | null {
  if (values.some((value) => value === null) || values.length < 2) {
    return null;
  }
  const baseline: number = chartY(
    domain,
    Math.max(domain.min, Math.min(0, domain.max))
  );
  const first: string = chartX('line', count, 0).toFixed(2);
  const last: string = chartX('line', count, count - 1).toFixed(2);
  return `M${first},${baseline.toFixed(2)}${chartLinePath(values, domain, count).replace(/^M/, 'L')}L${last},${baseline.toFixed(2)}Z`;
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
