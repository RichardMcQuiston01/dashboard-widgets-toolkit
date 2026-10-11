/**
 * The built-in value of every theme token in each mode, keyed by CSS custom
 * property. `styles.css` declares the same values (a test keeps them equal), so
 * `checkTheme` can resolve the tokens a theme leaves unset. Series are
 * `--dwt-series-1` to `--dwt-series-8`.
 */

import type { ThemeMode } from './theme.js';

export type ThemeDefaultMode = Exclude<ThemeMode, 'base'>;

export const THEME_DEFAULTS: Readonly<
  Record<ThemeDefaultMode, Readonly<Record<string, string>>>
> = {
  light: {
    '--dwt-surface': '#fcfcfb',
    '--dwt-page': '#f9f9f7',
    '--dwt-text': '#0b0b0b',
    '--dwt-text-secondary': '#52514e',
    '--dwt-text-muted': '#6b6a66',
    '--dwt-border': 'rgba(11, 11, 11, 0.1)',
    '--dwt-grid': '#e1e0d9',
    '--dwt-baseline': '#c3c2b7',
    '--dwt-crosshair': '#898781',
    '--dwt-link': '#1c5cab',
    '--dwt-good': '#006300',
    '--dwt-bad': '#d03b3b',
    '--dwt-meter-track': '#cde2fb',
    '--dwt-bar-track': '#f0efec',
    '--dwt-button-hover': 'rgba(11, 11, 11, 0.06)',
    '--dwt-focus': '#2a78d6',
    '--dwt-series-1': '#2a78d6',
    '--dwt-series-2': '#eb6834',
    '--dwt-series-3': '#1baf7a',
    '--dwt-series-4': '#eda100',
    '--dwt-series-5': '#e87ba4',
    '--dwt-series-6': '#008300',
    '--dwt-series-7': '#4a3aa7',
    '--dwt-series-8': '#e34948',
  },
  dark: {
    '--dwt-surface': '#1a1a19',
    '--dwt-page': '#0d0d0d',
    '--dwt-text': '#ffffff',
    '--dwt-text-secondary': '#c3c2b7',
    '--dwt-text-muted': '#a3a29b',
    '--dwt-border': 'rgba(255, 255, 255, 0.1)',
    '--dwt-grid': '#2c2c2a',
    '--dwt-baseline': '#383835',
    '--dwt-crosshair': '#898781',
    '--dwt-link': '#86b6ef',
    '--dwt-good': '#0ca30c',
    '--dwt-bad': '#e66767',
    '--dwt-meter-track': '#104281',
    '--dwt-bar-track': '#383835',
    '--dwt-button-hover': 'rgba(255, 255, 255, 0.08)',
    '--dwt-focus': '#3987e5',
    '--dwt-series-1': '#3987e5',
    '--dwt-series-2': '#d95926',
    '--dwt-series-3': '#199e70',
    '--dwt-series-4': '#c98500',
    '--dwt-series-5': '#d55181',
    '--dwt-series-6': '#008300',
    '--dwt-series-7': '#9085e9',
    '--dwt-series-8': '#e66767',
  },
};
