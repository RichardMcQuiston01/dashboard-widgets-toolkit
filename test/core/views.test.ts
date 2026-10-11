import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineWidget } from '../../src/core/definition.js';
import { EMPTY_LAYOUT } from '../../src/core/layout.js';
import type {
  BarListWidgetData,
  GraphWidgetData,
  TableWidgetData,
} from '../../src/core/payload.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  normalizeSettings,
  parseSettings,
  serializeSettings,
  setWidgetSettings,
} from '../../src/core/settings.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';
import {
  BASE_VIEW_KEY,
  applyView,
  convertView,
  effectiveViewKey,
  viewChoices,
  viewNote,
  type WidgetView,
} from '../../src/core/views.js';

const table: TableWidgetData = {
  kind: 'TABLE',
  columns: [
    { label: 'Product' },
    { label: 'Sold', numeric: true },
    { label: 'Revenue', numeric: true },
  ],
  rows: [
    [
      { text: 'Mug' },
      { text: '1,200', value: 1200 },
      { text: '$30.00', value: 30 },
    ],
    [
      { text: 'Tote' },
      { text: '800', value: 800 },
      { text: '$20.00', value: 20 },
    ],
  ],
};

const barsView: WidgetView = {
  key: 'bars',
  label: 'Bars',
  kind: 'BAR_LIST',
  convert: { type: 'tableToBarList', label: 0, value: 1 },
};
const chartView: WidgetView = {
  key: 'chart',
  label: 'Chart',
  kind: 'GRAPH',
  convert: {
    type: 'tableToGraph',
    label: 0,
    values: [1, 2],
    chartType: 'bar',
  },
};

const products = defineWidget({
  key: 'products',
  title: 'Products',
  kind: 'TABLE',
  views: [barsView, chartView],
});

function okWidget(): DashboardWidget {
  return { definition: products, status: 'ok', data: table };
}

void describe('convertView', () => {
  void it('turns a table into a bar list using numeric values and cell text', () => {
    const result = convertView('products', barsView, table);
    assert.ok(result.ok);
    assert.deepEqual(result.value, {
      kind: 'BAR_LIST',
      items: [
        { label: 'Mug', value: 1200, display: '1,200' },
        { label: 'Tote', value: 800, display: '800' },
      ],
    });
  });

  void it('turns a table into a chart with one series per column', () => {
    const result = convertView('products', chartView, table);
    assert.ok(result.ok);
    const graph = result.value as GraphWidgetData;
    assert.equal(graph.series.length, 2);
    assert.equal(graph.series[1]?.name, 'Revenue');
    assert.equal(graph.xLabel, 'Product');
    assert.deepEqual(graph.series[0]?.points[1], { label: 'Tote', value: 800 });
  });

  void it('names the widget, view, row and column when a cell has no number', () => {
    const noValue: TableWidgetData = {
      ...table,
      rows: [[{ text: 'Mug' }, { text: '1,200' }, { text: '$30.00' }]],
    };
    const result = convertView('products', barsView, noValue);
    assert.ok(!result.ok);
    assert.equal(
      result.error,
      'Widget "products" view "bars": row 1, column 2 ("Sold") has no numeric value. Add value to the cells.'
    );
  });

  void it('rejects a column that does not exist and the wrong source kind', () => {
    const wrongColumn = convertView(
      'products',
      { key: 'bars', convert: { type: 'tableToBarList', label: 0, value: 9 } },
      table
    );
    assert.ok(!wrongColumn.ok);
    assert.match(wrongColumn.error, /value column 9 does not exist/);
    const wrongKind = convertView('products', barsView, {
      kind: 'BAR_LIST',
      items: [],
    });
    assert.ok(!wrongKind.ok);
    assert.match(wrongKind.error, /reads a TABLE payload.*returned BAR_LIST/);
  });

  void it('converts a bar list to a table and a chart, and a chart back to a table', () => {
    const list: BarListWidgetData = {
      kind: 'BAR_LIST',
      items: [
        { label: 'US', value: 5, display: '5 orders' },
        { label: 'CA', value: 2 },
      ],
    };
    const asTable = convertView(
      'w',
      { key: 't', convert: { type: 'barListToTable', valueHeading: 'Orders' } },
      list
    );
    assert.ok(asTable.ok);
    const rows = asTable.value as TableWidgetData;
    assert.equal(rows.columns[1]?.label, 'Orders');
    assert.deepEqual(rows.rows[0]?.[1], { text: '5 orders', value: 5 });
    assert.deepEqual(rows.rows[1]?.[1], { text: '2', value: 2 });

    const asGraph = convertView(
      'w',
      {
        key: 'g',
        convert: { type: 'barListToGraph', chartType: 'line', seriesName: 'N' },
      },
      list
    );
    assert.ok(asGraph.ok);
    assert.equal((asGraph.value as GraphWidgetData).series[0]?.name, 'N');

    const back = convertView(
      'w',
      { key: 'b', convert: { type: 'graphToTable' } },
      asGraph.value
    );
    assert.ok(back.ok);
    const backTable = back.value as TableWidgetData;
    assert.equal(backTable.rows.length, 2);
    assert.equal(backTable.columns[1]?.label, 'N');
  });
});

