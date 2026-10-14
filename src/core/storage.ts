/**
 * Storage adapters for layouts. The adapter contract and the wrappers
 * (`memoryAdapter`, `withPrefix`, `withFallback`, ...) live in
 * `@richardmcquiston01/storage-adapters` and are re-exported here unchanged.
 * `createLayoutPersistence` adds the layout parts on top of that package's
 * `createPersistence`: scoped keys, a backup, the active page, and repair
 * against today's definitions. Nothing here does I/O: no timers, DOM, `fetch`
 * or storage globals. See docs/design/storage-adapters.md.
 */

import {
  createPersistence,
  type ConflictPolicy as ConflictPolicyOf,
  type Persistence,
  type StorageAdapter,
  type StoreErrorCode,
  type StoreResult,
} from '@richardmcquiston01/storage-adapters';

import {
  parseLayout,
  serializeLayout,
  type DashboardLayout,
} from './layout.js';
import { normalizeLayout, type NormalizeOptions } from './pages.js';
import type { PageItem } from './pages.js';
import { describeUnknownError } from './result.js';

export {
  memoryAdapter,
  readOnly,
  utf8Length,
  withEncoding,
  withFallback,
  withLogging,
  withPrefix,
  withReadCache,
  withRetry,
} from '@richardmcquiston01/storage-adapters';
export type {
  EncodingOptions,
  RetryOptions,
  StorageAdapter,
  StorageLogEvent,
  StoreErrorCode,
  StoreResult,
  StoredValue,
} from '@richardmcquiston01/storage-adapters';

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

/**
 * What to do when another device saved the layout first: `'overwrite'`,
 * `'keep-theirs'`, `'ask'` (default) or a merge function.
 */
export type ConflictPolicy = ConflictPolicyOf<DashboardLayout>;

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

/** Which of a scope's stored values a key is for. */
export type StorePart = 'layout' | 'backup' | 'page';

/** The longest page key `saveActivePage` stores. */
export const MAX_ACTIVE_PAGE_LENGTH = 200;

export interface LayoutPersistence {
  /** The adapter key for a scope, for example `dwt:sales:user-42:layout`. */
  keyFor(scope: StoreScope, part?: StorePart): string;
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
  /** Removes the backup only (an edit session ended). A missing backup is fine. */
  clearBackup(scope: StoreScope): Promise<StoreResult<null>>;
  /** The stored active page key, or null when none is stored or it is unreadable. */
  loadActivePage(scope: StoreScope): Promise<StoreResult<string | null>>;
  /** Stores the active page key under its own key, so it never conflicts with the layout. */
  saveActivePage(
    scope: StoreScope,
    pageKey: string
  ): Promise<StoreResult<null>>;
  /** Removes the layout, its backup and the stored active page. */
  reset(scope: StoreScope): Promise<StoreResult<null>>;
  /** Calls `onChange` when another tab or device changes the layout; needs `adapter.subscribe`. */
  watch(
    scope: StoreScope,
    definitions: readonly PageItem[],
    onChange: (loaded: LoadedLayout) => void,
    options?: NormalizeOptions
  ): () => void;
}

function keyPart(text: string): string {
  return encodeURIComponent(text);
}

/**
 * Persistence for layouts over any `StorageAdapter`: an envelope with a
 * version, tolerant reads repaired against today's definitions, a size limit,
 * revision tracking with a conflict policy, and saves serialized per key so
 * rapid edits never race (while one save is in flight, later ones collapse
 * into the newest). The envelope, conflict handling and queueing come from
 * `createPersistence`; this adds the keys, the backup and the active page.
 */
