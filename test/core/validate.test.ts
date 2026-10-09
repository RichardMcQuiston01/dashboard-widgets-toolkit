import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_REPORTED_PROBLEMS,
  validateWidgetData,
  validateWidgetDefinition,
} from '../../src/core/validate.js';
import type { WidgetData } from '../../src/core/payload.js';

const valid: Record<WidgetData['kind'], WidgetData> = {
  TEXT: { kind: 'TEXT', value: '12', label: 'machines in your shop' },
  KPI: {
    kind: 'KPI',
    value: 1234.5,
    previous: 1000,
    format: 'currency',
    currency: 'USD',
    label: 'Revenue',
    higherIsBetter: true,
  },
  GAUGE: { kind: 'GAUGE', value: 3, max: 10, label: '3 unread of 10' },
  TABLE: {
    kind: 'TABLE',
    columns: [{ label: 'Item' }, { label: 'Sold', numeric: true }],
    rows: [[{ text: 'Jig', href: 'https://example.com/jig' }, { text: '4' }]],
    footer: 'and 3 more',
  },
  BAR_LIST: {
    kind: 'BAR_LIST',
    items: [{ label: '5 stars', value: 40, display: '40 (80%)' }],
    total: 50,
  },
  ALERT_LIST: {
    kind: 'ALERT_LIST',
    items: [
      {
        title: 'Pencil jig',
        href: '/items/1',
        thumbnailUrl: 'https://i.example.com/1.jpg',
        valueLabel: '2 left',
        detail: 'Physical',
      },
    ],
    total: 3,
    emptyText: 'Nothing low on stock.',
  },
  GRAPH: {
    kind: 'GRAPH',
    series: [{ name: 'Revenue', points: [{ label: 'Oct', value: 12 }] }],
    chartType: 'bar',
    valueFormat: 'currency',
    xLabel: 'Month',
  },
};

function errorOf(value: unknown, options = {}): string {
  const result = validateWidgetData(value, options);
  assert.equal(result.ok, false, 'expected a validation failure');
  return result.ok ? '' : result.error;
}

void describe('validateWidgetData', () => {
  for (const [kind, payload] of Object.entries(valid)) {
    void it(`accepts a valid ${kind} payload and survives a JSON round trip`, () => {
      const result = validateWidgetData(JSON.parse(JSON.stringify(payload)));
      assert.ok(result.ok, result.ok ? '' : result.error);
      assert.deepEqual(result.value, payload);
    });
  }

  void it('accepts an empty state', () => {
    const result = validateWidgetData({ empty: true, text: 'No orders yet.' });
    assert.ok(result.ok);
    assert.match(
      errorOf({ empty: true }),
      /\(empty\): text must be a string, got undefined/
    );
  });

  void it('accepts a null previous on a KPI', () => {
    assert.ok(validateWidgetData({ ...valid.KPI, previous: null }).ok);
  });

  void it('rejects non-objects and unknown kinds, naming the widget', () => {
    assert.match(errorOf([]), /^Widget data: must be an object, got array\./);
    assert.match(
      errorOf({ kind: 'PIE' }, { widgetKey: 'sales' }),
      /^Widget "sales": kind must be one of TEXT, KPI, .* got "PIE"\./
    );
  });

  void it('rejects a kind that does not match the definition', () => {
    assert.match(
      errorOf(valid.TEXT, { widgetKey: 'k', expectedKind: 'GAUGE' }),
      /expected kind GAUGE from its definition, got TEXT/
    );
    assert.ok(
      validateWidgetData({ empty: true, text: '' }, { expectedKind: 'GAUGE' })
        .ok
    );
  });

  void it('names the exact field path and type for nested problems', () => {
    const message = errorOf(
      {
        ...valid.TABLE,
        rows: [[{ text: 'ok' }, { text: 4 }], 'nope'],
      },
      { widgetKey: 'top' }
    );
    assert.match(message, /^Widget "top" \(TABLE\): /);
    assert.match(
      message,
      /rows\[0\]\[1\]\.text must be a string, got number\./
    );
    assert.match(message, /rows\[1\] must be an array of cells, got string\./);
  });

  void it('accepts a sort value on a table cell and rejects a bad one', () => {
    const withValues = {
      ...valid.TABLE,
      rows: [
        [
          { text: '3 days ago', value: 1760000000000 },
          { text: 'b', value: 'b' },
        ],
      ],
    };
    assert.equal(validateWidgetData(withValues).ok, true);
    assert.match(
      errorOf({
        ...valid.TABLE,
        rows: [[{ text: 'a', value: true }, { text: 'b' }]],
      }),
      /rows\[0\]\[0\]\.value must be a string or a finite number, got boolean\./
    );
    assert.match(
      errorOf({
        ...valid.TABLE,
        rows: [[{ text: 'a', value: Number.NaN }, { text: 'b' }]],
      }),
      /rows\[0\]\[0\]\.value must be a string or a finite number, got NaN\./
    );
  });

  void it('checks row length against the columns', () => {
    assert.match(
      errorOf({ ...valid.TABLE, rows: [[{ text: 'only one' }]] }),
      /rows\[0\] has 1 cell\(s\) but there are 2 column\(s\)\./
    );
  });

  void it('rejects non-finite numbers', () => {
    assert.match(
      errorOf({ ...valid.KPI, value: Number.NaN }),
      /value must be a finite number, got NaN/
    );
    assert.match(
      errorOf({ ...valid.GAUGE, max: Infinity }),
      /max must be a finite number, got Infinity/
    );
    assert.match(
      errorOf({ ...valid.GAUGE, max: 0 }),
      /max must be greater than 0/
    );
  });

  void it('rejects enum values outside the allowed set', () => {
    assert.match(
      errorOf({ ...valid.KPI, format: 'money' }),
      /format must be one of "number", "currency", "percent", got "money"/
    );
    assert.match(
      errorOf({ ...valid.GRAPH, chartType: 'pie' }),
      /chartType must be one of "bar", "line"/
    );
  });

  void it('refuses links and images that could run script', () => {
    const message = errorOf({
      ...valid.ALERT_LIST,
      items: [
        {
          title: 'x',
          href: 'javascript:alert(1)',
          thumbnailUrl: 'data:image/svg+xml,<svg/>',
          valueLabel: '1',
        },
      ],
    });
    assert.match(
      message,
      /items\[0\]\.href must be an http\(s\), mailto or relative URL, got "javascript:alert\(1\)"/
    );
    assert.match(
      message,
      /items\[0\]\.thumbnailUrl must be an http\(s\) or relative URL/
    );
  });

  void it('requires an alert total of at least the items shown', () => {
    assert.match(
      errorOf({ ...valid.ALERT_LIST, total: 0 }),
      /total \(0\) must be at least the number of items \(1\)/
    );
  });

  void it('caps graphs at eight series', () => {
    const series = Array.from({ length: 9 }, (_, i) => ({
      name: `S${i}`,
      points: [],
    }));
    assert.match(
      errorOf({ ...valid.GRAPH, series }),
      /series has 9 entries; at most 8/
    );
  });

  void it(`lists at most ${MAX_REPORTED_PROBLEMS} problems`, () => {
    const items = Array.from({ length: 15 }, () => ({ label: 1, value: 'x' }));
    const message = errorOf({ kind: 'BAR_LIST', items });
    assert.match(message, /\(and 20 more problem\(s\)\)$/);
  });
});