void describe('view choice', () => {
  void it('lists the base first and falls back to defaultView, then base', () => {
    assert.deepEqual(
      viewChoices(products).map((choice) => [choice.key, choice.label]),
      [
        [BASE_VIEW_KEY, 'Table'],
        ['bars', 'Bars'],
        ['chart', 'Chart'],
      ]
    );
    assert.equal(effectiveViewKey(products, undefined), BASE_VIEW_KEY);
    assert.equal(effectiveViewKey(products, 'chart'), 'chart');
    assert.equal(effectiveViewKey(products, 'nope'), BASE_VIEW_KEY);
    const bars = { ...products, defaultView: 'bars' };
    assert.equal(effectiveViewKey(bars, undefined), 'bars');
    assert.equal(effectiveViewKey(bars, BASE_VIEW_KEY), BASE_VIEW_KEY);
    assert.deepEqual(viewChoices({ key: 'k', kind: 'TEXT' }), []);
  });

  void it('says which columns a view keeps', () => {
    assert.equal(viewNote(barsView, table), 'Shows Product, Sold only.');
    assert.equal(
      viewNote(chartView, table),
      'Shows Product, Sold, Revenue only.'
    );
  });
});

void describe('applyView', () => {
  void it('converts the payload and switches the definition kind', () => {
    const widget = applyView(okWidget(), 'bars');
    assert.equal(widget.definition.kind, 'BAR_LIST');
    assert.equal(widget.status, 'ok');
    assert.equal(widget.status === 'ok' && widget.data.kind, 'BAR_LIST');
  });

  void it('returns the same widget for the base view', () => {
    const widget = okWidget();
    assert.equal(applyView(widget, undefined), widget);
    assert.equal(applyView(widget, BASE_VIEW_KEY), widget);
  });

  void it('uses defaultView when nothing is chosen', () => {
    const widget = applyView(
      { ...okWidget(), definition: { ...products, defaultView: 'chart' } },
      undefined
    );
    assert.equal(widget.definition.kind, 'GRAPH');
  });

  void it('keeps loading, empty and error widgets, with the view’s kind', () => {
    const loading = applyView(
      { definition: products, status: 'loading' },
      'bars'
    );
    assert.equal(loading.status, 'loading');
    assert.equal(loading.definition.kind, 'BAR_LIST');
  });

  void it('turns a failed conversion into an error widget', () => {
    const widget = applyView(
      {
        definition: products,
        status: 'ok',
        data: {
          ...table,
          rows: [[{ text: 'Mug' }, { text: '1' }, { text: '2' }]],
        },
      },
      'bars'
    );
    assert.equal(widget.status, 'error');
    assert.match(
      widget.status === 'error' ? widget.error : '',
      /row 1, column 2 \("Sold"\)/
    );
  });
});

void describe('view in viewer settings', () => {
  void it('round-trips through parse and serialize', () => {
    const settings = parseSettings({ products: { view: 'bars' } });
    assert.deepEqual(settings, { products: { view: 'bars' } });
    assert.deepEqual(serializeSettings(settings), {
      products: { view: 'bars' },
    });
    assert.equal(parseSettings({ products: { view: 7 } }), undefined);
  });

  void it('sets and clears the view', () => {
    const set = setWidgetSettings(EMPTY_LAYOUT, 'products', { view: 'chart' });
    assert.equal(set.settings?.['products']?.view, 'chart');
    const cleared = setWidgetSettings(set, 'products', { view: undefined });
    assert.equal(cleared.settings, undefined);
  });

  void it('normalize keeps declared views and drops unknown ones', () => {
    const layout = {
      ...EMPTY_LAYOUT,
      settings: {
        products: { view: 'bars' },
      },
    };
    assert.equal(normalizeSettings([products], layout), layout);
    const bad = { ...EMPTY_LAYOUT, settings: { products: { view: 'nope' } } };
    assert.equal(normalizeSettings([products], bad).settings, undefined);
    const base = { ...EMPTY_LAYOUT, settings: { products: { view: 'base' } } };
    assert.equal(normalizeSettings([products], base), base);
  });
});

void describe('validateWidgetDefinition views', () => {
  const base = { key: 'p', title: 'P', kind: 'TABLE' };

  void it('accepts a valid declaration', () => {
    assert.ok(
      validateWidgetDefinition({
        ...base,
        views: [barsView, chartView],
        defaultView: 'bars',
      }).ok
    );
  });

  void it('names the field for each problem', () => {
    const cases: [object, RegExp][] = [
      [
        { views: [{ ...barsView, key: 'base' }] },
        /views\[0\]\.key "base" is reserved/,
      ],
      [{ views: [barsView, barsView] }, /views\[1\]\.key "bars" is used twice/],
      [
        { views: [{ ...barsView, kind: 'GRAPH' }] },
        /produces BAR_LIST, but the view's kind is GRAPH/,
      ],
      [
        { views: [{ key: 'x', label: 'X', kind: 'TABLE' }] },
        /views\[0\]\.convert is required/,
      ],
      [
        {
          views: [
            {
              ...barsView,
              convert: { type: 'barListToTable' },
              kind: 'TABLE',
            },
          ],
        },
        /reads a BAR_LIST widget, but this one is TABLE/,
      ],
      [
        {
          views: [
            { ...chartView, convert: { ...chartView.convert, values: [] } },
          ],
        },
        /values must list 1 or more column indexes/,
      ],
      [
        { views: [barsView], defaultView: 'zzz' },
        /defaultView must be "base" or the key of a declared view/,
      ],
      [{ baseViewLabel: '' }, /baseViewLabel must not be empty/],
    ];
    for (const [extra, pattern] of cases) {
      const result = validateWidgetDefinition({ ...base, ...extra });
      assert.ok(!result.ok, JSON.stringify(extra));
      assert.match(result.error, pattern);
    }
  });
});
