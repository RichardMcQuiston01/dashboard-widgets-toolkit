import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { defineComponent, h, ref, type Ref } from 'vue';

import { defineWidget } from '../../src/core/definition.js';
import {
  defaultDetailQuery,
  type DetailData,
  type DetailLoader,
  type DetailProviderOptions,
  type DetailQuery,
} from '../../src/core/detail.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  useDetailData,
  type UseDetailDataResult,
} from '../../src/vue/index.js';
import { DetailHost } from '../../src/vue/detail-host.js';
import {
  findAll,
  mountComponent,
  settle,
  textOf,
  type Mounted,
} from './mount.js';

const widget = defineWidget({
  key: 'orders',
  title: 'Orders',
  kind: 'TABLE',
  detail: true,
});

const rows: DetailData = {
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'sold', label: 'Sold', numeric: true },
  ],
  rows: [
    [{ text: 'Jig' }, { text: '7', value: 7 }],
    [{ text: 'Coaster' }, { text: '12', value: 12 }],
  ],
};

interface Harness {
  readonly result: () => UseDetailDataResult;
  readonly mounted: Mounted;
}

function harness(
  load: DetailLoader | undefined,
  extra: {
    readonly fallback?: DetailData;
    readonly server?: Ref<{ readonly query: DetailQuery } | undefined>;
    readonly enabled?: Ref<boolean>;
    readonly view?: Ref<string>;
  } = {}
): Harness {
  let captured: UseDetailDataResult | undefined;
  const component = defineComponent(() => {
    captured = useDetailData(
      widget,
      () => load,
      extra.enabled ?? true,
      extra.fallback,
      { period: 'week' },
      extra.server,
      { store: 'north' },
      extra.view
    );
    return () => h('div');
  });
  const mounted: Mounted = mountComponent(component);
  return {
    result: () => captured as UseDetailDataResult,
    mounted,
  };
}

