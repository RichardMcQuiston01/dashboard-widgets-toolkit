/**
 * Contrast and color-vision checks for a theme. `checkTheme` returns warnings,
 * never failures: a theme is the consumer's choice, and a warning names what
 * will be hard to read and by how much. Thresholds:
 *
 * - Text tokens on the surface: WCAG AA, 4.5:1.
 * - Focus ring, good and bad on the surface: 3:1 (non-text contrast).
 * - Chart marks (series) on the surface: 2:1. WCAG asks 3:1 for graphics, but
 *   the built-in light palette's yellow is 2.1:1; charts have a legend,
 *   tooltips and a table twin, so 2:1 is the floor below which a mark vanishes.
 * - Adjacent series: at least 0.10 apart in OKLab, and at least 0.05 under
 *   simulated protanopia, deuteranopia and tritanopia. Calibrated so the
 *   built-in palettes pass.
 *
 * Values the checks cannot read (`var()`, `color-mix()`, most named colors) are
 * reported as `info` and their checks skipped. See docs/design/theming.md.
 */

import {
  VISION_TYPES,
  colorDistance,
  composite,
  contrastRatio,
  parseColor,
  simulateVision,
  type Rgba,
  type VisionType,
} from './color.js';
import { MAX_GRAPH_SERIES } from './payload.js';
import { THEME_TOKEN_VARIABLES, type WidgetThemeStyles } from './theme.js';
import { THEME_DEFAULTS, type ThemeDefaultMode } from './theme-defaults.js';

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_NON_TEXT_CONTRAST = 3;
export const MIN_SERIES_CONTRAST = 2;
export const MIN_SERIES_DISTANCE = 0.1;
export const MIN_SERIES_DISTANCE_COLOR_VISION = 0.05;

export type ThemeCheckKind =
  'contrast' | 'series-contrast' | 'series-distinct' | 'unchecked';

export interface ThemeWarning {
  /** `warning`: a problem. `info`: a check was skipped. */
  readonly severity: 'warning' | 'info';
  readonly mode: ThemeDefaultMode;
  readonly check: ThemeCheckKind;
  /** The theme keys involved, e.g. `['text', 'surface']` or `['series[3]']`. */
  readonly tokens: readonly string[];
  readonly message: string;
  /** What was measured: a contrast ratio or a color distance. */
  readonly value?: number;
  /** What it should be at least. */
  readonly required?: number;
}

const KEY_BY_VARIABLE: ReadonlyMap<string, string> = new Map(
  Object.entries(THEME_TOKEN_VARIABLES).map(([key, variable]) => [
    variable,
    key,
  ])
);

function keyOf(variable: string): string {
  const series: RegExpMatchArray | null =
    variable.match(/^--dwt-series-(\d+)$/);
  if (series !== null) return `series[${Number(series[1])}]`;
  return KEY_BY_VARIABLE.get(variable) ?? variable;
}

function round(value: number, places: number): number {
  const factor: number = 10 ** places;
  return Math.round(value * factor) / factor;
}

const NON_COLOR_KEYS: ReadonlySet<string> = new Set([
  'font',
  'radius',
  'gap',
  'padding',
  'minColumn',
]);

const TEXT_ON_SURFACE: readonly string[] = [
  '--dwt-text',
  '--dwt-text-secondary',
  '--dwt-text-muted',
  '--dwt-link',
];
const NON_TEXT_ON_SURFACE: readonly string[] = [
  '--dwt-focus',
  '--dwt-good',
  '--dwt-bad',
];

