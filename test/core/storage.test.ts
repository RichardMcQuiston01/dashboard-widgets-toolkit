import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineWidget } from '../../src/core/definition.js';
import {
  EMPTY_LAYOUT,
  parseLayout,
  serializeLayout,
  type DashboardLayout,
} from '../../src/core/layout.js';
import {
  createLayoutPersistence,
  memoryAdapter,
  readOnly,
  utf8Length,
  withEncoding,
  withFallback,
  withLogging,
  withPrefix,
  withReadCache,
  withRetry,
  type StorageAdapter,
  type StorageLogEvent,
  type StoreResult,
  type StoredValue,
} from '../../src/core/storage.js';

const definitions = [
  defineWidget({ key: 'a', title: 'A', kind: 'TEXT', sortOrder: 1 }),
  defineWidget({ key: 'b', title: 'B', kind: 'TEXT', sortOrder: 2 }),
];
const scope = { dashboardKey: 'sales', userKey: 'user-42' };
const signal: AbortSignal = new AbortController().signal;
const KEY = 'dwt:sales:user-42:layout';

function layoutOf(order: string[], hidden: string[] = []): DashboardLayout {
  return { order, hidden, minimized: [] };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fails the first `failures` calls of every method with `code`. */
function flaky(
  inner: StorageAdapter,
  failures: number,
  code: 'unavailable' | 'quota'
): StorageAdapter & { calls: number } {
  const state = { calls: 0 };
  const guard = <T>(
    run: () => Promise<StoreResult<T>>
  ): Promise<StoreResult<T>> => {
    state.calls += 1;
    if (state.calls <= failures) {
      return Promise.resolve({ ok: false, code, error: `down ${state.calls}` });
    }
    return run();
  };
  return {
    get calls(): number {
      return state.calls;
    },
    get: (key, o) => guard(() => inner.get(key, o)),
    set: (key, value, o) => guard(() => inner.set(key, value, o)),
  };
}

void describe('createLayoutPersistence', () => {
  void it('round trips a layout and builds scoped keys', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    assert.equal(store.keyFor(scope), KEY);
    assert.equal(
      store.keyFor({ dashboardKey: 'a:b' }, 'backup'),
      'dwt:a%3Ab:_:backup'
    );
    const saved = await store.save(scope, layoutOf(['b', 'a'], ['a']));
    assert.ok(saved.ok && saved.value.outcome === 'saved');
    const loaded = await store.load(scope, definitions);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value.layout?.order, ['b', 'a']);
    assert.deepEqual(loaded.value.layout?.hidden, ['a']);
    assert.ok(loaded.value.savedAt !== undefined);
  });

  void it('returns a null layout when nothing is stored', async () => {
    const store = createLayoutPersistence(memoryAdapter());
    const loaded = await store.load(scope, definitions);
    assert.ok(loaded.ok);
    assert.equal(loaded.value.layout, null);
  });

  void it('reads a bare legacy layout and repairs it against the definitions', async () => {
    const bare: string = serializeLayout(layoutOf(['gone', 'b', 'a']));
    const store = createLayoutPersistence(memoryAdapter({ [KEY]: bare }));
    const loaded = await store.load(scope, definitions);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value.layout?.order, ['b', 'a']);
  });

  void it('names the key for corrupt and too-new values', async () => {
    const corrupt = createLayoutPersistence(memoryAdapter({ [KEY]: '{nope' }));
    const first = await corrupt.load(scope, definitions);
    assert.ok(!first.ok && first.code === 'corrupt');
    assert.match(first.error, /"dwt:sales:user-42:layout" is not valid JSON/);
    const newer = createLayoutPersistence(
      memoryAdapter({ [KEY]: JSON.stringify({ v: 9, layout: {} }) })
    );
    const second = await newer.load(scope, definitions);
    assert.ok(!second.ok && second.code === 'invalid');
    assert.match(second.error, /version 9/);
  });

  void it('rejects an empty dashboard key', async () => {
    const store = createLayoutPersistence(memoryAdapter());
    const result = await store.save({ dashboardKey: ' ' }, EMPTY_LAYOUT);
    assert.ok(!result.ok && result.code === 'invalid');
    assert.match(result.error, /dashboardKey/);
  });

  void it('refuses a layout over the size limit and says how big it was', async () => {
    const store = createLayoutPersistence(memoryAdapter(), { maxBytes: 80 });
    const result = await store.save(
      scope,
      layoutOf(['some-long-widget-key', 'another-long-widget-key'])
    );
    assert.ok(!result.ok && result.code === 'invalid');
    assert.match(result.error, /layout is \d+ bytes, over the 80 byte limit/);
  });

  void it('collapses rapid saves into the newest and resolves every caller', async () => {
    const inner = memoryAdapter();
    const writes: string[] = [];
    const slow: StorageAdapter = {
      get: inner.get,
      set: async (key, value, o) => {
        await sleep(10);
        writes.push(value);
        return inner.set(key, value, o);
      },
    };
    const store = createLayoutPersistence(slow);
    const results = await Promise.all([
      store.save(scope, layoutOf(['a'])),
      store.save(scope, layoutOf(['b'])),
      store.save(scope, layoutOf(['a', 'b'])),
    ]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(writes.length, 2);
    const loaded = await store.load(scope, definitions);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value.layout?.order, ['a', 'b']);
  });

  void it('turns a throwing adapter into an error result', async () => {
    const broken: StorageAdapter = {
      get: () => Promise.reject(new Error('socket closed')),
      set: () => Promise.reject(new Error('socket closed')),
    };
    const store = createLayoutPersistence(broken);
    const loaded = await store.load(scope, definitions);
    assert.ok(!loaded.ok && loaded.code === 'unavailable');
    assert.match(loaded.error, /Could not load .*socket closed/);
    const saved = await store.save(scope, EMPTY_LAYOUT);
    assert.ok(!saved.ok);
    assert.match(saved.error, /Could not save/);
  });

  void it('keeps a backup under its own key and reset removes both', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    await store.save(scope, layoutOf(['a']));
    const backup = await store.saveBackup(scope, layoutOf(['b']));
    assert.ok(backup.ok);
    const loaded = await store.loadBackup(scope);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value?.order, ['b']);
    const reset = await store.reset(scope);
    assert.ok(reset.ok);
    const after = await store.load(scope, definitions);
    assert.ok(after.ok && after.value.layout === null);
    const afterBackup = await store.loadBackup(scope);
    assert.ok(afterBackup.ok && afterBackup.value === null);
  });

  void it('reset needs an adapter that can remove', async () => {
    const store = createLayoutPersistence({
      get: memoryAdapter().get,
      set: memoryAdapter().set,
    });
    const result = await store.reset(scope);
    assert.ok(!result.ok && result.code === 'invalid');
    assert.match(result.error, /no remove method/);
  });
});

