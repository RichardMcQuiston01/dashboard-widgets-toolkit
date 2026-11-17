import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  toAlertList,
  toBarList,
  toGauge,
  toGraph,
  toKpi,
  toTable,
  toText,
} from '../../src/core/builders.js';
import { DEFAULT_EMPTY_TEXT } from '../../src/core/payload.js';
import { validateWidgetData } from '../../src/core/validate.js';

/** Every builder's output is a payload the validator accepts. */
function assertValid(payload: unknown): void {
  const checked = validateWidgetData(payload);
  assert.ok(checked.ok, checked.ok ? '' : checked.error);
}

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly cents: number;
  readonly profileUrl?: string;
}

const orders: readonly Order[] = [
  { id: '1001', customer: 'Ana', cents: 12_500 },
  { id: '1002', customer: 'Ben', cents: 4_000, profileUrl: '/c/ben' },
];

void describe('toText, toKpi and toGauge', () => {
  it('toText names its fields', () => {
    const payload = toText({ label: 'Status', value: 'Open' });
    assert.deepEqual(payload, { kind: 'TEXT', value: 'Open', label: 'Status' });
    assertValid(payload);
  });

  it('toKpi keeps only the fields it was given', () => {
    const minimal = toKpi({ label: 'Revenue', value: 12, format: 'number' });
    assert.deepEqual(minimal, {
      kind: 'KPI',
      value: 12,
      format: 'number',
      label: 'Revenue',
    });
    const full = toKpi({
      label: 'Revenue',
      value: 12.5,
      previous: null,
      format: 'currency',
      currency: 'EUR',
      hint: 'Incl. tax',
      higherIsBetter: false,
    });
    assert.equal(full.previous, null);
    assert.equal(full.currency, 'EUR');
    assert.equal(full.higherIsBetter, false);
    assertValid(minimal);
    assertValid(full);
  });

  it('toGauge builds a meter', () => {
    const payload = toGauge({ label: 'Disk', value: 40, max: 100 });
    assert.equal(payload.kind, 'GAUGE');
    assertValid(payload);
  });
});

void describe('toTable', () => {
  it('builds columns and one row of cells per item', () => {
    const payload = toTable(
      orders,
      [
        { label: 'Order', cell: (order) => ({ text: `#${order.id}` }) },
        {
          label: 'Customer',
          type: 'custom',
          formatter: 'customer',
          cell: (order) => ({
            text: order.customer,
            ...(order.profileUrl === undefined
              ? {}
              : { href: order.profileUrl }),
          }),
        },
        {
          label: 'Total',
          numeric: true,
          cell: (order) => ({
            text: `$${order.cents / 100}`,
            value: order.cents,
          }),
        },
      ],
      { footer: 'and 3 more' }
    );
    assert.ok('kind' in payload && payload.kind === 'TABLE');
    assert.deepEqual(
      payload.columns.map((column) => column.label),
      ['Order', 'Customer', 'Total']
    );
    assert.equal(payload.columns[1]?.type, 'custom');
    assert.equal(payload.columns[1]?.formatter, 'customer');
    assert.equal(payload.columns[2]?.numeric, true);
    assert.equal('cell' in (payload.columns[0] ?? {}), false);
    assert.equal(payload.rows.length, 2);
    assert.equal(payload.rows[1]?.[1]?.href, '/c/ben');
    assert.equal(payload.rows[0]?.[2]?.value, 12_500);
    assert.equal(payload.footer, 'and 3 more');
    assertValid(payload);
  });

  it('gives an empty state for no rows, with its own text if asked', () => {
    const columns = [{ label: 'A', cell: () => ({ text: 'x' }) }];
    assert.deepEqual(toTable([], columns), {
      empty: true,
      text: DEFAULT_EMPTY_TEXT,
    });
    assert.deepEqual(toTable([], columns, { emptyText: 'No orders yet.' }), {
      empty: true,
      text: 'No orders yet.',
    });
  });
});

void describe('toBarList', () => {
  it('reads label, value and an optional display', () => {
    const payload = toBarList(
      orders,
      {
        label: (order) => order.customer,
        value: (order) => order.cents,
        display: (order) => `$${order.cents / 100}`,
      },
      { total: 20_000 }
    );
    assert.ok('kind' in payload && payload.kind === 'BAR_LIST');
    assert.equal(payload.items[0]?.display, '$125');
    assert.equal(payload.total, 20_000);
    assertValid(payload);
  });

  it('omits display and total when not given, and is empty for no items', () => {
    const payload = toBarList(orders, {
      label: (order) => order.customer,
      value: (order) => order.cents,
    });
    assert.ok('kind' in payload);
    assert.equal('total' in payload, false);
    if ('items' in payload) {
      assert.equal('display' in (payload.items[0] ?? {}), false);
    }
    assert.deepEqual(toBarList([], { label: () => '', value: () => 0 }), {
      empty: true,
      text: DEFAULT_EMPTY_TEXT,
    });
  });
});

void describe('toAlertList', () => {
  const pick = {
    title: (order: Order) => `Order ${order.id}`,
    valueLabel: (order: Order) => `${order.cents} left`,
    href: (order: Order) => order.profileUrl,
    detail: (order: Order) => order.customer,
  };

  it('builds items, dropping the optional fields that are undefined', () => {
    const payload = toAlertList(orders, pick, { emptyText: 'All good.' });
    assert.equal(payload.items.length, 2);
    assert.equal('href' in (payload.items[0] ?? {}), false);
    assert.equal(payload.items[1]?.href, '/c/ben');
    assert.equal(payload.total, 2);
    assert.equal(payload.emptyText, 'All good.');
    assertValid(payload);
  });

  it('keeps an empty list as a payload with its own emptyText, not an empty state', () => {
    const payload = toAlertList([], pick, {
      emptyText: 'Nothing low on stock.',
    });
    assert.equal(payload.kind, 'ALERT_LIST');
    assert.equal(payload.items.length, 0);
    assert.equal(payload.emptyText, 'Nothing low on stock.');
    assertValid(payload);
  });

  it('takes a total larger than the items shown', () => {
    assert.equal(toAlertList(orders, pick, { total: 12 }).total, 12);
  });
});

void describe('toGraph', () => {
  it('builds a chart from series', () => {
    const payload = toGraph({
      chartType: 'bar',
      valueFormat: 'currency',
      currency: 'GBP',
      xLabel: 'Month',
      series: [
        {
          name: 'Sales',
          points: [
            { label: 'Oct', value: 1 },
            { label: 'Nov', value: 2 },
          ],
        },
      ],
    });
    assert.ok('kind' in payload && payload.kind === 'GRAPH');
    assert.equal(payload.currency, 'GBP');
    assert.equal(payload.xLabel, 'Month');
    assertValid(payload);
  });

  it('is an empty state when no series has a point', () => {
    assert.deepEqual(
      toGraph({
        chartType: 'line',
        valueFormat: 'number',
        series: [{ name: 'Sales', points: [] }],
      }),
      { empty: true, text: DEFAULT_EMPTY_TEXT }
    );
    assert.deepEqual(
      toGraph({ chartType: 'line', valueFormat: 'number', series: [] }),
      { empty: true, text: DEFAULT_EMPTY_TEXT }
    );
  });
});
