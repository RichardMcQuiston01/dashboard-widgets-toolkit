import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bindProviders,
  defineAdapter,
  isAdapter,
  type DataSource,
  type Mapper,
} from '../../src/core/adapter.js';
import { toKpi, toTable } from '../../src/core/builders.js';
import { defineWidget } from '../../src/core/definition.js';
import {
  resolveWidgets,
  type ProviderOptions,
  type WidgetContext,
  type WidgetProviders,
} from '../../src/core/resolve.js';

interface ShopContext extends WidgetContext {
  readonly shopId: string;
}

interface OrdersResponse {
  readonly orders: readonly { readonly id: string; readonly cents: number }[];
}

const context: ShopContext = { shopId: 'demo' };

function options(overrides: Partial<ProviderOptions> = {}): ProviderOptions {
  return {
    signal: new AbortController().signal,
    options: {},
    view: 'base',
    filters: {},
    ...overrides,
  };
}

const ordersTable: Mapper<OrdersResponse, 'TABLE', ShopContext> = (raw) =>
  toTable(raw.orders, [
    { label: 'Order', cell: (order) => ({ text: `#${order.id}` }) },
    {
      label: 'Total',
      numeric: true,
      cell: (order) => ({ text: `$${order.cents / 100}`, value: order.cents }),
    },
  ]);

function ordersSource(
  loads: { count: number },
  response: OrdersResponse = { orders: [{ id: '1', cents: 500 }] }
): DataSource<ShopContext, OrdersResponse> {
  return {
    id: 'orders',
    async load(): Promise<OrdersResponse> {
      loads.count += 1;
      return response;
    },
  };
}

const ordersWidget = defineWidget({
  key: 'recent-orders',
  title: 'Recent orders',
  kind: 'TABLE',
});

void describe('defineAdapter', () => {
  it('makes a provider that loads, maps and resolves like any other', async () => {
    const loads = { count: 0 };
    const providers: WidgetProviders<ShopContext> = {
      'recent-orders': defineAdapter('TABLE', ordersSource(loads), ordersTable),
    };
    const [resolved] = await resolveWidgets([ordersWidget], providers, context);
    assert.equal(resolved?.status, 'ok');
    assert.equal(
      resolved?.status === 'ok' && resolved.data.kind === 'TABLE'
        ? resolved.data.rows[0]?.[0]?.text
        : undefined,
      '#1'
    );
    assert.equal(loads.count, 1);
  });

  it('passes the context and the provider options to load and the mapper', async () => {
    let seen: { context?: ShopContext; limit?: unknown } = {};
    const adapter = defineAdapter(
      'KPI',
      {
        id: 'k',
        load: (loadContext: ShopContext, loadOptions: ProviderOptions) => {
          seen = { context: loadContext, limit: loadOptions.options['limit'] };
          return 3;
        },
      },
      (raw: number, mapContext: ShopContext) =>
        toKpi({
          label: mapContext.shopId,
          value: raw,
          format: 'number',
        })
    );
    const payload = await adapter(
      context,
      defineWidget({ key: 'k', title: 'K', kind: 'KPI' }),
      options({ options: { limit: 7 } })
    );
    assert.equal(seen.context?.shopId, 'demo');
    assert.equal(seen.limit, 7);
    assert.ok(
      'kind' in payload && payload.kind === 'KPI' && payload.label === 'demo'
    );
  });

  it('an error from load or the mapper reaches the widget by its key', async () => {
    const failing = defineAdapter(
      'TABLE',
      {
        id: 'x',
        load: async (): Promise<OrdersResponse> => {
          throw new Error('Orders API returned 503 Service Unavailable.');
        },
      },
      ordersTable
    );
    const [resolved] = await resolveWidgets(
      [ordersWidget],
      { 'recent-orders': failing },
      context
    );
    assert.equal(resolved?.status, 'error');
    assert.match(
      resolved?.status === 'error' ? resolved.error : '',
      /recent-orders.*503 Service Unavailable/s
    );
  });

  it('a mapper that returns a bad payload is caught by validation with its path', async () => {
    const sloppy = defineAdapter(
      'KPI',
      { id: 's', load: () => 'not a number' },
      (raw: string) =>
        ({ kind: 'KPI', label: 'K', format: 'number', value: raw }) as never
    );
    const [resolved] = await resolveWidgets(
      [defineWidget({ key: 'k', title: 'K', kind: 'KPI' })],
      { k: sloppy },
      context
    );
    assert.equal(resolved?.status, 'error');
    assert.match(resolved?.status === 'error' ? resolved.error : '', /value/);
  });

  it('refuses a widget of another kind, naming both', async () => {
    const adapter = defineAdapter(
      'KPI',
      { id: 'k', load: () => 1 },
      (raw: number) => toKpi({ label: 'K', value: raw, format: 'number' })
    );
    await assert.rejects(
      async () => adapter(context, ordersWidget, options()),
      /"recent-orders" is a TABLE, but the adapter for source "k" builds KPI/
    );
  });

  it('refuses a mapper that returns another kind', async () => {
    const adapter = defineAdapter(
      'TABLE',
      { id: 'o', load: () => ({ orders: [] }) },
      ((): never =>
        toKpi({ label: 'K', value: 1, format: 'number' }) as never) as Mapper<
        { orders: never[] },
        'TABLE',
        ShopContext
      >
    );
    await assert.rejects(
      async () => adapter(context, ordersWidget, options()),
      /mapper for source "o" returned KPI, but the adapter was defined for TABLE/
    );
  });

  it('skips the kind checks for a view the provider supplies', async () => {
    const adapter = defineAdapter(
      'TABLE',
      { id: 'o', load: () => ({ orders: [] }) },
      ((): never =>
        toKpi({ label: 'K', value: 1, format: 'number' }) as never) as Mapper<
        { orders: never[] },
        'TABLE',
        ShopContext
      >
    );
    const payload = await adapter(
      context,
      ordersWidget,
      options({ view: 'trend' })
    );
    assert.ok('kind' in payload && payload.kind === 'KPI');
  });

  it('tags the provider with its kind and source', () => {
    const adapter = defineAdapter(
      'TABLE',
      ordersSource({ count: 0 }),
      ordersTable
    );
    assert.equal(adapter.kind, 'TABLE');
    assert.equal(adapter.sourceId, 'orders');
    assert.equal(isAdapter(adapter), true);
    assert.equal(
      isAdapter(() => undefined),
      false
    );
    assert.equal(isAdapter(undefined), false);
  });
});

