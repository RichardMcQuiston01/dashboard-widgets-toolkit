/**
 * Default colours, used as `var(--dwt-*, fallback)` so charts read correctly
 * without the stylesheet. `styles.css` redefines them for dark mode, and an
 * app can override any of them with its own CSS custom properties.
 *
 * The categorical order is the dataviz reference palette, validated for
 * colour-vision deficiency on adjacent pairs in light and dark modes. Slots
 * are assigned in this fixed order, never cycled, and follow the series
 * (its position in the payload), never its rank.
 */
export const DEFAULT_SERIES_COLORS: readonly string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

/** `var(--dwt-series-N, #hex)` for the series at `index` (0-based). */
export function seriesColor(index: number): string {
  const slot: number = Math.min(index, DEFAULT_SERIES_COLORS.length - 1);
  return `var(--dwt-series-${slot + 1}, ${DEFAULT_SERIES_COLORS[slot] ?? '#2a78d6'})`;
}

export const CHART_COLORS = {
  surface: 'var(--dwt-surface, #fcfcfb)',
  grid: 'var(--dwt-grid, #e1e0d9)',
  baseline: 'var(--dwt-baseline, #c3c2b7)',
  textMuted: 'var(--dwt-text-muted, #6b6a66)',
  textPrimary: 'var(--dwt-text, #0b0b0b)',
  crosshair: 'var(--dwt-crosshair, #898781)',
  meterTrack: 'var(--dwt-meter-track, #cde2fb)',
  barTrack: 'var(--dwt-bar-track, #f0efec)',
} as const;
