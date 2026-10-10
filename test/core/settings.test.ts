import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_LAYOUT,
  MAX_WIDGET_TITLE_LENGTH,
  applySettings,
  clearWidgetSettings,
  defineWidget,
  effectiveDefinitions,
  isTitleInUse,
  normalizeLayout,
  normalizeSettings,
  optionValuesFromLayout,
  parseLayout,
  serializeLayout,
  setWidgetSettings,
  validateWidgetDefinition,
  widgetOptionValues,
  type DashboardLayout,
  type WidgetDefinition,
} from '../../src/core/index.js';

const revenue: WidgetDefinition = defineWidget({
  key: 'revenue',
  title: 'Revenue',
  kind: 'KPI',
  width: 4,
  minWidth: 3,
  maxWidth: 8,
  options: [
    {
      type: 'choice',
      key: 'period',
      label: 'Period',
      choices: [
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ],
      default: 'month',
    },
    {
      type: 'number',
      key: 'limit',
      label: 'Rows',
      min: 1,
      max: 20,
      default: 5,
    },
  ],
});
const orders: WidgetDefinition = defineWidget({
  key: 'orders',
  title: 'Orders',
  kind: 'TABLE',
  fill: 'both',
});
const policy: WidgetDefinition = defineWidget({
  key: 'policy',
  title: 'Policy',
  kind: 'TEXT',
  locked: { options: true },
});
const definitions: readonly WidgetDefinition[] = [revenue, orders, policy];

function layoutWith(settings: DashboardLayout['settings']): DashboardLayout {
  return { ...EMPTY_LAYOUT, ...(settings === undefined ? {} : { settings }) };
}

void describe('settings in the layout JSON', () => {
  void it('leaves layouts without settings byte-identical', () => {
    const json: string = JSON.stringify({
      order: ['a'],
      hidden: [],
      minimized: [],
    });
    assert.equal(serializeLayout(parseLayout(json)), json);
  });

  void it('round-trips settings, with and without pages', () => {
    const settings = {
      revenue: {
        title: 'Sales',
        width: 6,
        flexible: true,
        options: { period: 'week', limit: 10 },
      },
    };
    const plain = parseLayout(serializeLayout(layoutWith(settings)));
    assert.deepEqual(plain.settings, settings);
    const paged = parseLayout(
      serializeLayout({
        ...EMPTY_LAYOUT,
        pages: [
          {
            key: 'p1',
            title: 'One',
            order: ['revenue'],
            hidden: [],
            minimized: [],
          },
        ],
        settings,
      })
    );
    assert.deepEqual(paged.settings, settings);
  });

  void it('drops malformed settings and cuts long titles', () => {
    const parsed = parseLayout({
      settings: {
        a: {
          title: 'x'.repeat(200),
          width: 99,
          flexible: 'yes',
          options: { n: NaN },
        },
        b: 'nope',
        c: { width: 6 },
        '': { width: 4 },
      },
    });
    assert.equal(
      parsed.settings?.['a']?.title?.length,
      MAX_WIDGET_TITLE_LENGTH
    );
    assert.equal(parsed.settings?.['a']?.width, undefined);
    assert.equal(parsed.settings?.['a']?.flexible, undefined);
    assert.equal(parsed.settings?.['a']?.options, undefined);
    assert.equal(parsed.settings?.['b'], undefined);
    assert.deepEqual(parsed.settings?.['c'], { width: 6 });
    assert.equal(parsed.settings?.[''], undefined);
  });
});

