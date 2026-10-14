import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineWidget } from '../../src/core/definition.js';
import {
  EMPTY_LAYOUT,
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

  void it('clears only the backup', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    await store.save(scope, layoutOf(['a']));
    await store.saveBackup(scope, layoutOf(['b']));
    const cleared = await store.clearBackup(scope);
    assert.ok(cleared.ok);
    const backup = await store.loadBackup(scope);
    assert.ok(backup.ok && backup.value === null);
    const layout = await store.load(scope, definitions);
    assert.ok(layout.ok && layout.value.layout?.order[0] === 'a');
    // Clearing a backup that isn't there is fine.
    assert.ok((await store.clearBackup(scope)).ok);
  });

  void it('clearing a backup needs an adapter that can remove', async () => {
    const store = createLayoutPersistence({
      get: memoryAdapter().get,
      set: memoryAdapter().set,
    });
    const result = await store.clearBackup(scope);
    assert.ok(!result.ok && result.code === 'invalid');
    assert.match(result.error, /dwt:sales:user-42:backup.*no remove method/);
  });

  void it('stores the active page under its own key', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    assert.equal(store.keyFor(scope, 'page'), 'dwt:sales:user-42:page');
    const none = await store.loadActivePage(scope);
    assert.ok(none.ok && none.value === null);
    const saved = await store.saveActivePage(scope, 'orders');
    assert.ok(saved.ok);
    const loaded = await store.loadActivePage(scope);
    assert.ok(loaded.ok && loaded.value === 'orders');
    // The layout and the page don't touch each other.
    await store.save(scope, layoutOf(['a']));
    const again = await store.loadActivePage(scope);
    assert.ok(again.ok && again.value === 'orders');
    const layoutRead = await adapter.get(KEY, { signal });
    assert.ok(layoutRead.ok && layoutRead.value !== null);
    assert.doesNotMatch(layoutRead.value.value, /orders/);
  });

  void it('rejects an unusable page key and reports an unreadable stored one', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    const empty = await store.saveActivePage(scope, '');
    assert.ok(!empty.ok && empty.code === 'invalid');
    const long = await store.saveActivePage(scope, 'x'.repeat(201));
    assert.ok(!long.ok && long.code === 'invalid');
    assert.match(long.error, /1 to 200 characters, not 201/);
    for (const bad of ['{not json', '{"v":1,"page":7}', '[]', '{"page":""}']) {
      await adapter.set('dwt:sales:user-42:page', bad, { signal });
      const loaded = await store.loadActivePage(scope);
      assert.ok(!loaded.ok && loaded.code === 'corrupt', bad);
      assert.match(loaded.error, /dwt:sales:user-42:page/);
    }
  });

  void it('reset also removes the active page', async () => {
    const adapter = memoryAdapter();
    const store = createLayoutPersistence(adapter);
    await store.save(scope, layoutOf(['a']));
    await store.saveActivePage(scope, 'orders');
    assert.ok((await store.reset(scope)).ok);
    const loaded = await store.loadActivePage(scope);
    assert.ok(loaded.ok && loaded.value === null);
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

void describe('re-exports from @richardmcquiston01/storage-adapters', () => {
  void it('keeps the adapter helpers on the public surface', async () => {
    const helpers = {
      memoryAdapter,
      readOnly,
      utf8Length,
      withEncoding,
      withFallback,
      withLogging,
      withPrefix,
      withReadCache,
      withRetry,
    };
    for (const [name, helper] of Object.entries(helpers)) {
      assert.equal(typeof helper, 'function', name);
    }
    assert.equal(utf8Length('é€😀'), 9);
  });

  void it('wrapped adapters still persist layouts', async () => {
    const inner = memoryAdapter();
    const store = createLayoutPersistence(withPrefix(inner, 'app:'));
    const saved = await store.save(scope, layoutOf(['b', 'a']));
    assert.ok(saved.ok && saved.value.outcome === 'saved');
    const raw = await inner.get(`app:${KEY}`, { signal });
    assert.ok(raw.ok && raw.value !== null);
    const readOnlyStore = createLayoutPersistence(readOnly(inner));
    const denied = await readOnlyStore.save(scope, layoutOf(['a']));
    assert.ok(!denied.ok && denied.code === 'forbidden');
  });
});
