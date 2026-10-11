/**
 * Ready-made themes: plain `ThemeOptions` objects to pass to `createTheme`
 * (spread them to change the `name` or `scope`), and examples of what a theme
 * looks like. Each color preset is checked by `checkTheme` in a test.
 */

import type { ThemeOptions } from './theme.js';

/**
 * Maximum contrast: black on white (white on black in dark mode), strong
 * borders and a bright focus ring, and chart colors that stay apart for
 * viewers with a color-vision deficiency.
 */
const highContrast: ThemeOptions = {
  name: 'high-contrast',
  light: {
    surface: '#ffffff',
    page: '#ffffff',
    text: '#000000',
    textSecondary: '#1a1a1a',
    textMuted: '#333333',
    border: '#000000',
    grid: '#767676',
    baseline: '#000000',
    crosshair: '#000000',
    link: '#0000cc',
    focus: '#0000cc',
    good: '#005a00',
    bad: '#a80000',
    buttonHover: 'rgba(0, 0, 0, 0.12)',
    series: [
      '#0050b3',
      '#c25400',
      '#00785a',
      '#7a5a00',
      '#b3235f',
      '#3c3c3c',
      '#5b3cc4',
      '#a80000',
    ],
  },
  dark: {
    surface: '#000000',
    page: '#000000',
    text: '#ffffff',
    textSecondary: '#f0f0f0',
    textMuted: '#d6d6d6',
    border: '#ffffff',
    grid: '#8a8a8a',
    baseline: '#ffffff',
    crosshair: '#ffffff',
    link: '#7fb8ff',
    focus: '#ffdd00',
    good: '#4be04b',
    bad: '#ff8585',
    buttonHover: 'rgba(255, 255, 255, 0.2)',
    series: [
      '#66a8ff',
      '#ff9a4d',
      '#33d1a0',
      '#f2d44d',
      '#ff7ab0',
      '#d0d0d0',
      '#b49cff',
      '#ff6b6b',
    ],
  },
};

/** Tighter spacing and smaller corners, for dense dashboards. No colors. */
const compact: ThemeOptions = {
  name: 'compact',
  base: {
    radius: '4px',
    gap: '8px',
    padding: '10px',
    minColumn: '240px',
  },
};

/**
 * Grayscale, for print or when color must not carry meaning. The eight series
 * differ in lightness and are ordered so that neighbours are far apart; tell
 * them apart by the legend and the labels.
 */
const mono: ThemeOptions = {
  name: 'mono',
  light: {
    series: [
      '#1f1f1f',
      '#4a4a4a',
      '#767676',
      '#2b2b2b',
      '#5c5c5c',
      '#8a8a8a',
      '#383838',
      '#686868',
    ],
  },
  dark: {
    series: [
      '#e6e6e6',
      '#b5b5b5',
      '#8c8c8c',
      '#cfcfcf',
      '#a0a0a0',
      '#7a7a7a',
      '#d9d9d9',
      '#9a9a9a',
    ],
  },
};

/** The presets by name. */
export const themePresets = { highContrast, compact, mono } as const;

export type ThemePresetName = keyof typeof themePresets;
