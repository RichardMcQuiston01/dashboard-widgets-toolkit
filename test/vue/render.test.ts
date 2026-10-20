import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSSRApp, defineComponent, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';

import {
  createTheme,
  defineWidget,
  themePresets,
} from '../../src/core/index.js';
import type { WidgetData } from '../../src/core/payload.js';
import {
  ResolvedWidgetCard,
  WidgetContent,
  WidgetSettingsProvider,
  WidgetTheme,
  useWidgets,
  type CellFormatterProblem,
} from '../../src/vue/index.js';

async function render(root: Component): Promise<string> {
  return renderToString(createSSRApp(root));
}

function withSettings(
  settings: Record<string, unknown>,
  child: () => ReturnType<typeof h>
): Component {
  return defineComponent(
    () => () => h(WidgetSettingsProvider, settings, { default: child })
  );
}

const table = (formatter: string): WidgetData => ({
  kind: 'TABLE',
  columns: [{ label: 'Status', type: 'custom', formatter }],
  rows: [[{ text: 'late' }]],
});

void describe('WidgetSettingsProvider', () => {
  void it('overrides labels and adds classes without replacing dwt-*', async () => {
    const markup = await render(
      withSettings(
        {
          labels: { loading: 'Cargando…' },
          classNames: { card: 'rounded-lg' },
        },
        () =>
          h(ResolvedWidgetCard, {
            widget: {
              status: 'loading',
              definition: { key: 'k', title: 'Ventas', kind: 'TEXT' },
            },
          })
      )
    );
    assert.match(markup, /Cargando…/);
    assert.match(markup, /class="dwt-card dwt-card--loading rounded-lg"/);
    assert.match(markup, /data-widget-key="k"/);
  });

  void it('uses the defaults outside a provider', async () => {
    const markup = await render(
      defineComponent(
        () => () =>
          h(ResolvedWidgetCard, {
            widget: {
              status: 'error',
              definition: { key: 'k', title: 'Sales', kind: 'TEXT' },
              error: 'It broke.',
            },
            onRetry: () => undefined,
          })
      )
    );
    assert.match(markup, /It broke\./);
    assert.match(markup, />Retry</);
  });
});

void describe('custom column formatters', () => {
  void it('draws what a registered formatter returns', async () => {
    const markup = await render(
      withSettings(
        {
          formatters: {
            badge: ({ text }: { text: string }) =>
              h('b', { class: 'badge' }, text.toUpperCase()),
          },
        },
        () => h(WidgetContent, { data: table('badge') })
      )
    );
    assert.match(markup, /<b class="badge">LATE<\/b>/);
    assert.match(markup, /dwt-visually-hidden">late</);
  });

  void it('shows the text and reports a missing formatter', async () => {
    const problems: CellFormatterProblem[] = [];
    const markup = await render(
      withSettings(
        { onFormatterError: (p: CellFormatterProblem) => problems.push(p) },
        () => h(WidgetContent, { data: table('nope'), widgetKey: 'orders' })
      )
    );
    assert.match(markup, /<td>late<\/td>/);
    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? '', /widget "orders" column c0/);
    assert.match(
      problems[0]?.message ?? '',
      /formatter "nope", which is not registered/
    );
  });

  void it('shows the text and reports a formatter that throws', async () => {
    const problems: CellFormatterProblem[] = [];
    const markup = await render(
      withSettings(
        {
          formatters: {
            boom: () => {
              throw new Error('no data');
            },
          },
          onFormatterError: (p: CellFormatterProblem) => problems.push(p),
        },
        () => h(WidgetContent, { data: table('boom') })
      )
    );
    assert.match(markup, /<td>late<\/td>/);
    assert.match(problems[0]?.message ?? '', /which threw: no data/);
  });
});

void describe('WidgetTheme', () => {
  const created = createTheme(themePresets.mono);

  void it('renders the style and a scoped wrapper', async () => {
    assert.ok(created.ok, created.ok ? '' : created.error);
    const markup = await render(
      defineComponent(
        () => () =>
          h(
            WidgetTheme,
            { theme: created.value, className: 'wrap' },
            {
              default: () => h('p', 'inside'),
            }
          )
      )
    );
    assert.match(markup, /<style data-dwt-theme-style="mono">/);
    assert.match(
      markup,
      /<div data-dwt-theme="mono" class="wrap"><p>inside<\/p><\/div>/
    );
  });
});

void describe('useWidgets (server rendering)', () => {
  void it('shows loading cards and starts no provider', async () => {
    let calls = 0;
    const definitions = [
      defineWidget({ key: 'a', title: 'Alpha', kind: 'TEXT' }),
    ];
    const Page = defineComponent(() => {
      const { widgets } = useWidgets(
        definitions,
        {
          a: () => {
            calls++;
            return { kind: 'TEXT', value: '1', label: 'x' };
          },
        },
        {}
      );
      return () =>
        widgets.value.map((widget) =>
          h(ResolvedWidgetCard, { key: widget.definition.key, widget })
        );
    });
    const markup = await render(Page);
    assert.match(markup, /dwt-card--loading/);
    assert.match(markup, />Alpha</);
    assert.equal(calls, 0);
  });
});