void describe('sharing one load between widgets', () => {
  function sharedSource(
    loads: { count: number },
    gate: Promise<void>
  ): DataSource<ShopContext, OrdersResponse> {
    return {
      id: 'orders-shared',
      scope: (shared: ShopContext) => shared.shopId,
      async load(_context, loadOptions): Promise<OrdersResponse> {
        loads.count += 1;
        await gate;
        loadOptions.signal.throwIfAborted();
        return { orders: [{ id: '1', cents: 100 }] };
      },
    };
  }

  const widgetA = defineWidget({ key: 'a', title: 'A', kind: 'TABLE' });
  const widgetB = defineWidget({ key: 'b', title: 'B', kind: 'TABLE' });

  it('loads once for two widgets that share an id and scope', async () => {
    const loads = { count: 0 };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source = sharedSource(loads, gate);
    const providers: WidgetProviders<ShopContext> = {
      a: defineAdapter('TABLE', source, ordersTable),
      b: defineAdapter('TABLE', source, ordersTable),
    };
    const running = resolveWidgets([widgetA, widgetB], providers, context);
    release();
    const resolved = await running;
    assert.deepEqual(
      resolved.map((widget) => widget.status),
      ['ok', 'ok']
    );
    assert.equal(loads.count, 1);
  });

  it('loads again for a different scope, and again after the first load is done', async () => {
    const loads = { count: 0 };
    const source = sharedSource(loads, Promise.resolve());
    const adapter = defineAdapter('TABLE', source, ordersTable);
    await adapter({ shopId: 'one' }, widgetA, options());
    await adapter({ shopId: 'one' }, widgetA, options());
    assert.equal(loads.count, 2);
    await Promise.all([
      adapter({ shopId: 'one' }, widgetA, options()),
      adapter({ shopId: 'two' }, widgetA, options()),
    ]);
    assert.equal(loads.count, 4);
  });

  it('never shares when the source has no scope', async () => {
    const loads = { count: 0 };
    const adapter = defineAdapter('TABLE', ordersSource(loads), ordersTable);
    await Promise.all([
      adapter(context, widgetA, options()),
      adapter(context, widgetB, options()),
    ]);
    assert.equal(loads.count, 2);
  });

  it('aborts the shared load only when every waiting caller has aborted', async () => {
    const loads = { count: 0 };
    let sharedSignal: AbortSignal | undefined;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source: DataSource<ShopContext, OrdersResponse> = {
      id: 'abortable',
      scope: () => 'one',
      async load(_context, loadOptions): Promise<OrdersResponse> {
        loads.count += 1;
        sharedSignal = loadOptions.signal;
        await gate;
        return { orders: [] };
      },
    };
    const adapter = defineAdapter('TABLE', source, ordersTable);
    const first = new AbortController();
    const second = new AbortController();
    const one = adapter(context, widgetA, options({ signal: first.signal }));
    const two = adapter(context, widgetB, options({ signal: second.signal }));
    first.abort();
    await Promise.resolve();
    assert.equal(sharedSignal?.aborted, false, 'one caller is still waiting');
    second.abort();
    await Promise.resolve();
    assert.equal(sharedSignal?.aborted, true, 'nobody is waiting any more');
    release();
    await Promise.allSettled([one, two]);
    // A caller after the abort starts a fresh load.
    await adapter(context, widgetA, options());
    assert.equal(loads.count, 2);
  });
});

