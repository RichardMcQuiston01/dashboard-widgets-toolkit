import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { createWidgetLoader } from '../../src/core/loader.js';
import type { WidgetPayload } from '../../src/core/payload.js';
import type {
  CachedPayload,
  DashboardWidget,
  WidgetCache,
  WidgetContext,
  WidgetProviders,
} from '../../src/core/resolve.js';

const definitions: WidgetDefinition[] = [
  defineWidget({ key: 'slow', title: 'Slow', kind: 'TEXT', sortOrder: 10 }),
  defineWidget({ key: 'fast', title: 'Fast', kind: 'TEXT', sortOrder: 20 }),
  defineWidget({
    key: 'admin',
    title: 'Admin',
    kind: 'TEXT',
    sortOrder: 30,
    roles: ['admin'],
  }),
];

function text(value: string): WidgetPayload {
  return { kind: 'TEXT', value, label: value };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(widgets: readonly DashboardWidget[]): string {
  return widgets.map((w) => `${w.definition.key}:${w.status}`).join(' ');
}

class MemoryCache implements WidgetCache {
  readonly entries = new Map<string, CachedPayload>();
  get(key: string): CachedPayload | undefined {
    return this.entries.get(key);
  }
  set(key: string, entry: CachedPayload): void {
    this.entries.set(key, entry);
  }
}

void describe('createWidgetLoader', () => {
  void it('starts every visible widget as loading and runs nothing yet', () => {
    let calls = 0;
    const providers: WidgetProviders = {
      slow: () => (calls++, text('a')),
      fast: () => (calls++, text('b')),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: { roles: ['member'] },
    });
    assert.equal(statusOf(loader.getSnapshot()), 'slow:loading fast:loading');
    assert.equal(calls, 0);
    loader.dispose();
  });

  void it('resolves widgets independently, in the order they finish', async () => {
    const providers: WidgetProviders = {
      slow: async () => {
        await sleep(60);
        return text('slow');
      },
      fast: async () => {
        await sleep(5);
        return text('fast');
      },
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: { roles: [] },
    });
    const seen: string[] = [];
    loader.subscribe(() => seen.push(statusOf(loader.getSnapshot())));
    loader.loadAll();
    await sleep(25);
    assert.equal(statusOf(loader.getSnapshot()), 'slow:loading fast:ok');
    await sleep(80);
    assert.equal(statusOf(loader.getSnapshot()), 'slow:ok fast:ok');
    assert.deepEqual(seen, ['slow:loading fast:ok', 'slow:ok fast:ok']);
    loader.dispose();
  });

  void it('load is idempotent and ignores unknown or role-hidden keys', async () => {
    let calls = 0;
    const providers: WidgetProviders = {
      slow: () => (calls++, text('a')),
      fast: () => text('b'),
      admin: () => text('c'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: { roles: ['member'] },
    });
    loader.load('slow');
    loader.load('slow');
    loader.load('nope');
    loader.load('admin');
    await sleep(10);
    assert.equal(calls, 1);
    assert.equal(statusOf(loader.getSnapshot()), 'slow:ok fast:loading');
    loader.dispose();
  });

  void it('turns provider failures into error widgets without stopping others', async () => {
    const providers: WidgetProviders = {
      slow: () => {
        throw new Error('database is down');
      },
      fast: () => text('fine'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
    });
    loader.loadAll();
    await sleep(10);
    const [slow, fast] = loader.getSnapshot();
    assert.ok(slow?.status === 'error');
    assert.match(
      slow.error,
      /Widget "slow": provider failed: database is down/
    );
    assert.equal(fast?.status, 'ok');
    loader.dispose();
  });

  void it('times out a provider that ignores its signal', async () => {
    const providers: WidgetProviders = {
      slow: () => new Promise<WidgetPayload>(() => undefined),
      fast: () => text('fine'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
      timeoutMs: 20,
    });
    loader.loadAll();
    await sleep(60);
    const [slow, fast] = loader.getSnapshot();
    assert.ok(slow?.status === 'error');
    assert.match(slow.error, /Widget "slow": provider timed out after 20 ms\./);
    assert.equal(fast?.status, 'ok');
    loader.dispose();
  });

  void it('refresh aborts the previous call and ignores its late result', async () => {
    const signals: AbortSignal[] = [];
    let call = 0;
    const providers: WidgetProviders = {
      slow: async (_context, _definition, { signal }) => {
        signals.push(signal);
        call += 1;
        const mine: number = call;
        await sleep(mine === 1 ? 50 : 5);
        return text(`call ${mine}`);
      },
      fast: () => text('x'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
    });
    loader.load('slow');
    await sleep(10);
    loader.refresh('slow');
    await sleep(80);
    assert.equal(signals[0]?.aborted, true);
    const slow = loader.getSnapshot()[0];
    assert.ok(slow?.status === 'ok' && slow.data.kind === 'TEXT');
    assert.equal(slow.data.value, 'call 2');
    loader.dispose();
  });

  void it('refresh with skipInFlight leaves loading widgets alone', async () => {
    let calls = 0;
    const providers: WidgetProviders = {
      slow: async () => {
        calls += 1;
        await sleep(40);
        return text('slow');
      },
      fast: () => text('x'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
    });
    loader.loadAll();
    await sleep(10);
    loader.refresh(undefined, { skipInFlight: true });
    await sleep(60);
    assert.equal(calls, 1);
    assert.equal(loader.getSnapshot()[0]?.status, 'ok');
    loader.refresh(undefined, { skipInFlight: true });
    await sleep(10);
    assert.equal(calls, 2);
    loader.dispose();
  });

  void it('refresh keeps visible data, but sends an error back to loading', async () => {
    let fail = true;
    const providers: WidgetProviders = {
      slow: async () => {
        await sleep(10);
        if (fail) throw new Error('503');
        return text('recovered');
      },
      fast: () => text('x'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
    });
    loader.loadAll();
    await sleep(30);
    assert.equal(loader.getSnapshot()[0]?.status, 'error');
    fail = false;
    loader.refresh('slow');
    assert.equal(loader.getSnapshot()[0]?.status, 'loading');
    await sleep(30);
    const slow = loader.getSnapshot()[0];
    assert.ok(slow?.status === 'ok' && slow.data.kind === 'TEXT');
    assert.equal(slow.data.value, 'recovered');
    loader.dispose();
  });

  void it('shows cached data as stale, then replaces it with fresh data', async () => {
    const cache = new MemoryCache();
    cache.entries.set('slow', { payload: text('cached'), storedAt: 1000 });
    const providers: WidgetProviders = {
      slow: async () => {
        await sleep(30);
        return text('fresh');
      },
      fast: () => text('x'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
      cache,
    });
    loader.load('slow');
    await sleep(10);
    const stale = loader.getSnapshot()[0];
    assert.ok(stale?.status === 'ok' && stale.data.kind === 'TEXT');
    assert.equal(stale.data.value, 'cached');
    assert.equal(stale.stale, true);
    assert.equal(stale.updatedAt, 1000);
    await sleep(50);
    const fresh = loader.getSnapshot()[0];
    assert.ok(fresh?.status === 'ok' && fresh.data.kind === 'TEXT');
    assert.equal(fresh.data.value, 'fresh');
    assert.equal(fresh.stale, undefined);
    assert.ok((fresh.updatedAt ?? 0) > 1000);
    const stored = cache.entries.get('slow');
    assert.deepEqual(stored?.payload, text('fresh'));
    loader.dispose();
  });

  void it('ignores a corrupt cache entry and a failing cache', async () => {
    const corrupt = new MemoryCache();
    corrupt.entries.set('slow', {
      payload: { kind: 'TEXT', value: 5 },
      storedAt: 1,
    });
    const broken: WidgetCache = {
      get: () => {
        throw new Error('storage unavailable');
      },
      set: () => {
        throw new Error('storage unavailable');
      },
    };
    for (const cache of [corrupt, broken]) {
      const loader = createWidgetLoader({
        definitions,
        providers: { slow: () => text('fresh'), fast: () => text('x') },
        context: {},
        cache,
      });
      loader.load('slow');
      await sleep(15);
      const slow = loader.getSnapshot()[0];
      assert.ok(slow?.status === 'ok' && slow.data.kind === 'TEXT');
      assert.equal(slow.data.value, 'fresh');
      assert.equal(slow.stale, undefined);
      loader.dispose();
    }
  });

  void it('dispose aborts in-flight work and ignores late results', async () => {
    let aborted = false;
    const providers: WidgetProviders = {
      slow: async (_context, _definition, { signal }) => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        await sleep(30);
        return text('late');
      },
      fast: () => text('x'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {},
    });
    let notifications = 0;
    loader.subscribe(() => notifications++);
    loader.load('slow');
    await sleep(5);
    loader.dispose();
    await sleep(50);
    assert.equal(aborted, true);
    assert.equal(loader.getSnapshot()[0]?.status, 'loading');
    assert.equal(notifications, 0);
    loader.load('fast');
    loader.refresh();
    assert.equal(loader.getSnapshot()[1]?.status, 'loading');
  });

  void it('never calls a provider when disposed before it gets a turn', async () => {
    let calls = 0;
    const loader = createWidgetLoader({
      definitions,
      providers: { slow: () => (calls++, text('a')), fast: () => text('b') },
      context: {},
    });
    loader.load('slow');
    loader.dispose();
    await sleep(15);
    assert.equal(calls, 0);
  });

  void it('an external signal cancels what is in flight', async () => {
    const controller = new AbortController();
    const providers: WidgetProviders = {
      slow: () => new Promise<WidgetPayload>(() => undefined),
      fast: () => text('x'),
    };
    const loader = createWidgetLoader({
      definitions,
      providers,
      context: {} as WidgetContext,
      signal: controller.signal,
    });
    loader.load('slow');
    await sleep(5);
    controller.abort();
    await sleep(15);
    const slow = loader.getSnapshot()[0];
    assert.ok(slow?.status === 'error');
    assert.match(slow.error, /Widget "slow": loading was canceled\./);
    loader.dispose();
  });

  void it('one throwing subscriber does not stop the others', async () => {
    const loader = createWidgetLoader({
      definitions,
      providers: { slow: () => text('a'), fast: () => text('b') },
      context: {},
    });
    let heard = 0;
    loader.subscribe(() => {
      throw new Error('bad listener');
    });
    loader.subscribe(() => heard++);
    loader.loadAll();
    await sleep(10);
    assert.equal(heard, 2);
    loader.dispose();
  });
});
