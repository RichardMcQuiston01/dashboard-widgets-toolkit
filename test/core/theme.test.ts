import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTheme, type WidgetThemeStyles } from '../../src/core/index.js';

function build(options: Parameters<typeof createTheme>[0]): WidgetThemeStyles {
  const result = createTheme(options);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value;
}

function failure(options: Parameters<typeof createTheme>[0]): string {
  const result = createTheme(options);
  assert.ok(!result.ok, 'expected an error');
  return result.error;
}

describe('createTheme', () => {
  it('writes base tokens under the default scope', () => {
    const theme: WidgetThemeStyles = build({
      name: 'brand',
      base: {
        link: '#0a7d5a',
        radius: '12px',
        series: ['#112233', 'rgb(1 2 3 / 50%)'],
      },
    });
    assert.equal(theme.scope, "[data-dwt-theme='brand']");
    assert.deepEqual(theme.variables.base, {
      '--dwt-link': '#0a7d5a',
      '--dwt-radius': '12px',
      '--dwt-series-1': '#112233',
      '--dwt-series-2': 'rgb(1 2 3 / 50%)',
    });
    assert.match(
      theme.css,
      /\[data-dwt-theme='brand'\] \.dwt-dashboard,\n\[data-dwt-theme='brand'\] \.dwt-card \{\n {2}--dwt-link: #0a7d5a;/
    );
    assert.doesNotMatch(theme.css, /@media/);
  });

  it('scopes light and dark tokens to their own mode', () => {
    const theme: WidgetThemeStyles = build({
      name: 'brand',
      light: { surface: '#ffffff' },
      dark: { surface: '#101010', font: "'Inter', system-ui, sans-serif" },
    });
    assert.match(
      theme.css,
      /:root:where\(\[data-theme='light'\]\) \[data-dwt-theme='brand'\] \.dwt-dashboard/
    );
    assert.match(
      theme.css,
      /@media \(prefers-color-scheme: light\) \{\n {2}:root:where\(:not\(\[data-theme='dark'\], \.dark\)\)/
    );
    assert.match(
      theme.css,
      /:root:where\(\[data-theme='dark'\], \.dark\) \[data-dwt-theme='brand'\] \.dwt-card/
    );
    assert.match(
      theme.css,
      /@media \(prefers-color-scheme: dark\) \{\n {2}:root:where\(:not\(\[data-theme='light'\]\)\)/
    );
    assert.match(theme.css, /--dwt-font: 'Inter', system-ui, sans-serif;/);
    assert.deepEqual(theme.variables.light, { '--dwt-surface': '#ffffff' });
  });

  it('accepts a custom scope and var() references', () => {
    const theme: WidgetThemeStyles = build({
      name: 'x',
      scope: '.reports .area',
      base: {
        text: 'var(--brand-ink, #111)',
        gap: 'calc(1rem + 2px)',
        padding: '0',
      },
    });
    assert.match(theme.css, /^\.reports \.area \.dwt-dashboard,/);
  });

  it('rejects a bad name and an unsafe scope', () => {
    assert.match(
      failure({ name: 'Brand', base: { link: '#fff' } }),
      /name "Brand"/
    );
    assert.match(
      failure({ name: 'a', scope: 'body, html', base: { link: '#fff' } }),
      /scope "body, html"/
    );
  });

  it('rejects an empty theme', () => {
    assert.match(failure({ name: 'empty' }), /no tokens were set/);
    assert.match(failure({ name: 'empty', base: {} }), /no tokens were set/);
  });

  it('names the mode, token and value for a bad color or length', () => {
    assert.match(
      failure({ name: 'brand', dark: { surface: 'rgb(0,0' } }),
      /createTheme "brand": dark\.surface "rgb\(0,0" is not a color|unbalanced/
    );
    assert.match(
      failure({ name: 'brand', base: { radius: '12' } }),
      /base\.radius "12" is not a length/
    );
    assert.match(
      failure({ name: 'brand', base: { link: '#12' } }),
      /base\.link "#12" is not a color/
    );
  });

  it('refuses values that could escape the declaration', () => {
    const attempts: readonly string[] = [
      '#fff; } body { display: none',
      'red} .x{color:blue',
      'url(https://example.com/x.png)',
      'rgb(0 0 0)/* hi */',
      'red\nblue',
      '@import',
    ];
    for (const value of attempts) {
      const reason: string = failure({ name: 'brand', base: { text: value } });
      assert.match(reason, /base\.text/, value);
    }
    assert.match(
      failure({ name: 'brand', base: { font: "Inter'; } body { x: '" } }),
      /base\.font/
    );
    assert.match(
      failure({ name: 'brand', base: { font: "'Inter, serif" } }),
      /unclosed quote/
    );
  });

  it('rejects unknown tokens, non-string values and too many series', () => {
    assert.match(
      failure({ name: 'brand', base: { linkColor: '#fff' } as never }),
      /base\.linkColor is not a theme token/
    );
    assert.match(
      failure({ name: 'brand', base: { link: 5 } as never }),
      /base\.link must be a string/
    );
    assert.match(
      failure({ name: 'brand', base: { series: Array(9).fill('#fff') } }),
      /9 colors; charts draw at most 8/
    );
    assert.match(
      failure({ name: 'brand', base: { series: ['#fff', 'nope!'] } }),
      /base\.series\[1\] "nope!"/
    );
    assert.match(
      failure({ name: 'brand', base: { series: [] } }),
      /non-empty array/
    );
  });
});