void describe('conflict policies', () => {
  async function conflicted(
    onConflict: Parameters<typeof createLayoutPersistence>[1]
  ): Promise<{
    store: ReturnType<typeof createLayoutPersistence>;
    adapter: StorageAdapter;
  }> {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter, onConflict);
    await store.save(scope, layoutOf(['a', 'b'])); // revision 1, remembered
    // Another device writes behind our back.
    const other = createLayoutPersistence(adapter);
    await other.load(scope, definitions);
    await other.save(scope, layoutOf(['b', 'a']), { force: true });
    return { store, adapter };
  }

  void it("'ask' (default) stores nothing and returns theirs", async () => {
    const { store } = await conflicted({});
    const result = await store.save(scope, layoutOf(['a'], ['b']));
    assert.ok(result.ok && result.value.outcome === 'conflict');
    assert.deepEqual(result.value.layout.order, ['b', 'a']);
    const forced = await store.save(scope, layoutOf(['a'], ['b']), {
      force: true,
    });
    assert.ok(forced.ok && forced.value.outcome === 'saved');
  });

  void it("'overwrite' saves anyway", async () => {
    const { store } = await conflicted({ onConflict: 'overwrite' });
    const result = await store.save(scope, layoutOf(['a'], ['b']));
    assert.ok(result.ok && result.value.outcome === 'saved');
    const loaded = await store.load(scope, definitions);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value.layout?.hidden, ['b']);
  });

  void it("'keep-theirs' drops the local save", async () => {
    const { store } = await conflicted({ onConflict: 'keep-theirs' });
    const result = await store.save(scope, layoutOf(['a'], ['b']));
    assert.ok(result.ok && result.value.outcome === 'kept-theirs');
    assert.deepEqual(result.value.layout.order, ['b', 'a']);
  });

  void it('a merge function decides what is saved', async () => {
    const { store } = await conflicted({
      onConflict: (mine, theirs) => ({ ...theirs, hidden: mine.hidden }),
    });
    const result = await store.save(scope, layoutOf(['a'], ['b']));
    assert.ok(result.ok && result.value.outcome === 'saved');
    assert.deepEqual(result.value.layout.order, ['b', 'a']);
    assert.deepEqual(result.value.layout.hidden, ['b']);
  });

  void it('reports a throwing merge function', async () => {
    const { store } = await conflicted({
      onConflict: () => {
        throw new Error('cannot merge');
      },
    });
    const result = await store.save(scope, layoutOf(['a']));
    assert.ok(!result.ok);
    assert.match(result.error, /merge function threw cannot merge/);
  });
});

