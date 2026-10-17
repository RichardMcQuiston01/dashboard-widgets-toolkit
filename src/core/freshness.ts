/**
 * How old a widget's data is, in words ("2 minutes ago"). Pure: pass the
 * current time in. See docs/design/freshness.md.
 */

export interface AgeOptions {
  /** BCP 47 locale for the unit words. Default: the runtime's. */
  readonly locale?: string | readonly string[];
  /** Shown for anything under `justNowMs`. Default `just now`. */
  readonly justNow?: string;
  /** Ages below this read as `justNow`. Default 45 seconds. */
  readonly justNowMs?: number;
}

export type AgeUnit = 'minute' | 'hour' | 'day';

export interface Age {
  /** `justNow` is true when the age is below the cutoff; then `value` is 0. */
  readonly justNow: boolean;
  readonly unit: AgeUnit;
  /** Whole units, rounded down, at least 1 unless `justNow`. */
  readonly value: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Age of `updatedAt` at `now` (both epoch ms). A time in the future counts as just now. */
export function ageOf(updatedAt: number, now: number, justNowMs = 45_000): Age {
  const elapsed: number = now - updatedAt;
  if (!Number.isFinite(elapsed) || elapsed < justNowMs) {
    return { justNow: true, unit: 'minute', value: 0 };
  }
  if (elapsed < HOUR_MS) {
    return {
      justNow: false,
      unit: 'minute',
      value: Math.max(1, Math.floor(elapsed / MINUTE_MS)),
    };
  }
  if (elapsed < DAY_MS) {
    return {
      justNow: false,
      unit: 'hour',
      value: Math.floor(elapsed / HOUR_MS),
    };
  }
  return { justNow: false, unit: 'day', value: Math.floor(elapsed / DAY_MS) };
}

/**
 * "just now", "2 minutes ago", "3 hours ago", "2 days ago" in the given
 * locale, using `Intl.RelativeTimeFormat`.
 */
export function formatAge(
  updatedAt: number,
  now: number,
  options: AgeOptions = {}
): string {
  const age: Age = ageOf(updatedAt, now, options.justNowMs);
  if (age.justNow) return options.justNow ?? 'just now';
  const formatter = new Intl.RelativeTimeFormat(
    options.locale === undefined ? undefined : [...[options.locale].flat()],
    { numeric: 'always', style: 'long' }
  );
  return formatter.format(-age.value, age.unit);
}

/**
 * Milliseconds until the text `formatAge` gives for `updatedAt` next changes:
 * a timer for a UI that keeps the label current. At least one second.
 */
export function msUntilAgeChanges(
  updatedAt: number,
  now: number,
  justNowMs = 45_000
): number {
  const elapsed: number = Math.max(0, now - updatedAt);
  const boundary: number =
    elapsed < justNowMs
      ? justNowMs
      : elapsed < HOUR_MS
        ? (Math.floor(elapsed / MINUTE_MS) + 1) * MINUTE_MS
        : elapsed < DAY_MS
          ? (Math.floor(elapsed / HOUR_MS) + 1) * HOUR_MS
          : (Math.floor(elapsed / DAY_MS) + 1) * DAY_MS;
  return Math.max(1000, boundary - elapsed);
}