void describe('bindProviders', () => {
  const kpiWidget = defineWidget({
    key: 'revenue',
    title: 'Revenue',
    kind: 'KPI',
  });
  const kpiAdapter = defineAdapter(
    'KPI',
    { id: 'r', load: () => 1 },
    (raw: number) => toKpi({ label: 'Revenue', value: raw, format: 'number' })
  );
  const tableAdapter = defineAdapter(
    'TABLE',
    ordersSource({ count: 0 }),
    ordersTable
  );

  it('returns the providers when every widget has one', () => {
    const bound = bindProviders<ShopContext>([kpiWidget, ordersWidget], {
      revenue: kpiAdapter,
      'recent-orders': tableAdapter,
    });
    assert.ok(bound.ok);
    assert.equal(Object.keys(bound.ok ? bound.value : {}).length, 2);
  });

  it('lists every problem at once, naming the widget and the key', () => {
    const bound = bindProviders<ShopContext>([kpiWidget, ordersWidget], {
      revenue: tableAdapter,
      oders: kpiAdapter,
    });
    assert.ok(!bound.ok);
    const message: string = bound.ok ? '' : bound.error;
    assert.match(
      message,
      /Widget "revenue" is a KPI, but the adapter registered under "revenue" \(source "orders"\) builds TABLE/
    );
    assert.match(
      message,
      /Widget "recent-orders": no provider or adapter is registered under "recent-orders"/
    );
    assert.match(
      message,
      /Provider "oders" is registered, but no widget uses it/
    );
  });

  it('skips inactive widgets, finds providers by providerKeyOf and can allow unused ones', () => {
    const off = defineWidget({
      key: 'off',
      title: 'Off',
      kind: 'KPI',
      active: false,
    });
    const builderWidget = {
      ...defineWidget({ key: 'mine', title: 'Mine', kind: 'KPI' }),
      source: 'revenue',
    };
    const bound = bindProviders<ShopContext>(
      [off, builderWidget],
      { revenue: kpiAdapter, extra: kpiAdapter },
      { allowUnused: true }
    );
    assert.ok(bound.ok);
    const strict = bindProviders<ShopContext>([off, builderWidget], {
      revenue: kpiAdapter,
      extra: kpiAdapter,
    });
    assert.ok(!strict.ok);
  });

  it('accepts a plain provider without checking its kind', () => {
    const bound = bindProviders<ShopContext>([kpiWidget], {
      revenue: () => ({ kind: 'KPI', value: 1, format: 'number', label: 'R' }),
    });
    assert.ok(bound.ok);
  });
});

// Type-level, checked by tsc: a mapper for one kind may not return another.
void defineAdapter(
  'TABLE',
  { id: 't', load: (): number => 1 },
  // @ts-expect-error a TABLE adapter's mapper may not return a KPI.
  (raw: number) => toKpi({ label: 'K', value: raw, format: 'number' })
);