void describe('applySettings', () => {
  void it('returns the same definition when there is nothing to apply', () => {
    assert.equal(applySettings(revenue, undefined), revenue);
    assert.equal(
      applySettings(revenue, { options: { period: 'week' } }),
      revenue
    );
  });

  void it('applies title and width, clamping the width to the limits', () => {
    assert.equal(applySettings(revenue, { title: 'Sales' }).title, 'Sales');
    assert.equal(applySettings(revenue, { width: 6 }).width, 6);
    assert.equal(applySettings(revenue, { width: 12 }).width, 8);
    assert.equal(applySettings(revenue, { width: 2 }).width, 3);
  });

  void it('maps Flexible onto fill without losing height filling', () => {
    assert.equal(applySettings(revenue, { flexible: true }).fill, 'width');
    assert.equal(applySettings(orders, { flexible: false }).fill, 'height');
    assert.equal(applySettings(orders, { flexible: true }), orders);
    const heightOnly = defineWidget({
      key: 'h',
      title: 'H',
      kind: 'TEXT',
      fill: 'height',
    });
    assert.equal(applySettings(heightOnly, { flexible: true }).fill, 'both');
    const widthOnly = defineWidget({
      key: 'w',
      title: 'W',
      kind: 'TEXT',
      fill: 'width',
    });
    assert.equal(applySettings(widthOnly, { flexible: false }).fill, undefined);
  });

  void it('ignores settings for widgets locked against options', () => {
    const layout = layoutWith({ policy: { title: 'Mine' } });
    const effective = effectiveDefinitions(definitions, layout);
    assert.equal(effective[2]?.title, 'Policy');
    assert.equal(
      effectiveDefinitions(definitions, layout, { overrideLocks: true })[2]
        ?.title,
      'Mine'
    );
  });
});

void describe('option values from settings', () => {
  void it('resolves chosen values over defaults and ignores invalid ones', () => {
    assert.deepEqual(widgetOptionValues(revenue, undefined), {
      period: 'month',
      limit: 5,
    });
    assert.deepEqual(
      widgetOptionValues(revenue, {
        options: { period: 'week', limit: 999, extra: 'x' },
      }),
      { period: 'week', limit: 5 }
    );
  });

  void it('lists every widget with options so Reset reaches the provider', () => {
    assert.deepEqual(optionValuesFromLayout(definitions, EMPTY_LAYOUT), {
      revenue: {},
    });
    assert.deepEqual(
      optionValuesFromLayout(
        definitions,
        layoutWith({ revenue: { options: { period: 'week' } } })
      ),
      { revenue: { period: 'week' } }
    );
  });
});

void describe('setWidgetSettings and clearWidgetSettings', () => {
  void it('adds, changes and clears fields, returning the same layout when nothing changes', () => {
    const a = setWidgetSettings(EMPTY_LAYOUT, 'revenue', {
      title: 'Sales',
      width: 6,
    });
    assert.deepEqual(a.settings, { revenue: { title: 'Sales', width: 6 } });
    assert.equal(setWidgetSettings(a, 'revenue', { title: 'Sales' }), a);
    const b = setWidgetSettings(a, 'revenue', { width: undefined });
    assert.deepEqual(b.settings, { revenue: { title: 'Sales' } });
    const c = setWidgetSettings(b, 'revenue', { title: undefined });
    assert.equal(c.settings, undefined);
    assert.equal(
      setWidgetSettings(EMPTY_LAYOUT, 'x', { title: undefined }),
      EMPTY_LAYOUT
    );
  });

  void it('replaces option values as a whole', () => {
    const a = setWidgetSettings(EMPTY_LAYOUT, 'revenue', {
      options: { period: 'week' },
    });
    const b = setWidgetSettings(a, 'revenue', { options: { limit: 3 } });
    assert.deepEqual(b.settings, { revenue: { options: { limit: 3 } } });
  });

  void it('clears one widget and leaves others', () => {
    const a = setWidgetSettings(
      setWidgetSettings(EMPTY_LAYOUT, 'revenue', { title: 'Sales' }),
      'orders',
      { width: 6 }
    );
    const b = clearWidgetSettings(a, 'revenue');
    assert.deepEqual(b.settings, { orders: { width: 6 } });
    assert.equal(clearWidgetSettings(b, 'revenue'), b);
  });
});

void describe('titles', () => {
  void it('detects a title another widget shows, ignoring case and spacing', () => {
    assert.equal(
      isTitleInUse(definitions, EMPTY_LAYOUT, 'revenue', '  orders '),
      true
    );
    assert.equal(
      isTitleInUse(definitions, EMPTY_LAYOUT, 'orders', 'Orders'),
      false
    );
    assert.equal(
      isTitleInUse(definitions, EMPTY_LAYOUT, 'revenue', 'Sales'),
      false
    );
    assert.equal(isTitleInUse(definitions, EMPTY_LAYOUT, 'revenue', ''), false);
  });
});

