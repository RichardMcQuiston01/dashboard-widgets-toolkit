import { useCallback, useEffect, useRef, useState } from 'react';

import type { DashboardLayout } from '../core/layout.js';
import type { NormalizeOptions, PageItem } from '../core/pages.js';
import type {
  LayoutPersistence,
  LoadedLayout,
  SavedLayout,
  StoreResult,
  StoreScope,
} from '../core/storage.js';

export type StoredLayoutStatus =
  'loading' | 'ready' | 'saving' | 'error' | 'conflict';

export interface UseStoredLayoutOptions {
  /** From `createLayoutPersistence`. Keep it referentially stable. */
  readonly persistence: LayoutPersistence;
  /** Which dashboard and viewer. Changing its key loads the other layout. */
  readonly scope: StoreScope;
  /** Keep stable (module constant or `useMemo`). */
  readonly definitions: readonly PageItem[];
  /** The organization default: shown until loaded and when nothing is stored. */
  readonly defaultLayout: DashboardLayout;
  /** Wait this long after the last change before saving. Default 500 ms. */
  readonly saveDelayMs?: number;
  /** From the server render, to avoid a flash; used instead of `defaultLayout` first. */
  readonly initialLayout?: DashboardLayout;
  readonly normalizeOptions?: NormalizeOptions;
}

export interface StoredLayoutConflict {
  /** The layout this viewer was saving. */
  readonly mine: DashboardLayout;
  /** The layout stored by someone else. */
  readonly theirs: DashboardLayout;
}

export interface UseStoredLayoutResult {
  /** Pass to `Dashboard` as `layout`. */
  readonly layout: DashboardLayout;
  /** Pass to `Dashboard` as `onLayoutChange`. Saves after `saveDelayMs`. */
  readonly setLayout: (layout: DashboardLayout) => void;
  /** The pre-edit snapshot, or null. */
  readonly backup: DashboardLayout | null;
  /** Stores a snapshot at once (not debounced). Pass null to clear it in memory only. */
  readonly setBackup: (layout: DashboardLayout | null) => void;
  readonly status: StoredLayoutStatus;
  /** The latest failure, specific enough to log or show; null when none. */
  readonly error: string | null;
  /** Set while `status` is `'conflict'`. */
  readonly conflict: StoredLayoutConflict | null;
  /** Settle a conflict: keep this viewer's layout (overwrite) or take the stored one. */
  readonly resolveConflict: (choice: 'mine' | 'theirs') => void;
  /**
   * A change made in another tab or device while this one had unsaved edits.
   * Without unsaved edits it is applied automatically and this stays null.
   */
  readonly remoteLayout: DashboardLayout | null;
  /** Use or ignore `remoteLayout`. */
  readonly resolveRemote: (choice: 'use' | 'ignore') => void;
}

/**
 * Joins a `LayoutPersistence` to `Dashboard`. The dashboard never waits on
 * storage: it shows `initialLayout` or `defaultLayout` while loading, and a
 * failed load or save keeps the in-memory layout working and reports `error`.
 * Saves are debounced and flushed when the page is hidden. Effects don't run
 * on the server, so a server render shows the initial or default layout.
 */
