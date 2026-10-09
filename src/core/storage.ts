/**
 * Storage adapters: the contract a developer implements to keep a layout in
 * localStorage, IndexedDB, a REST API or a database, plus I/O-free helpers
 * built on it (`createLayoutPersistence` and small adapter wrappers). The
 * package does no I/O itself: no timers, DOM, `fetch` or storage globals.
 * See docs/design/storage-adapters.md.
 */

import {
  parseLayout,
  serializeLayout,
  type DashboardLayout,
} from './layout.js';
import { normalizeLayout, type NormalizeOptions } from './pages.js';
import type { PageItem } from './pages.js';
import { describeUnknownError } from './result.js';

export type StoreErrorCode =
  /** Storage can't be reached or is disabled. */
  | 'unavailable'
  /** Storage is full. */
  | 'quota'
  /** Not allowed to read or write. */
  | 'forbidden'
  /** The stored revision is newer than the one given. */
  | 'conflict'
  /** The adapter was given something it can't store. */
  | 'invalid'
  /** What is stored can't be read back. */
  | 'corrupt';

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: StoreErrorCode;
      /** Names the key and the cause. */
      readonly error: string;
    };

export interface StoredValue {
  /** The serialized layout. */
  readonly value: string;
  /** Opaque version (an ETag, a row version) for conflict detection. */
  readonly revision?: string;
}

export interface StorageAdapter {
  /** Resolves `{ ok: true, value: null }` when nothing is stored. */
  get(
    key: string,
    options: { readonly signal: AbortSignal }
  ): Promise<StoreResult<StoredValue | null>>;
  /**
   * With `ifRevision`, fail with `conflict` when the stored revision differs.
   * Adapters without revisions ignore it (last write wins).
   */
  set(
    key: string,
    value: string,
    options: { readonly signal: AbortSignal; readonly ifRevision?: string }
  ): Promise<StoreResult<StoredValue>>;
  remove?(
    key: string,
    options: { readonly signal: AbortSignal }
  ): Promise<StoreResult<null>>;
  /** Optional: report a change made elsewhere (another tab). Returns an unsubscribe. */
  subscribe?(
    key: string,
    onChange: (stored: StoredValue | null) => void
  ): () => void;
}

function failure(
  code: StoreErrorCode,
  error: string
): {
  readonly ok: false;
  readonly code: StoreErrorCode;
  readonly error: string;
} {
  return { ok: false, code, error };
}

/** UTF-8 byte length without `TextEncoder` (the core has no DOM or Node lib). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const point: number = char.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/* ------------------------------------------------------------------ */
/* Adapters and wrappers                                               */
/* ------------------------------------------------------------------ */

/** An in-memory adapter with revisions and `subscribe`: tests, SSR, fallback. */
export function memoryAdapter(
  initial: Readonly<Record<string, string>> = {}
): StorageAdapter {
  const entries = new Map<string, StoredValue>();
  const listeners = new Map<
    string,
    Set<(stored: StoredValue | null) => void>
  >();
  let counter = 0;
  for (const [key, value] of Object.entries(initial)) {
    counter += 1;
    entries.set(key, { value, revision: String(counter) });
  }
  const notify = (key: string, stored: StoredValue | null): void => {
    for (const listener of listeners.get(key) ?? []) listener(stored);
  };
  return {
    get: (key) =>
      Promise.resolve({ ok: true, value: entries.get(key) ?? null }),
    set: (key, value, options) => {
      const current: StoredValue | undefined = entries.get(key);
      if (
        options.ifRevision !== undefined &&
        (current?.revision ?? undefined) !== options.ifRevision
      ) {
        return Promise.resolve(
          failure(
            'conflict',
            `Could not save "${key}": it changed since revision ${options.ifRevision} (now ${current?.revision ?? 'none'}).`
          )
        );
      }
      counter += 1;
      const stored: StoredValue = { value, revision: String(counter) };
      entries.set(key, stored);
      notify(key, stored);
      return Promise.resolve({ ok: true, value: stored });
    },
    remove: (key) => {
      entries.delete(key);
      notify(key, null);
      return Promise.resolve({ ok: true, value: null });
    },
    subscribe: (key, onChange) => {
      const set: Set<(stored: StoredValue | null) => void> =
        listeners.get(key) ?? new Set();
      set.add(onChange);
      listeners.set(key, set);
      return () => {
        set.delete(onChange);
      };
    },
  };
}