function checkMode(
  themeName: string,
  mode: ThemeDefaultMode,
  values: Readonly<Record<string, string>>
): ThemeWarning[] {
  const warnings: ThemeWarning[] = [];
  const label = `checkTheme "${themeName}" ${mode}`;
  const unchecked = new Set<string>();
  const read = (variable: string): Rgba | undefined => {
    const parsed: Rgba | undefined = parseColor(values[variable] ?? '');
    if (parsed === undefined) unchecked.add(variable);
    return parsed;
  };

  const page: Rgba | undefined = read('--dwt-page');
  const rawSurface: Rgba | undefined = read('--dwt-surface');
  const surface: Rgba | undefined =
    rawSurface === undefined
      ? undefined
      : page === undefined
        ? rawSurface.a === 1
          ? rawSurface
          : undefined
        : composite(rawSurface, page);

  const checkContrast = (variable: string, required: number): void => {
    const color: Rgba | undefined = read(variable);
    if (color === undefined || surface === undefined) return;
    const ratio: number = contrastRatio(composite(color, surface), surface);
    if (ratio < required) {
      const kind: string = required === MIN_TEXT_CONTRAST ? 'text' : 'non-text';
      warnings.push({
        severity: 'warning',
        mode,
        check: 'contrast',
        tokens: [keyOf(variable), 'surface'],
        message: `${label}: ${keyOf(variable)} (${values[variable]}) on surface (${values['--dwt-surface']}) has contrast ${round(ratio, 2)}:1; ${kind} contrast needs ${required}:1.`,
        value: round(ratio, 2),
        required,
      });
    }
  };
  for (const variable of TEXT_ON_SURFACE) {
    checkContrast(variable, MIN_TEXT_CONTRAST);
  }
  for (const variable of NON_TEXT_ON_SURFACE) {
    checkContrast(variable, MIN_NON_TEXT_CONTRAST);
  }

  const series: (Rgba | undefined)[] = [];
  for (let slot = 1; slot <= MAX_GRAPH_SERIES; slot += 1) {
    const variable = `--dwt-series-${slot}`;
    const color: Rgba | undefined = read(variable);
    series.push(color);
    if (color === undefined || surface === undefined) continue;
    const ratio: number = contrastRatio(composite(color, surface), surface);
    if (ratio < MIN_SERIES_CONTRAST) {
      warnings.push({
        severity: 'warning',
        mode,
        check: 'series-contrast',
        tokens: [keyOf(variable), 'surface'],
        message: `${label}: ${keyOf(variable)} (${values[variable]}) on surface (${values['--dwt-surface']}) has contrast ${round(ratio, 2)}:1; chart marks need at least ${MIN_SERIES_CONTRAST}:1 to stay visible.`,
        value: round(ratio, 2),
        required: MIN_SERIES_CONTRAST,
      });
    }
  }

  for (let index = 0; index + 1 < series.length; index += 1) {
    const first: Rgba | undefined = series[index];
    const second: Rgba | undefined = series[index + 1];
    if (first === undefined || second === undefined) continue;
    const a: Rgba = surface === undefined ? first : composite(first, surface);
    const b: Rgba = surface === undefined ? second : composite(second, surface);
    const names: readonly string[] = [
      keyOf(`--dwt-series-${index + 1}`),
      keyOf(`--dwt-series-${index + 2}`),
    ];
    const distance: number = colorDistance(a, b);
    if (distance < MIN_SERIES_DISTANCE) {
      warnings.push({
        severity: 'warning',
        mode,
        check: 'series-distinct',
        tokens: names,
        message: `${label}: ${names[0]} and ${names[1]} look alike (distance ${round(distance, 3)}, needs ${MIN_SERIES_DISTANCE}); neighbouring series are hard to tell apart.`,
        value: round(distance, 3),
        required: MIN_SERIES_DISTANCE,
      });
      continue;
    }
    const failing: { type: VisionType; distance: number }[] = [];
    for (const type of VISION_TYPES) {
      const seen: number = colorDistance(
        simulateVision(a, type),
        simulateVision(b, type)
      );
      if (seen < MIN_SERIES_DISTANCE_COLOR_VISION) {
        failing.push({ type, distance: seen });
      }
    }
    if (failing.length > 0) {
      const worst: number = Math.min(...failing.map((entry) => entry.distance));
      warnings.push({
        severity: 'warning',
        mode,
        check: 'series-distinct',
        tokens: names,
        message: `${label}: ${names[0]} and ${names[1]} look alike with ${failing.map((entry) => entry.type).join(', ')} (distance ${round(worst, 3)}, needs ${MIN_SERIES_DISTANCE_COLOR_VISION}).`,
        value: round(worst, 3),
        required: MIN_SERIES_DISTANCE_COLOR_VISION,
      });
    }
  }

  if (unchecked.size > 0) {
    const names: string[] = [...unchecked].map(keyOf);
    warnings.push({
      severity: 'info',
      mode,
      check: 'unchecked',
      tokens: names,
      message: `${label}: could not read ${names.join(', ')} as a color (var(), color-mix() and most named colors depend on the page), so the checks that use them were skipped.`,
    });
  }
  return warnings;
}

/**
 * Checks the colors of a theme from `createTheme` in each mode it changes
 * (light, dark or both; a mode the theme leaves alone keeps the built-in
 * palette, which passes). Tokens the theme does not set resolve to the
 * built-in value. Returns no warnings for a theme that sets no color.
 */
export function checkTheme(
  theme: Pick<WidgetThemeStyles, 'name' | 'variables'>
): readonly ThemeWarning[] {
  const warnings: ThemeWarning[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const base: Readonly<Record<string, string>> = theme.variables.base;
    const own: Readonly<Record<string, string>> = theme.variables[mode];
    const touchesColor: boolean = [
      ...Object.keys(base),
      ...Object.keys(own),
    ].some((variable) => !NON_COLOR_KEYS.has(keyOf(variable)));
    if (!touchesColor) continue;
    warnings.push(
      ...checkMode(theme.name, mode, {
        ...THEME_DEFAULTS[mode],
        ...base,
        ...own,
      })
    );
  }
  return warnings;
}