export function useStoredLayout(
  options: UseStoredLayoutOptions
): UseStoredLayoutResult {
  const {
    persistence,
    scope,
    definitions,
    defaultLayout,
    saveDelayMs = 500,
    initialLayout,
    normalizeOptions,
  } = options;
  const scopeKey: string = persistence.keyFor(scope);

  const [layout, setLayoutState] = useState<DashboardLayout>(
    initialLayout ?? defaultLayout
  );
  const [backup, setBackupState] = useState<DashboardLayout | null>(null);
  const [status, setStatus] = useState<StoredLayoutStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<StoredLayoutConflict | null>(null);
  const [remoteLayout, setRemoteLayout] = useState<DashboardLayout | null>(
    null
  );

  const latest = useRef<DashboardLayout>(layout);
  const scopeRef = useRef<StoreScope>(scope);
  scopeRef.current = scope;
  const normalizeRef = useRef<NormalizeOptions | undefined>(normalizeOptions);
  normalizeRef.current = normalizeOptions;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** True from a local change until its save finishes. */
  const dirty = useRef<boolean>(false);

  const apply = useCallback((next: DashboardLayout): void => {
    latest.current = next;
    setLayoutState(next);
  }, []);

  const finishSave = useCallback(
    (result: StoreResult<SavedLayout>, mine: DashboardLayout): void => {
      if (!result.ok) {
        setError(result.error);
        setStatus('error');
        return;
      }
      const saved: SavedLayout = result.value;
      if (saved.outcome === 'saved') {
        // Edits made while this save ran are still pending: stay dirty.
        dirty.current = latest.current !== mine;
        setError(null);
        setStatus(dirty.current ? 'saving' : 'ready');
        return;
      }
      if (saved.outcome === 'kept-theirs') {
        dirty.current = false;
        apply(saved.layout);
        setError(null);
        setStatus('ready');
        return;
      }
      setConflict({ mine, theirs: saved.layout });
      setStatus('conflict');
    },
    [apply]
  );

  const flush = useCallback((): void => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (!dirty.current) return;
    const mine: DashboardLayout = latest.current;
    setStatus('saving');
    void persistence
      .save(scopeRef.current, mine)
      .then((result) => finishSave(result, mine));
  }, [persistence, finishSave]);

  // Load when the scope changes. A change made while loading wins.
  useEffect(() => {
    let current = true;
    setStatus('loading');
    setConflict(null);
    setRemoteLayout(null);
    void persistence
      .load(scopeRef.current, definitions, normalizeRef.current)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setError(result.error);
          setStatus('error');
          return;
        }
        setError(null);
        if (!dirty.current && result.value.layout !== null) {
          apply(result.value.layout);
        }
        setStatus(dirty.current ? 'saving' : 'ready');
      });
    void persistence.loadBackup(scopeRef.current).then((result) => {
      if (current && result.ok) setBackupState(result.value);
    });
    return () => {
      current = false;
    };
    // scopeKey stands for the scope's contents.
  }, [persistence, scopeKey, definitions, apply]);

  // Another tab or device.
  useEffect(() => {
    return persistence.watch(
      scopeRef.current,
      definitions,
      (loaded: LoadedLayout) => {
        if (loaded.layout === null) return;
        if (dirty.current) {
          setRemoteLayout(loaded.layout);
          return;
        }
        apply(loaded.layout);
      },
      normalizeRef.current
    );
  }, [persistence, scopeKey, definitions, apply]);

  // Flush best-effort when the page is hidden or the hook goes away.
  useEffect(() => {
    const onHide = (): void => {
      if (
        typeof document === 'undefined' ||
        document.visibilityState !== 'hidden'
      ) {
        return;
      }
      flush();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', onHide);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', onHide);
      }
      flush();
    };
  }, [flush]);

  const setLayout = useCallback(
    (next: DashboardLayout): void => {
      apply(next);
      dirty.current = true;
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(flush, Math.max(0, saveDelayMs));
    },
    [apply, flush, saveDelayMs]
  );

  const setBackup = useCallback(
    (next: DashboardLayout | null): void => {
      setBackupState(next);
      if (next === null) return;
      void persistence.saveBackup(scopeRef.current, next).then((result) => {
        if (!result.ok) setError(result.error);
      });
    },
    [persistence]
  );

  const resolveConflict = useCallback(
    (choice: 'mine' | 'theirs'): void => {
      const pending: StoredLayoutConflict | null = conflict;
      if (pending === null) return;
      setConflict(null);
      if (choice === 'theirs') {
        dirty.current = false;
        apply(pending.theirs);
        setStatus('ready');
        return;
      }
      setStatus('saving');
      void persistence
        .save(scopeRef.current, pending.mine, { force: true })
        .then((result) => finishSave(result, pending.mine));
    },
    [conflict, persistence, apply, finishSave]
  );

  const resolveRemote = useCallback(
    (choice: 'use' | 'ignore'): void => {
      const remote: DashboardLayout | null = remoteLayout;
      setRemoteLayout(null);
      if (choice === 'use' && remote !== null) {
        if (timer.current !== undefined) {
          clearTimeout(timer.current);
          timer.current = undefined;
        }
        dirty.current = false;
        apply(remote);
      }
    },
    [remoteLayout, apply]
  );

  return {
    layout,
    setLayout,
    backup,
    setBackup,
    status,
    error,
    conflict,
    resolveConflict,
    remoteLayout,
    resolveRemote,
  };
}