void describe('validateWidgetDefinition locked', () => {
  const base = { key: 'x', title: 'X', kind: 'TEXT' } as const;

  void it('accepts a boolean or an object of booleans', () => {
    assert.ok(validateWidgetDefinition({ ...base, locked: true }).ok);
    assert.ok(validateWidgetDefinition({ ...base, locked: false }).ok);
    assert.ok(
      validateWidgetDefinition({
        ...base,
        locked: { move: true, hide: false, minimize: true },
      }).ok
    );
  });

  void it('names the bad field', () => {
    const field = validateWidgetDefinition({
      ...base,
      locked: { move: 'yes' },
    });
    assert.equal(field.ok, false);
    if (!field.ok) {
      assert.match(field.error, /locked\.move must be a boolean, got string\./);
    }
    const whole = validateWidgetDefinition({ ...base, locked: 'all' });
    assert.equal(whole.ok, false);
    if (!whole.ok) {
      assert.match(
        whole.error,
        /locked must be true, false or an object, got string\./
      );
    }
  });
});

void describe('validateWidgetDefinition', () => {
  void it('accepts a full definition', () => {
    const result = validateWidgetDefinition({
      key: 'revenue',
      title: 'Revenue',
      description: 'Order totals',
      kind: 'KPI',
      sortOrder: 1,
      roles: ['owner'],
      active: true,
      defaultSize: 'small',
      fill: 'both',
    });
    assert.ok(result.ok);
  });

  void it('accepts a width of 2 to 12 and names a bad one', () => {
    const base = { key: 'x', title: 'X', kind: 'TEXT' } as const;
    assert.ok(validateWidgetDefinition({ ...base, width: 6 }).ok);
    assert.ok(validateWidgetDefinition({ ...base, width: 12 }).ok);
    for (const width of [1, 13, 4.5, '6']) {
      const result = validateWidgetDefinition({ ...base, width });
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.match(result.error, /width must be an integer from 2 to 12/);
    }
  });

  void it('names the definition and each problem', () => {
    const result = validateWidgetDefinition({
      key: 'x',
      kind: 'CHART',
      roles: ['ok', 2],
      defaultSize: 'huge',
      fill: 'sideways',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /^Widget definition "x": /);
    assert.match(result.error, /title must be a string, got undefined\./);
    assert.match(result.error, /kind must be one of/);
    assert.match(result.error, /roles\[1\] must be a string, got number\./);
    assert.match(
      result.error,
      /defaultSize must be one of "small", "medium", "large", "full"/
    );
    assert.match(result.error, /fill must be one of "height", "width", "both"/);
  });
});
