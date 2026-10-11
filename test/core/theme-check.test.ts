import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  MIN_SERIES_DISTANCE,
  checkTheme,
  type ThemeWarning,
} from '../../src/core/theme-check.js';
import { THEME_DEFAULTS } from '../../src/core/theme-defaults.js';
import { themePresets } from '../../src/core/theme-presets.js';
import {
  createTheme,
  type ThemeOptions,
  type WidgetThemeStyles,
} from '../../src/core/theme.js';

function themeOf(options: ThemeOptions): WidgetThemeStyles {
  const result = createTheme(options);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value;
}

function checks(options: ThemeOptions): readonly ThemeWarning[] {
  return checkTheme(themeOf(options));
}

void describe('checkTheme', () => {
  void it('passes the built-in palettes in both modes', () => {
    const asTokens = (mode: 'light' | 'dark'): ThemeOptions => {
      const variables = THEME_DEFAULTS[mode];
      const series: string[] = [];
      for (let slot = 1; slot <= 8; slot += 1) {
        series.push(variables[`--dwt-series-${slot}`] ?? '');
      }
      return {
        name: 'builtin',
        [mode]: {
          surface: variables['--dwt-surface'],
          page: variables['--dwt-page'],
          text: variables['--dwt-text'],
          textSecondary: variables['--dwt-text-secondary'],
          textMuted: variables['--dwt-text-muted'],
          link: variables['--dwt-link'],
          focus: variables['--dwt-focus'],
          good: variables['--dwt-good'],
          bad: variables['--dwt-bad'],
          series,
        },
      };
    };
    assert.deepEqual(checks(asTokens('light')), []);
    assert.deepEqual(checks(asTokens('dark')), []);
  });

  void it('flags low text contrast, naming the tokens, values and the ratio', () => {
    const warnings = checks({
      name: 'pale',
      light: { surface: '#ffffff', text: '#999999' },
    });
    assert.equal(warnings.length, 1);
    const [warning] = warnings;
    assert.equal(warning?.severity, 'warning');
    assert.equal(warning?.mode, 'light');
    assert.equal(warning?.check, 'contrast');
    assert.deepEqual(warning?.tokens, ['text', 'surface']);
    assert.equal(warning?.required, 4.5);
    assert.ok((warning?.value ?? 99) < 3);
    assert.match(
      warning?.message ?? '',
      /checkTheme "pale" light: text \(#999999\) on surface \(#ffffff\) has contrast 2\.85:1; text contrast needs 4\.5:1\./
    );
  });

  void it('flags a weak focus ring and low-contrast chart marks', () => {
    const warnings = checks({
      name: 'weak',
      base: {
        surface: '#ffffff',
        focus: '#dddddd',
        series: ['#eeeeee', '#2a78d6'],
      },
    });
    const kinds = warnings.map(
      (warning) => `${warning.mode} ${warning.tokens[0]}`
    );
    // `base` applies in both modes: the same pale ring on a white surface.
    assert.ok(kinds.includes('light focus'));
    assert.ok(kinds.includes('dark focus'));
    assert.ok(
      warnings.some(
        (w) => w.check === 'series-contrast' && w.tokens[0] === 'series[1]'
      )
    );
  });

  void it('checks only the modes a theme changes', () => {
    const lightOnly = checks({ name: 'x', light: { text: '#aaaaaa' } });
    assert.ok(lightOnly.every((warning) => warning.mode === 'light'));
    const base = checks({ name: 'y', base: { text: '#aaaaaa' } });
    // The same text color against the light and the dark surface: bad on light only.
    assert.deepEqual([...new Set(base.map((w) => w.mode))], ['light']);
  });

  void it('flags neighbouring series that look alike', () => {
    const warnings = checks({
      name: 'twins',
      light: { series: ['#2a78d6', '#2b79d6', '#eb6834'] },
    });
    const twin = warnings.find((w) => w.check === 'series-distinct');
    assert.deepEqual(twin?.tokens, ['series[1]', 'series[2]']);
    assert.equal(twin?.required, MIN_SERIES_DISTANCE);
    assert.match(twin?.message ?? '', /series\[1\] and series\[2\] look alike/);
  });

  void it('flags neighbours that only fail for color-vision deficiencies', () => {
    // A red and a green of similar lightness: apart for most, alike with protanopia.
    const warnings = checks({
      name: 'rg',
      light: { surface: '#ffffff', series: ['#b3402f', '#4f7a1d'] },
    });
    const pair = warnings.find((w) => w.check === 'series-distinct');
    assert.ok(pair, 'expected a color-vision warning');
    assert.match(pair.message, /look alike with .*(protanopia|deuteranopia)/);
  });

  void it('reports info, and skips, values it cannot read', () => {
    const warnings = checks({
      name: 'vars',
      light: { text: 'var(--brand-text)', focus: 'rebeccapurple' },
    });
    const info = warnings.find((w) => w.check === 'unchecked');
    assert.equal(info?.severity, 'info');
    assert.deepEqual(info?.tokens, ['text', 'focus']);
    assert.equal(warnings.filter((w) => w.severity === 'warning').length, 0);
  });

  void it('has nothing to say about a theme with no colors', () => {
    assert.deepEqual(
      checks({ name: 'sizes', base: { radius: '2px', gap: '4px' } }),
      []
    );
  });

  void it('flags a translucent surface that cannot be read without the page', () => {
    // 50% black over the (light) page is mid gray; black text on it is fine,
    // dark gray text is not.
    const warnings = checks({
      name: 'glass',
      light: { surface: 'rgba(0, 0, 0, 0.5)', text: '#333333' },
    });
    assert.ok(
      warnings.some((w) => w.check === 'contrast' && w.tokens[0] === 'text')
    );
  });
});

void describe('presets', () => {
  for (const [name, options] of Object.entries(themePresets)) {
    void it(`${name} builds and has no warnings`, () => {
      assert.deepEqual(checks(options), []);
    });
  }

  void it('can be renamed and rescoped by spreading', () => {
    const renamed = createTheme({
      ...themePresets.compact,
      name: 'tight',
      scope: '.app',
    });
    assert.ok(renamed.ok);
    assert.equal(renamed.value.scope, '.app');
    assert.match(renamed.value.css, /\.app \.dwt-dashboard/);
  });
});

void describe('THEME_DEFAULTS and styles.css', () => {
  const css: string = readFileSync(
    new URL('../../src/react/styles.css', import.meta.url),
    'utf8'
  );

  function declarations(block: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const match of block.matchAll(/(--dwt-[a-z0-9-]+):\s*([^;]+);/g)) {
      out[match[1] ?? ''] = (match[2] ?? '').trim();
    }
    return out;
  }

  void it('declares the same light values', () => {
    const start = css.indexOf(':where(.dwt-dashboard, .dwt-card) {');
    const end = css.indexOf('}', start);
    const light = declarations(css.slice(start, end));
    for (const [variable, value] of Object.entries(THEME_DEFAULTS.light)) {
      assert.equal(light[variable], value, `light ${variable}`);
    }
  });

  void it('declares the same dark values, in the media query and the forced block', () => {
    const media = css.indexOf('@media (prefers-color-scheme: dark)');
    const mediaBlock = css.slice(media, css.indexOf('\n  }', media));
    const forced = css.indexOf(":root:where([data-theme='dark'], .dark)");
    const forcedBlock = css.slice(forced, css.indexOf('\n}', forced));
    for (const block of [mediaBlock, forcedBlock]) {
      const dark = declarations(block);
      for (const [variable, value] of Object.entries(THEME_DEFAULTS.dark)) {
        assert.equal(dark[variable], value, `dark ${variable}`);
      }
    }
  });
});
