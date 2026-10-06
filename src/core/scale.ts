/** Axis maths for charts: clean domains and tick values. Pure. */

/** The smallest 1, 2 or 5 × 10^n that is at least `value` (1 for 0 or less). */
export function niceStep(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const exponent: number = Math.floor(Math.log10(value));
  const fraction: number = value / 10 ** exponent;
  const nice: number =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

export interface NiceDomain {
  readonly min: number;
  readonly max: number;
  /** From min to max inclusive, evenly spaced on a clean step. */
  readonly ticks: readonly number[];
}

/**
 * A y-axis domain that always includes 0 (bars grow from a single
 * baseline), rounded out to a clean step, with about `tickCount` intervals.
 */
export function niceDomain(
  values: readonly number[],
  tickCount: number = 4
): NiceDomain {
  const finite: number[] = values.filter((v) => Number.isFinite(v));
  let low: number = Math.min(0, ...finite);
  let high: number = Math.max(0, ...finite);
  if (low === high) {
    high = 1;
    low = 0;
  }
  const step: number = niceStep((high - low) / Math.max(1, tickCount));
  const min: number = Math.floor(low / step) * step;
  const max: number = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  const count: number = Math.round((max - min) / step);
  for (let index = 0; index <= count; index++) {
    ticks.push(Number((min + index * step).toPrecision(12)));
  }
  return { min, max, ticks };
}

/**
 * Show every `n`th x label so at most `maxLabels` appear (always at least 1).
 */
export function labelStride(count: number, maxLabels: number = 6): number {
  return Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
}