/** Namespaces every key, for several dashboards or apps in one store. */
export function withPrefix(
  adapter: StorageAdapter,
  prefix: string
): StorageAdapter {
  return {
    get: (key, options) => adapter.get(prefix + key, options),
    set: (key, value, options) => adapter.set(prefix + key, value, options),
    ...(adapter.remove === undefined
      ? {}
      : {
          remove: (key: string, options: { readonly signal: AbortSignal }) =>
            adapter.remove?.(prefix + key, options) ??
            Promise.resolve(failure('invalid', 'remove is not supported.')),
        }),
    ...(adapter.subscribe === undefined
      ? {}
      : {
          subscribe: (
            key: string,
            onChange: (stored: StoredValue | null) => void
          ) => adapter.subscribe?.(prefix + key, onChange) ?? (() => undefined),
        }),
  };
}

/**
 * Reads from `primary`, falling back to `secondary` when it errs or holds
 * nothing. Writes go to `primary` first, then `secondary` (best effort); a
 * `conflict` from `primary` is returned as is and writes nothing else. When
 * `primary` can't be written but `secondary` can, the write counts as saved.
 */
export function withFallback(
  primary: StorageAdapter,
  secondary: StorageAdapter
): StorageAdapter {
  return {
    async get(key, options) {
      const first = await primary.get(key, options);
      if (first.ok && first.value !== null) return first;
      const second = await secondary.get(key, options);
      if (second.ok && second.value !== null) return second;
      return first;
    },
    async set(key, value, options) {
      const first = await primary.set(key, value, options);
      if (!first.ok && first.code === 'conflict') return first;
      const second = await secondary.set(key, value, {
        signal: options.signal,
      });
      if (first.ok) return first;
      return second.ok ? second : first;
    },
    async remove(key, options) {
      const first = (await primary.remove?.(key, options)) ?? {
        ok: true as const,
        value: null,
      };
      await secondary.remove?.(key, options);
      return first;
    },
    subscribe: (key, onChange) => {
      const stops: (() => void)[] = [primary, secondary].flatMap((adapter) => {
        const stop: (() => void) | undefined = adapter.subscribe?.(
          key,
          onChange
        );
        return stop === undefined ? [] : [stop];
      });
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}

/** Remembers each key's last read or write, so repeated reads skip the store. */
export function withReadCache(adapter: StorageAdapter): StorageAdapter {
  const cache = new Map<string, StoredValue | null>();
  return {
    async get(key, options) {
      const cached: StoredValue | null | undefined = cache.get(key);
      if (cached !== undefined) return { ok: true, value: cached };
      const result = await adapter.get(key, options);
      if (result.ok) cache.set(key, result.value);
      return result;
    },
    async set(key, value, options) {
      const result = await adapter.set(key, value, options);
      if (result.ok) cache.set(key, result.value);
      else cache.delete(key);
      return result;
    },
    async remove(key, options) {
      cache.delete(key);
      return (
        (await adapter.remove?.(key, options)) ??
        failure(
          'invalid',
          `Could not remove "${key}": remove is not supported.`
        )
      );
    },
    ...(adapter.subscribe === undefined
      ? {}
      : {
          subscribe: (
            key: string,
            onChange: (stored: StoredValue | null) => void
          ) =>
            adapter.subscribe?.(key, (stored) => {
              cache.set(key, stored);
              onChange(stored);
            }) ?? (() => undefined),
        }),
  };
}

/** Rejects writes with `forbidden`: previewing someone else's layout. */
export function readOnly(adapter: StorageAdapter): StorageAdapter {
  return {
    get: (key, options) => adapter.get(key, options),
    set: (key) =>
      Promise.resolve(
        failure(
          'forbidden',
          `Could not save "${key}": this store is read-only.`
        )
      ),
    remove: (key) =>
      Promise.resolve(
        failure(
          'forbidden',
          `Could not remove "${key}": this store is read-only.`
        )
      ),
    ...(adapter.subscribe === undefined
      ? {}
      : { subscribe: adapter.subscribe.bind(adapter) }),
  };
}

export interface RetryOptions {
  /** Total tries, including the first. Default 3. */
  readonly attempts?: number;
  /** First wait in ms; doubles each retry. Default 200. */
  readonly delayMs?: number;
  /** Waits `ms`. You pass it, so the core has no timers. */
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Retries `unavailable` errors (and nothing else) with doubling waits. */
export function withRetry(
  adapter: StorageAdapter,
  options: RetryOptions
): StorageAdapter {
  const attempts: number = Math.max(1, Math.floor(options.attempts ?? 3));
  const baseDelay: number = options.delayMs ?? 200;
  const retrying = async <T>(
    signal: AbortSignal,
    run: () => Promise<StoreResult<T>>
  ): Promise<StoreResult<T>> => {
    let result: StoreResult<T> = await run();
    for (
      let attempt = 1;
      attempt < attempts &&
      !result.ok &&
      result.code === 'unavailable' &&
      !signal.aborted;
      attempt += 1
    ) {
      await options.sleep(baseDelay * 2 ** (attempt - 1), signal);
      result = await run();
    }
    return result;
  };
  return {
    get: (key, o) => retrying(o.signal, () => adapter.get(key, o)),
    set: (key, value, o) =>
      retrying(o.signal, () => adapter.set(key, value, o)),
    ...(adapter.remove === undefined
      ? {}
      : {
          remove: (key: string, o: { readonly signal: AbortSignal }) =>
            retrying(
              o.signal,
              () =>
                adapter.remove?.(key, o) ??
                Promise.resolve(failure('invalid', 'remove is not supported.'))
            ),
        }),
    ...(adapter.subscribe === undefined
      ? {}
      : { subscribe: adapter.subscribe.bind(adapter) }),
  };
}

export interface EncodingOptions {
  /** Applied before storing: compression, or encryption with your own crypto. */
  readonly encode: (value: string) => string | Promise<string>;
  /** Reverses `encode` after reading. */
  readonly decode: (value: string) => string | Promise<string>;
}

/** Transforms values on the way in and out. Keys and revisions pass through. */
export function withEncoding(
  adapter: StorageAdapter,
  codec: EncodingOptions
): StorageAdapter {
  const decodeStored = async (
    key: string,
    stored: StoredValue
  ): Promise<StoreResult<StoredValue>> => {
    try {
      const value: string = await codec.decode(stored.value);
      return {
        ok: true,
        value:
          stored.revision === undefined
            ? { value }
            : { value, revision: stored.revision },
      };
    } catch (cause) {
      return failure(
        'corrupt',
        `Could not decode the value stored at "${key}": ${describeUnknownError(cause)}`
      );
    }
  };
  return {
    async get(key, options) {
      const result = await adapter.get(key, options);
      if (!result.ok || result.value === null) return result;
      return decodeStored(key, result.value);
    },
    async set(key, value, options) {
      let encoded: string;
      try {
        encoded = await codec.encode(value);
      } catch (cause) {
        return failure(
          'invalid',
          `Could not encode the value for "${key}": ${describeUnknownError(cause)}`
        );
      }
      const result = await adapter.set(key, encoded, options);
      if (!result.ok) return result;
      return result.value.revision === undefined
        ? { ok: true, value: { value } }
        : { ok: true, value: { value, revision: result.value.revision } };
    },
    ...(adapter.remove === undefined
      ? {}
      : { remove: adapter.remove.bind(adapter) }),
    ...(adapter.subscribe === undefined
      ? {}
      : {
          subscribe: (
            key: string,
            onChange: (stored: StoredValue | null) => void
          ) =>
            adapter.subscribe?.(key, (stored) => {
              if (stored === null) {
                onChange(null);
                return;
              }
              void decodeStored(key, stored).then((decoded) => {
                if (decoded.ok) onChange(decoded.value);
              });
            }) ?? (() => undefined),
        }),
  };
}

export interface StorageLogEvent {
  readonly operation: 'get' | 'set' | 'remove';
  readonly key: string;
  readonly ok: boolean;
  /** Present when `ok` is false. Values are never logged. */
  readonly code?: StoreErrorCode;
}

/** Reports each operation's key and outcome. Never the stored value. */
export function withLogging(
  adapter: StorageAdapter,
  log: (event: StorageLogEvent) => void
): StorageAdapter {
  const report = <T>(
    operation: StorageLogEvent['operation'],
    key: string,
    result: StoreResult<T>
  ): StoreResult<T> => {
    try {
      log(
        result.ok
          ? { operation, key, ok: true }
          : { operation, key, ok: false, code: result.code }
      );
    } catch {
      // A broken logger must not break storage.
    }
    return result;
  };
  return {
    get: async (key, o) => report('get', key, await adapter.get(key, o)),
    set: async (key, value, o) =>
      report('set', key, await adapter.set(key, value, o)),
    ...(adapter.remove === undefined
      ? {}
      : {
          remove: async (key: string, o: { readonly signal: AbortSignal }) =>
            report(
              'remove',
              key,
              (await adapter.remove?.(key, o)) ??
                failure('invalid', 'remove is not supported.')
            ),
        }),
    ...(adapter.subscribe === undefined
      ? {}
      : { subscribe: adapter.subscribe.bind(adapter) }),
  };
}

/* ------------------------------------------------------------------ */
/* Layout persistence                                                  */
/* ------------------------------------------------------------------ */

export interface StoreScope {
  /** Which dashboard: 'sales'. */
  readonly dashboardKey: string;
  /** Who it belongs to; absent for shared defaults. A hint for building the key: a server takes the user from the session. */
  readonly userKey?: string;
}

/** Current envelope version written by `createLayoutPersistence`. */
export const LAYOUT_ENVELOPE_VERSION = 1;

/** Default largest serialized layout (bytes). */
export const DEFAULT_MAX_LAYOUT_BYTES = 64 * 1024;

export type ConflictPolicy =
  /** Save anyway; the other device's change is lost. */
  | 'overwrite'
  /** Drop the local save and return what is stored. */
  | 'keep-theirs'
  /** Return `outcome: 'conflict'` and let the UI choose (default). */
  | 'ask'
  /** Merge, then save the result once. */
  | ((mine: DashboardLayout, theirs: DashboardLayout) => DashboardLayout);

export interface LayoutPersistenceOptions {
  /** Default 64 KB. */
  readonly maxBytes?: number;
  /** For adapters with revisions. Default `'ask'`. */
  readonly onConflict?: ConflictPolicy;
  /** Cancels every operation. */
  readonly signal?: AbortSignal;
  /** Epoch ms for the envelope's `savedAt`. Default `Date.now`. */
  readonly now?: () => number;
}

export interface LoadedLayout {
  /** Repaired against the definitions; null when nothing is stored. */
  readonly layout: DashboardLayout | null;
  readonly revision?: string;
  /** ISO time from the envelope; absent for a bare legacy layout. */
  readonly savedAt?: string;
}

export interface SavedLayout {
  /**
   * `saved`: stored (or merged, then stored). `kept-theirs`: the stored layout
   * won and `layout` is it. `conflict`: nothing was stored and `layout` is
   * the stored one; decide, then save again with `force: true`.
   */
  readonly outcome: 'saved' | 'kept-theirs' | 'conflict';
  /** What is now stored (or, for `conflict`, what is stored by someone else). */
  readonly layout: DashboardLayout;
  readonly revision?: string;
}

export interface SaveOptions {
  /** Skip conflict detection and overwrite. */
  readonly force?: boolean;
}

export interface LayoutPersistence {
  /** The adapter key for a scope, for example `dwt:sales:user-42:layout`. */
  keyFor(scope: StoreScope, part?: 'layout' | 'backup'): string;
  load(
    scope: StoreScope,
    definitions: readonly PageItem[],
    options?: NormalizeOptions
  ): Promise<StoreResult<LoadedLayout>>;
  save(
    scope: StoreScope,
    layout: DashboardLayout,
    options?: SaveOptions
  ): Promise<StoreResult<SavedLayout>>;
  loadBackup(scope: StoreScope): Promise<StoreResult<DashboardLayout | null>>;
  saveBackup(
    scope: StoreScope,
    layout: DashboardLayout
  ): Promise<StoreResult<null>>;
  /** Removes the layout and its backup. */
  reset(scope: StoreScope): Promise<StoreResult<null>>;
  /** Calls `onChange` when another tab or device changes the layout; needs `adapter.subscribe`. */
  watch(
    scope: StoreScope,
    definitions: readonly PageItem[],
    onChange: (loaded: LoadedLayout) => void,
    options?: NormalizeOptions
  ): () => void;
}

interface Envelope {
  readonly v: number;
  readonly savedAt: string;
  readonly layout: unknown;
}

function keyPart(text: string): string {
  return encodeURIComponent(text);
}

function readEnvelope(
  key: string,
  stored: StoredValue
): StoreResult<{ layout: DashboardLayout; savedAt?: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored.value);
  } catch (cause) {
    return failure(
      'corrupt',
      `The layout stored at "${key}" is not valid JSON: ${describeUnknownError(cause)}`
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return failure(
      'corrupt',
      `The layout stored at "${key}" is not an object.`
    );
  }
  const record = parsed as Record<string, unknown>;
  const version: unknown = record['v'];
  if (version === undefined) {
    // A bare layout saved by a consumer that called serializeLayout directly.
    return { ok: true, value: { layout: parseLayout(parsed) } };
  }
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return failure(
      'corrupt',
      `The layout stored at "${key}" has an invalid version ${JSON.stringify(version)}.`
    );
  }
  if (version > LAYOUT_ENVELOPE_VERSION) {
    return failure(
      'invalid',
      `The layout stored at "${key}" is version ${version}, newer than this toolkit reads (${LAYOUT_ENVELOPE_VERSION}). Update the package.`
    );
  }
  const envelope = record as unknown as Envelope;
  return {
    ok: true,
    value: {
      layout: parseLayout(envelope.layout),
      ...(typeof envelope.savedAt === 'string'
        ? { savedAt: envelope.savedAt }
        : {}),
    },
  };
}

interface PendingSave {
  layout: DashboardLayout;
  force: boolean;
  readonly waiters: ((result: StoreResult<SavedLayout>) => void)[];
}

/**
 * Persistence for layouts over any `StorageAdapter`: an envelope with a
 * version, tolerant reads repaired against today's definitions, a size limit,
 * revision tracking with a conflict policy, and saves serialized per key so
 * rapid edits never race (while one save is in flight, later ones collapse
 * into the newest).
 */
export function createLayoutPersistence(
  adapter: StorageAdapter,
  options: LayoutPersistenceOptions = {}
): LayoutPersistence {
  const maxBytes: number = options.maxBytes ?? DEFAULT_MAX_LAYOUT_BYTES;
  const policy: ConflictPolicy = options.onConflict ?? 'ask';
  const fallbackSignal: AbortSignal = new AbortController().signal;
  const signal: AbortSignal = options.signal ?? fallbackSignal;
  const now: () => number = options.now ?? Date.now;
  const revisions = new Map<string, string>();
  const lastWritten = new Map<string, string>();
  const inFlight = new Set<string>();
  const pending = new Map<string, PendingSave>();

  const keyFor = (
    scope: StoreScope,
    part: 'layout' | 'backup' = 'layout'
  ): string =>
    `dwt:${keyPart(scope.dashboardKey)}:${keyPart(scope.userKey ?? '_')}:${part}`;

  const checkScope = (scope: StoreScope): StoreResult<null> =>
    scope.dashboardKey.trim() === ''
      ? failure('invalid', 'The storage scope needs a non-empty dashboardKey.')
      : { ok: true, value: null };

  const encode = (
    layout: DashboardLayout,
    key: string
  ): StoreResult<string> => {
    const envelope: Envelope = {
      v: LAYOUT_ENVELOPE_VERSION,
      savedAt: new Date(now()).toISOString(),
      layout: JSON.parse(serializeLayout(layout)) as unknown,
    };
    const text: string = JSON.stringify(envelope);
    const size: number = utf8Length(text);
    if (size > maxBytes) {
      return failure(
        'invalid',
        `Could not save "${key}": the layout is ${size} bytes, over the ${maxBytes} byte limit.`
      );
    }
    return { ok: true, value: text };
  };

  const guarded = async <T>(
    key: string,
    action: string,
    run: () => Promise<StoreResult<T>>
  ): Promise<StoreResult<T>> => {
    try {
      return await run();
    } catch (cause) {
      return failure(
        'unavailable',
        `Could not ${action} "${key}": the adapter threw ${describeUnknownError(cause)}`
      );
    }
  };

  const readLayout = async (
    scope: StoreScope,
    part: 'layout' | 'backup'
  ): Promise<StoreResult<LoadedLayout>> => {
    const key: string = keyFor(scope, part);
    const result = await guarded(key, 'load', () =>
      adapter.get(key, { signal })
    );
    if (!result.ok) return result;
    if (result.value === null) {
      if (part === 'layout') revisions.delete(key);
      return { ok: true, value: { layout: null } };
    }
    const read = readEnvelope(key, result.value);
    if (!read.ok) return read;
    if (part === 'layout' && result.value.revision !== undefined) {
      revisions.set(key, result.value.revision);
    }
    return {
      ok: true,
      value: {
        layout: read.value.layout,
        ...(result.value.revision === undefined
          ? {}
          : { revision: result.value.revision }),
        ...(read.value.savedAt === undefined
          ? {}
          : { savedAt: read.value.savedAt }),
      },
    };
  };

  const repair = (
    loaded: LoadedLayout,
    definitions: readonly PageItem[],
    normalizeOptions: NormalizeOptions | undefined
  ): LoadedLayout =>
    loaded.layout === null
      ? loaded
      : {
          ...loaded,
          layout: normalizeLayout(definitions, loaded.layout, normalizeOptions),
        };

  const write = async (
    scope: StoreScope,
    layout: DashboardLayout,
    force: boolean
  ): Promise<StoreResult<SavedLayout>> => {
    const key: string = keyFor(scope);
    const text = encode(layout, key);
    if (!text.ok) return text;
    const known: string | undefined = revisions.get(key);
    lastWritten.set(key, text.value);
    const stored = await guarded(key, 'save', () =>
      adapter.set(key, text.value, {
        signal,
        ...(force || known === undefined ? {} : { ifRevision: known }),
      })
    );
    if (stored.ok) {
      if (stored.value.revision !== undefined) {
        revisions.set(key, stored.value.revision);
      }
      return {
        ok: true,
        value: {
          outcome: 'saved',
          layout,
          ...(stored.value.revision === undefined
            ? {}
            : { revision: stored.value.revision }),
        },
      };
    }
    if (stored.code !== 'conflict') return stored;

    const theirs = await readLayout(scope, 'layout');
    if (!theirs.ok) return theirs;
    const theirLayout: DashboardLayout = theirs.value.layout ?? layout;
    const theirRevision = theirs.value.revision;
    const asResult = (
      outcome: SavedLayout['outcome']
    ): StoreResult<SavedLayout> => ({
      ok: true,
      value: {
        outcome,
        layout: theirLayout,
        ...(theirRevision === undefined ? {} : { revision: theirRevision }),
      },
    });
    if (policy === 'overwrite') return write(scope, layout, true);
    if (policy === 'keep-theirs') return asResult('kept-theirs');
    if (policy === 'ask') return asResult('conflict');
    let merged: DashboardLayout;
    try {
      merged = policy(layout, theirLayout);
    } catch (cause) {
      return failure(
        'invalid',
        `Could not save "${key}": the conflict merge function threw ${describeUnknownError(cause)}`
      );
    }
    const second = await write(scope, merged, false);
    if (second.ok && second.value.outcome === 'saved') return second;
    return second.ok ? asResult('conflict') : second;
  };

  const drain = async (
    scope: StoreScope,
    key: string,
    first: PendingSave
  ): Promise<void> => {
    let job: PendingSave | undefined = first;
    inFlight.add(key);
    while (job !== undefined) {
      const current: PendingSave = job;
      pending.delete(key);
      const result: StoreResult<SavedLayout> = await write(
        scope,
        current.layout,
        current.force
      );
      for (const waiter of current.waiters) waiter(result);
      job = pending.get(key);
    }
    inFlight.delete(key);
  };

  return {
    keyFor,
    async load(scope, definitions, normalizeOptions) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const read = await readLayout(scope, 'layout');
      if (!read.ok) return read;
      return {
        ok: true,
        value: repair(read.value, definitions, normalizeOptions),
      };
    },
    save(scope, layout, saveOptions = {}) {
      const valid = checkScope(scope);
      if (!valid.ok) return Promise.resolve(valid);
      const key: string = keyFor(scope);
      const force: boolean = saveOptions.force === true;
      return new Promise<StoreResult<SavedLayout>>((resolve) => {
        const queued: PendingSave | undefined = pending.get(key);
        if (queued !== undefined) {
          // Newest wins: this layout replaces the one that hasn't started.
          queued.layout = layout;
          queued.force = queued.force || force;
          queued.waiters.push(resolve);
          return;
        }
        const job: PendingSave = { layout, force, waiters: [resolve] };
        if (inFlight.has(key)) {
          pending.set(key, job);
          return;
        }
        void drain(scope, key, job);
      });
    },
    async loadBackup(scope) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const read = await readLayout(scope, 'backup');
      return read.ok ? { ok: true, value: read.value.layout } : read;
    },
    async saveBackup(scope, layout) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const key: string = keyFor(scope, 'backup');
      const text = encode(layout, key);
      if (!text.ok) return text;
      const stored = await guarded(key, 'save', () =>
        adapter.set(key, text.value, { signal })
      );
      return stored.ok ? { ok: true, value: null } : stored;
    },
    async reset(scope) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const layoutKey: string = keyFor(scope);
      const backupKey: string = keyFor(scope, 'backup');
      if (adapter.remove === undefined) {
        return failure(
          'invalid',
          `Could not reset "${layoutKey}": the adapter has no remove method.`
        );
      }
      const remove = adapter.remove.bind(adapter);
      const first = await guarded(layoutKey, 'remove', () =>
        remove(layoutKey, { signal })
      );
      revisions.delete(layoutKey);
      if (!first.ok) return first;
      const second = await guarded(backupKey, 'remove', () =>
        remove(backupKey, { signal })
      );
      return second.ok ? { ok: true, value: null } : second;
    },
    watch(scope, definitions, onChange, normalizeOptions) {
      const key: string = keyFor(scope);
      const stop: (() => void) | undefined = adapter.subscribe?.(
        key,
        (stored) => {
          if (stored === null) {
            revisions.delete(key);
            onChange({ layout: null });
            return;
          }
          if (
            stored.value === lastWritten.get(key) ||
            (stored.revision !== undefined &&
              stored.revision === revisions.get(key))
          ) {
            return; // Our own save echoing back.
          }
          const read = readEnvelope(key, stored);
          if (!read.ok) return;
          onChange(
            repair(
              {
                layout: read.value.layout,
                ...(stored.revision === undefined
                  ? {}
                  : { revision: stored.revision }),
                ...(read.value.savedAt === undefined
                  ? {}
                  : { savedAt: read.value.savedAt }),
              },
              definitions,
              normalizeOptions
            )
          );
        }
      );
      return stop ?? (() => undefined);
    },
  };
}