void describe('useDetailData', () => {
  void it('starts loading and loads after mount, passing what the widget uses', async () => {
    let seen: DetailProviderOptions | undefined;
    const view = ref('bars');
    const { result, mounted } = harness(
      (_definition, options) => {
        seen = options;
        return rows;
      },
      { view }
    );
    await settle();
    assert.equal(result().state.value.status, 'ok');
    assert.deepEqual(result().state.value.data, rows);
    assert.deepEqual(seen?.options, { period: 'week' });
    assert.deepEqual(seen?.filters, { store: 'north' });
    assert.equal(seen?.view, 'bars');
    assert.ok(seen?.signal instanceof AbortSignal);
    mounted.unmount();
  });

  void it('uses the fallback when the loader returns nothing', async () => {
    const { result, mounted } = harness(() => undefined, { fallback: rows });
    await settle();
    assert.equal(result().state.value.status, 'ok');
    assert.deepEqual(result().state.value.data, rows);
    mounted.unmount();
  });

  void it('reports an error when there is no data at all', async () => {
    const { result, mounted } = harness(undefined);
    await settle();
    assert.equal(result().state.value.status, 'error');
    assert.match(
      result().state.value.error ?? '',
      /Widget "orders" detail: no data/
    );
    mounted.unmount();
  });

  void it('reports a loader that throws, naming the widget', async () => {
    const { result, mounted } = harness(() => {
      throw new Error('db down');
    });
    await settle();
    assert.equal(result().state.value.status, 'error');
    assert.match(
      result().state.value.error ?? '',
      /Widget "orders" detail: db down/
    );
    mounted.unmount();
  });

  void it('reports data that fails validation', async () => {
    const { result, mounted } = harness(
      () => ({ columns: [], rows: [] }) as DetailData
    );
    await settle();
    assert.equal(result().state.value.status, 'error');
    assert.match(result().state.value.error ?? '', /Widget "orders" detail/);
    mounted.unmount();
  });

  void it('reload asks the loader again', async () => {
    let calls = 0;
    const { result, mounted } = harness(() => {
      calls += 1;
      return rows;
    });
    await settle();
    assert.equal(calls, 1);
    result().reload();
    await settle();
    assert.equal(calls, 2);
    mounted.unmount();
  });

  void it('does not load while disabled, and loads when enabled', async () => {
    let calls = 0;
    const enabled = ref(false);
    const { result, mounted } = harness(
      () => {
        calls += 1;
        return rows;
      },
      { enabled }
    );
    await settle();
    assert.equal(calls, 0);
    assert.equal(result().state.value.status, 'loading');
    enabled.value = true;
    await settle();
    assert.equal(calls, 1);
    assert.equal(result().state.value.status, 'ok');
    mounted.unmount();
  });

  void it('server mode: each query asks again, keeping the old page, and aborts the old request', async () => {
    const queries: DetailQuery[] = [];
    const signals: AbortSignal[] = [];
    const server = ref<{ readonly query: DetailQuery } | undefined>({
      query: defaultDetailQuery(2),
    });
    const { result, mounted } = harness(
      (_definition, options) => {
        queries.push(options.query);
        signals.push(options.signal);
        return new Promise<DetailData>((resolve) => {
          setTimeout(
            () => resolve({ ...rows, totalRows: 40 } as DetailData),
            options.query.page === 1 ? 0 : 20
          );
        });
      },
      { server }
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await settle();
    assert.equal(result().state.value.status, 'ok');
    assert.equal(queries.length, 1);

    server.value = { query: { ...defaultDetailQuery(2), page: 2 } };
    await settle();
    // The previous page stays, marked as refreshing.
    assert.equal(result().state.value.status, 'ok');
    assert.equal(result().state.value.refreshing, true);
    assert.equal(queries.length, 2);
    assert.equal(queries[1]?.page, 2);

    server.value = { query: { ...defaultDetailQuery(2), page: 3 } };
    await settle();
    assert.equal(signals[1]?.aborted, true, 'page 2 was aborted by page 3');
    await new Promise((resolve) => setTimeout(resolve, 40));
    await settle();
    assert.equal(result().state.value.refreshing, undefined);
    assert.equal(result().state.value.status, 'ok');

    // Going back to a page already loaded shows it at once, busy.
    server.value = { query: defaultDetailQuery(2) };
    await settle();
    assert.equal(result().state.value.status, 'ok');
    assert.equal(result().state.value.refreshing, true);
    mounted.unmount();
  });

  void it('aborts the request when the component unmounts', async () => {
    let signal: AbortSignal | undefined;
    const { mounted } = harness((_definition, options) => {
      signal = options.signal;
      return new Promise<DetailData>(() => undefined);
    });
    await settle();
    assert.equal(signal?.aborted, false);
    mounted.unmount();
    assert.equal(signal?.aborted, true);
  });
});

void describe('DetailHost', () => {
  const globals = globalThis as Record<string, unknown>;
  beforeEach(() => {
    globals['document'] = { activeElement: null };
    globals['HTMLElement'] = class HTMLElementStub {};
  });
  afterEach(() => {
    delete globals['document'];
    delete globals['HTMLElement'];
  });

  const card: DashboardWidget = {
    definition: widget,
    status: 'ok',
    data: {
      kind: 'TABLE',
      columns: [{ label: 'Name' }, { label: 'Sold', numeric: true }],
      rows: [[{ text: 'Jig' }, { text: '7' }]],
    },
  };

  function host(
    extra: Record<string, unknown>,
    queryChanges: DetailQuery[]
  ): Mounted {
    return mountComponent(DetailHost, {
      widget: card,
      view: 'base',
      query: defaultDetailQuery(25),
      onQueryChange: (query: DetailQuery) => queryChanges.push(query),
      loadDetail: undefined,
      onClose: () => undefined,
      exportFormats: undefined,
      onExport: undefined,
      onExportError: undefined,
      onExportDetail: undefined,
      ...extra,
    });
  }

  void it('shows the card’s own complete data when there is no loader', async () => {
    const changes: DetailQuery[] = [];
    const mounted = host({}, changes);
    await settle();
    const text: string = textOf(mounted.root);
    assert.match(text, /Orders/);
    assert.match(text, /Jig/);
    assert.deepEqual(changes, []);
    mounted.unmount();
  });

  void it('drops a sort column the data does not have', async () => {
    const changes: DetailQuery[] = [];
    const mounted = host(
      {
        query: {
          ...defaultDetailQuery(25),
          sort: { column: 'price', direction: 'asc' },
        },
      },
      changes
    );
    await settle();
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.sort, undefined);
    mounted.unmount();
  });

  void it('asks for the last page when a server-mode page is past the end', async () => {
    const serverWidget = defineWidget({
      key: 'orders',
      title: 'Orders',
      kind: 'TABLE',
      detail: { mode: 'server', pageSize: 2 },
    });
    const changes: DetailQuery[] = [];
    const mounted = host(
      {
        widget: { ...card, definition: serverWidget },
        query: { ...defaultDetailQuery(2), page: 9 },
        loadDetail: () => ({ ...rows, rows: [], totalRows: 5 }),
      },
      changes
    );
    await settle();
    assert.equal(changes.at(-1)?.page, 3);
    mounted.unmount();
  });

  void it('closes from the Close button', async () => {
    let closed = 0;
    const mounted = host({ onClose: () => (closed += 1) }, []);
    await settle();
    const button = findAll(mounted.root, 'button').find(
      (item) => textOf(item) === 'Close'
    );
    assert.ok(button, 'a Close button');
    (button.props['onClick'] as () => void)();
    assert.equal(closed, 1);
    mounted.unmount();
  });
});
