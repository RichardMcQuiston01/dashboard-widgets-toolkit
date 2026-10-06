/**
 * Number formatting via `Intl`, with an injectable locale (undefined uses
 * the runtime's default), plus KPI period-over-period deltas.
 */

import type { ValueFormat } from './payload.js';

export type Locale = string | readonly string[] | undefined;

export interface FormatOptions {
  readonly locale?: Locale;
  /** ISO 4217 code for `currency`. Default "USD". */
  readonly currency?: string;
  /** "1.2K" style, for axis ticks. */
  readonly compact?: boolean;
}

export const DEFAULT_CURRENCY = 'USD';

function localeArgument(locale: Locale): string | string[] | undefined {
  return locale === undefined || typeof locale === 'string'
    ? locale
    : [...locale];
}

function numberFormat(
  locale: Locale,
  options: Intl.NumberFormatOptions
): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(localeArgument(locale), options);
  } catch {
    // An invalid locale tag or currency code: fall back to the default
    // locale and a plain number rather than throwing mid-render.
    const { style: _style, currency: _currency, ...rest } = options;
    return new Intl.NumberFormat(undefined, rest);
  }
}

/**
 * Formats `value` as a count ("1,284"), money ("$12.50", major units) or a
 * percent ("25%" from 0.25).
 */
export function formatValue(
  value: number,
  format: ValueFormat,
  options: FormatOptions = {}
): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const compact: Intl.NumberFormatOptions = options.compact
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : {};
  switch (format) {
    case 'number':
      return numberFormat(options.locale, {
        maximumFractionDigits: 2,
        ...compact,
      }).format(value);
    case 'currency': {
      const currency: string = (
        options.currency ?? DEFAULT_CURRENCY
      ).toUpperCase();
      const formatter = numberFormat(options.locale, {
        style: 'currency',
        currency,
        ...compact,
      });
      const text: string = formatter.format(value);
      // The fallback formatter has no currency, so say which one it was.
      return formatter.resolvedOptions().style === 'currency'
        ? text
        : `${text} ${currency}`;
    }
    case 'percent':
      return numberFormat(options.locale, {
        style: 'percent',
        maximumFractionDigits: 1,
        ...compact,
      }).format(value);
  }
}

/** A plain count, e.g. "1,284". */
export function formatCount(value: number, locale?: Locale): string {
  return formatValue(value, 'number', { locale });
}

/** `part` as a whole percentage of `total` (0 when total is 0 or less). */
export function shareOf(part: number, total: number): number {
  return total <= 0 ? 0 : Math.round((part / total) * 100);
}

/**
 * Change from `previous` to `current` in percent (unrounded), or null when
 * there is nothing to compare: no previous value, or a previous of 0.
 */
export function percentChange(
  current: number,
  previous: number | null | undefined
): number | null {
  if (
    previous === null ||
    previous === undefined ||
    previous === 0 ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current)
  ) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * "+12%", "-8%", "±0%". Below 10% one decimal is kept ("+2.5%"), so small
 * changes don't round away.
 */
export function formatPercentChange(change: number, locale?: Locale): string {
  const digits: number = Math.abs(change) < 10 ? 1 : 0;
  const rounded: number = Number(change.toFixed(digits));
  if (rounded === 0) {
    return '±0%';
  }
  return numberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  }).format(rounded / 100);
}

export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaSentiment = 'good' | 'bad' | 'neutral';

export interface KpiDelta {
  /** Percent change, unrounded. */
  readonly percent: number;
  readonly direction: DeltaDirection;
  /** Direction combined with whether higher is better. */
  readonly sentiment: DeltaSentiment;
  /** "+12%" */
  readonly text: string;
  /** "+12% vs previous period" */
  readonly description: string;
}

export interface KpiDeltaOptions {
  /** Default true. */
  readonly higherIsBetter?: boolean;
  readonly locale?: Locale;
  /** What the change is against. Default "previous period". */
  readonly comparisonLabel?: string;
}

/** The default comparison wording in delta descriptions. */
export const DEFAULT_COMPARISON_LABEL = 'previous period';

/**
 * The period-over-period change for a KPI, or null when it can't be worked
 * out (no previous value, or a previous of 0).
 */
export function kpiDelta(
  current: number,
  previous: number | null | undefined,
  options: KpiDeltaOptions = {}
): KpiDelta | null {
  const percent: number | null = percentChange(current, previous);
  if (percent === null) {
    return null;
  }
  const text: string = formatPercentChange(percent, options.locale);
  const direction: DeltaDirection =
    text === '±0%' ? 'flat' : percent > 0 ? 'up' : 'down';
  const higherIsBetter: boolean = options.higherIsBetter ?? true;
  const sentiment: DeltaSentiment =
    direction === 'flat'
      ? 'neutral'
      : (direction === 'up') === higherIsBetter
        ? 'good'
        : 'bad';
  return {
    percent,
    direction,
    sentiment,
    text,
    description: `${text} vs ${options.comparisonLabel ?? DEFAULT_COMPARISON_LABEL}`,
  };
}