export function createLayoutPersistence(
  adapter: StorageAdapter,
  options: LayoutPersistenceOptions = {}
): LayoutPersistence {
  const signal: AbortSignal = options.signal ?? new AbortController().signal;
  const persistence: Persistence<DashboardLayout> =
    createPersistence<DashboardLayout>(adapter, {
      parse: parseLayout,
      serialize: (layout) => JSON.parse(serializeLayout(layout)) as unknown,
      version: LAYOUT_ENVELOPE_VERSION,
      field: 'layout',
      label: 'layout',
      maxBytes: options.maxBytes ?? DEFAULT_MAX_LAYOUT_BYTES,
      onConflict: options.onConflict ?? 'ask',
      signal,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const keyFor = (scope: StoreScope, part: StorePart = 'layout'): string =>
    `dwt:${keyPart(scope.dashboardKey)}:${keyPart(scope.userKey ?? '_')}:${part}`;

  const checkScope = (scope: StoreScope): StoreResult<null> =>
    scope.dashboardKey.trim() === ''
      ? failure('invalid', 'The storage scope needs a non-empty dashboardKey.')
      : { ok: true, value: null };

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

  const repair = (
    loaded: {
      readonly value: DashboardLayout | null;
      readonly revision?: string;
      readonly savedAt?: string;
    },
    definitions: readonly PageItem[],
    normalizeOptions: NormalizeOptions | undefined
  ): LoadedLayout => ({
    layout:
      loaded.value === null
        ? null
        : normalizeLayout(definitions, loaded.value, normalizeOptions),
    ...(loaded.revision === undefined ? {} : { revision: loaded.revision }),
    ...(loaded.savedAt === undefined ? {} : { savedAt: loaded.savedAt }),
  });

  return {
    keyFor,
    async load(scope, definitions, normalizeOptions) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const read = await persistence.load(keyFor(scope));
      if (!read.ok) return read;
      return {
        ok: true,
        value: repair(read.value, definitions, normalizeOptions),
      };
    },
    async save(scope, layout, saveOptions = {}) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const saved = await persistence.save(keyFor(scope), layout, {
        force: saveOptions.force === true,
      });
      if (!saved.ok) return saved;
      return {
        ok: true,
        value: {
          outcome: saved.value.outcome,
          layout: saved.value.value,
          ...(saved.value.revision === undefined
            ? {}
            : { revision: saved.value.revision }),
        },
      };
    },
    async loadBackup(scope) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const read = await persistence.load(keyFor(scope, 'backup'), {
        track: false,
      });
      return read.ok ? { ok: true, value: read.value.value } : read;
    },
    async saveBackup(scope, layout) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const saved = await persistence.save(keyFor(scope, 'backup'), layout, {
        track: false,
      });
      return saved.ok ? { ok: true, value: null } : saved;
    },
    async clearBackup(scope) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      return persistence.remove(keyFor(scope, 'backup'));
    },
    async loadActivePage(scope) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const key: string = keyFor(scope, 'page');
      const result = await guarded(key, 'load', () =>
        adapter.get(key, { signal })
      );
      if (!result.ok) return result;
      if (result.value === null) return { ok: true, value: null };
      try {
        const parsed: unknown = JSON.parse(result.value.value);
        const page: unknown =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)['page']
            : undefined;
        if (
          typeof page === 'string' &&
          page !== '' &&
          page.length <= MAX_ACTIVE_PAGE_LENGTH
        ) {
          return { ok: true, value: page };
        }
      } catch {
        // Falls through to the message below.
      }
      return failure(
        'corrupt',
        `The active page stored at "${key}" is not a page key, so the first page is used.`
      );
    },
    async saveActivePage(scope, pageKey) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const key: string = keyFor(scope, 'page');
      if (pageKey === '' || pageKey.length > MAX_ACTIVE_PAGE_LENGTH) {
        return failure(
          'invalid',
          `Could not save "${key}": the page key must be 1 to ${MAX_ACTIVE_PAGE_LENGTH} characters, not ${pageKey.length}.`
        );
      }
      const text: string = JSON.stringify({
        v: LAYOUT_ENVELOPE_VERSION,
        page: pageKey,
      });
      const stored = await guarded(key, 'save', () =>
        adapter.set(key, text, { signal })
      );
      return stored.ok ? { ok: true, value: null } : stored;
    },
    async reset(scope) {
      const valid = checkScope(scope);
      if (!valid.ok) return valid;
      const layoutKey: string = keyFor(scope);
      if (adapter.remove === undefined) {
        return failure(
          'invalid',
          `Could not reset "${layoutKey}": the adapter has no remove method.`
        );
      }
      for (const key of [
        layoutKey,
        keyFor(scope, 'backup'),
        keyFor(scope, 'page'),
      ]) {
        const removed = await persistence.remove(key);
        if (!removed.ok) return removed;
      }
      return { ok: true, value: null };
    },
    watch(scope, definitions, onChange, normalizeOptions) {
      return persistence.watch(keyFor(scope), (loaded) => {
        onChange(repair(loaded, definitions, normalizeOptions));
      });
    },
  };
}