void describe('normalizeSettings', () => {
  void it('returns the same layout when everything is fine', () => {
    const layout = layoutWith({
      revenue: { title: 'Sales', width: 6, options: { period: 'week' } },
    });
    assert.equal(normalizeSettings(definitions, layout), layout);
    assert.equal(normalizeSettings(definitions, EMPTY_LAYOUT), EMPTY_LAYOUT);
  });

  void it('drops unknown widgets, locked widgets, invalid and undeclared options', () => {
    const layout = layoutWith({
      gone: { title: 'x' },
      policy: { title: 'Mine' },
      revenue: { options: { period: 'year', limit: 7, extra: 'x' }, width: 12 },
    });
    const fixed = normalizeSettings(definitions, layout);
    assert.deepEqual(fixed.settings, {
      revenue: { width: 8, options: { limit: 7 } },
    });
    assert.equal(normalizeSettings(definitions, fixed), fixed);
    assert.equal(
      normalizeSettings(definitions, layoutWith({ policy: { title: 'Mine' } }))
        .settings,
      undefined
    );
  });

  void it('keeps a date range preset instead of the interval it resolves to', () => {
    const defs = [
      defineWidget({
        key: 'views',
        title: 'Views',
        kind: 'GRAPH',
        options: [
          {
            type: 'dateRange',
            key: 'period',
            label: 'Period',
            default: 'last30',
          },
        ],
      }),
    ];
    const layout = layoutWith({ views: { options: { period: 'last7' } } });
    assert.equal(normalizeSettings(defs, layout), layout);
    const values = widgetOptionValues(
      defs[0] as WidgetDefinition,
      layout.settings?.['views']
    );
    assert.match(
      String(values['period']),
      /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/
    );
  });

  void it('makes titles unique with (#n)', () => {
    const layout = layoutWith({
      revenue: { title: 'orders' },
      orders: { title: 'Orders' },
    });
    const fixed = normalizeSettings(definitions, layout);
    assert.equal(fixed.settings?.['revenue']?.title, 'orders');
    assert.equal(fixed.settings?.['orders']?.title, 'Orders (#2)');
  });

  void it('keeps a title within the limit when adding the suffix', () => {
    const long = 'x'.repeat(MAX_WIDGET_TITLE_LENGTH);
    const defs = [
      defineWidget({ key: 'a', title: long, kind: 'TEXT' }),
      defineWidget({ key: 'b', title: 'B', kind: 'TEXT' }),
    ];
    const fixed = normalizeSettings(defs, layoutWith({ b: { title: long } }));
    const title = fixed.settings?.['b']?.title ?? '';
    assert.ok(title.length <= MAX_WIDGET_TITLE_LENGTH);
    assert.ok(title.endsWith('(#2)'));
  });

  void it('is applied by normalizeLayout, and widths count toward page capacity', () => {
    const layout = layoutWith({ revenue: { width: 12 }, gone: { width: 4 } });
    const fixed = normalizeLayout(definitions, layout);
    assert.deepEqual(fixed.settings, { revenue: { width: 8 } });
    assert.equal(normalizeLayout(definitions, fixed), fixed);
  });
});

void describe('definition validation of width limits and options lock', () => {
  const base = { key: 'k', title: 'K', kind: 'TEXT' };

  void it('accepts valid limits and a locked options field', () => {
    const result = validateWidgetDefinition({
      ...base,
      width: 6,
      minWidth: 4,
      maxWidth: 8,
      locked: { options: true },
    });
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  void it('names the problem for bad limits', () => {
    const cases: readonly [Record<string, unknown>, RegExp][] = [
      [{ minWidth: 1 }, /minWidth must be an integer from 2 to 12/],
      [{ maxWidth: 'wide' }, /maxWidth must be an integer from 2 to 12/],
      [
        { minWidth: 8, maxWidth: 4 },
        /minWidth \(8\) must not be more than maxWidth \(4\)/,
      ],
      [
        { width: 3, minWidth: 6 },
        /width \(3\) must not be less than minWidth \(6\)/,
      ],
      [
        { width: 10, maxWidth: 6 },
        /width \(10\) must not be more than maxWidth \(6\)/,
      ],
      [{ locked: { options: 'yes' } }, /locked\.options/],
    ];
    for (const [extra, pattern] of cases) {
      const result = validateWidgetDefinition({ ...base, ...extra });
      assert.ok(!result.ok);
      assert.match(result.error, pattern);
    }
  });
});