void describe('watch', () => {
  void it('reports changes made elsewhere but not our own saves', async () => {
    const adapter = memoryAdapter();
    const mine = createLayoutPersistence(adapter);
    const theirs = createLayoutPersistence(adapter);
    const seen: (readonly string[] | null)[] = [];
    const stop = mine.watch(scope, definitions, (loaded) =>
      seen.push(loaded.layout?.order ?? null)
    );
    await mine.save(scope, layoutOf(['a', 'b']));
    assert.deepEqual(seen, []);
    await theirs.save(scope, layoutOf(['b', 'a']), { force: true });
    assert.deepEqual(seen, [['b', 'a']]);
    stop();
    await theirs.save(scope, layoutOf(['a', 'b']), { force: true });
    assert.equal(seen.length, 1);
  });
});

void describe('adapter wrappers', () => {
  void it('memoryAdapter checks revisions', async () => {
    const adapter = memoryAdapter();
    const first = await adapter.set('k', 'one', { signal });
    assert.ok(first.ok);
    const stale = await adapter.set('k', 'two', { signal, ifRevision: '99' });
    assert.ok(!stale.ok && stale.code === 'conflict');
    assert.match(stale.error, /"k"/);
  });

  void it('withPrefix namespaces keys', async () => {
    const inner = memoryAdapter();
    const adapter = withPrefix(inner, 'app1:');
    await adapter.set('k', 'v', { signal });
    const direct = await inner.get('app1:k', { signal });
    assert.ok(direct.ok && direct.value?.value === 'v');
  });

  void it('withFallback reads in order and writes to both', async () => {
    const primary = memoryAdapter();
    const secondary = memoryAdapter({ k: 'local' });
    const adapter = withFallback(primary, secondary);
    const read = await adapter.get('k', { signal });
    assert.ok(read.ok && read.value?.value === 'local');
    await adapter.set('k', 'new', { signal });
    for (const side of [primary, secondary]) {
      const got = await side.get('k', { signal });
      assert.ok(got.ok && got.value?.value === 'new');
    }
  });

  void it('withFallback counts a secondary write as saved when primary is down, but passes conflicts through', async () => {
    const down = flaky(memoryAdapter(), 99, 'unavailable');
    const secondary = memoryAdapter();
    const adapter = withFallback(down, secondary);
    const saved = await adapter.set('k', 'v', { signal });
    assert.ok(saved.ok);
    const conflicted = withFallback(memoryAdapter(), secondary);
    const result = await conflicted.set('k', 'v', { signal, ifRevision: '7' });
    assert.ok(!result.ok && result.code === 'conflict');
  });

  void it('withReadCache reads the store once', async () => {
    let reads = 0;
    const inner = memoryAdapter({ k: 'v' });
    const adapter = withReadCache({
      ...inner,
      get: (key, o) => (reads++, inner.get(key, o)),
    });
    await adapter.get('k', { signal });
    await adapter.get('k', { signal });
    assert.equal(reads, 1);
    await adapter.set('k', 'w', { signal });
    const after = await adapter.get('k', { signal });
    assert.ok(after.ok && after.value?.value === 'w');
    assert.equal(reads, 1);
  });

  void it('readOnly rejects writes with forbidden', async () => {
    const adapter = readOnly(memoryAdapter({ k: 'v' }));
    const read = await adapter.get('k', { signal });
    assert.ok(read.ok);
    const write = await adapter.set('k', 'x', { signal });
    assert.ok(!write.ok && write.code === 'forbidden');
    assert.match(write.error, /read-only/);
  });

  void it('withRetry retries unavailable with doubling waits, and nothing else', async () => {
    const waits: number[] = [];
    const sleeper = (ms: number): Promise<void> => {
      waits.push(ms);
      return Promise.resolve();
    };
    const recovers = flaky(memoryAdapter({ k: 'v' }), 2, 'unavailable');
    const adapter = withRetry(recovers, { attempts: 3, sleep: sleeper });
    const read = await adapter.get('k', { signal });
    assert.ok(read.ok);
    assert.deepEqual(waits, [200, 400]);
    const full = flaky(memoryAdapter(), 5, 'quota');
    const quota = await withRetry(full, { sleep: sleeper }).set('k', 'v', {
      signal,
    });
    assert.ok(!quota.ok && quota.code === 'quota');
    assert.equal(full.calls, 1);
  });

  void it('withEncoding round trips and reports a bad decode as corrupt', async () => {
    const inner = memoryAdapter();
    const adapter = withEncoding(inner, {
      encode: (v) => `x${[...v].reverse().join('')}`,
      decode: (v) => {
        if (!v.startsWith('x')) throw new Error('missing marker');
        return [...v.slice(1)].reverse().join('');
      },
    });
    await adapter.set('k', 'hello', { signal });
    const raw = await inner.get('k', { signal });
    assert.ok(raw.ok && raw.value?.value === 'xolleh');
    const back = await adapter.get('k', { signal });
    assert.ok(back.ok && back.value?.value === 'hello');
    await inner.set('bad', 'nope', { signal });
    const bad = await adapter.get('bad', { signal });
    assert.ok(!bad.ok && bad.code === 'corrupt');
    assert.match(bad.error, /"bad".*missing marker/);
  });

  void it('withLogging reports keys and codes, never values', async () => {
    const events: StorageLogEvent[] = [];
    const adapter = withLogging(readOnly(memoryAdapter()), (e) => {
      events.push(e);
    });
    await adapter.set('k', 'secret-value', { signal });
    await adapter.get('k', { signal });
    assert.deepEqual(events, [
      { operation: 'set', key: 'k', ok: false, code: 'forbidden' },
      { operation: 'get', key: 'k', ok: true },
    ]);
    assert.doesNotMatch(JSON.stringify(events), /secret-value/);
  });

  void it('a stored value is a string the layout parser accepts', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    await store.save(scope, layoutOf(['a']));
    const raw = (await adapter.get(KEY, {
      signal,
    })) as StoreResult<StoredValue | null>;
    assert.ok(raw.ok && raw.value !== null);
    const envelope = JSON.parse(raw.value.value) as {
      v: number;
      layout: unknown;
    };
    assert.equal(envelope.v, 1);
    assert.deepEqual(parseLayout(envelope.layout).order, ['a']);
  });
});

void describe('utf8Length', () => {
  void it('counts bytes, not characters', () => {
    assert.equal(utf8Length('abc'), 3);
    assert.equal(utf8Length('é'), 2);
    assert.equal(utf8Length('€'), 3);
    assert.equal(utf8Length('😀'), 4);
  });
});
