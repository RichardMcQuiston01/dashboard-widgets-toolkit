import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from 'vue';

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
  /** From `createLayoutPersistence`. */
  readonly persistence: LayoutPersistence;
  /** Which dashboard and viewer. Changing its key loads the other layout. */
  readonly scope: MaybeRefOrGetter<StoreScope>;
  readonly definitions: MaybeRefOrGetter<readonly PageItem[]>;
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
  readonly layout: Readonly<ShallowRef<DashboardLayout>>;
  /** Pass to `Dashboard` as `onLayoutChange`. Saves after `saveDelayMs`. */
  readonly setLayout: (layout: DashboardLayout) => void;
  /** The pre-edit snapshot, or null. */
  readonly backup: Readonly<ShallowRef<DashboardLayout | null>>;
  /**
   * Stores a snapshot at once (not debounced). Pass null to clear it, in memory
   * and in storage. Pass this to `Dashboard` as `onBackup`.
   */
  readonly setBackup: (layout: DashboardLayout | null) => void;
  /** The stored active page key, or undefined until one is loaded. */
  readonly activePage: Readonly<Ref<string | undefined>>;
  /** Remembers the active page; pass to `Dashboard` as `onActivePageChange`. */
  readonly setActivePage: (pageKey: string) => void;
  readonly status: Readonly<Ref<StoredLayoutStatus>>;
  /** The latest failure, specific enough to log or show; null when none. */
  readonly error: Readonly<Ref<string | null>>;
  /** Set while `status` is `'conflict'`. */
  readonly conflict: Readonly<ShallowRef<StoredLayoutConflict | null>>;
  /** Settle a conflict: keep this viewer's layout (overwrite) or take the stored one. */
  readonly resolveConflict: (choice: 'mine' | 'theirs') => void;
  /**
   * A change made in another tab or device while this one had unsaved edits.
   * Without unsaved edits it is applied automatically and this stays null.
   */
  readonly remoteLayout: Readonly<ShallowRef<DashboardLayout | null>>;
  /** Use or ignore `remoteLayout`. */
  readonly resolveRemote: (choice: 'use' | 'ignore') => void;
}

/**
 * Joins a `LayoutPersistence` to `Dashboard`. The dashboard never waits on
 * storage: it shows `initialLayout` or `defaultLayout` while loading, and a
 * failed load or save keeps the in-memory layout working and reports `error`.
 * Saves are debounced and flushed when the page is hidden. Nothing loads
 * during server rendering, so a server render shows the initial or default
 * layout.
 */
export function useStoredLayout(
  options: UseStoredLayoutOptions
): UseStoredLayoutResult {
  const {
    persistence,
    defaultLayout,
    saveDelayMs = 500,
    initialLayout,
    normalizeOptions,
  } = options;
  const scope = (): StoreScope => toValue(options.scope);
  const definitions = (): readonly PageItem[] => toValue(options.definitions);

  const layout: ShallowRef<DashboardLayout> = shallowRef(
    initialLayout ?? defaultLayout
  );
  const backup: ShallowRef<DashboardLayout | null> = shallowRef(null);
  const activePage: Ref<string | undefined> = ref(undefined);
  const status: Ref<StoredLayoutStatus> = ref('loading');
  const error: Ref<string | null> = ref(null);
  const conflict: ShallowRef<StoredLayoutConflict | null> = shallowRef(null);
  const remoteLayout: ShallowRef<DashboardLayout | null> = shallowRef(null);

  let latest: DashboardLayout = layout.value;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** True from a local change until its save finishes. */
  let dirty = false;
  /** True once the viewer picked a page, so a late load doesn't undo it. */
  let pageChosen = false;
  let stopWatching: (() => void) | undefined;

  function apply(next: DashboardLayout): void {
    latest = next;
    layout.value = next;
  }

  function finishSave(
    result: StoreResult<SavedLayout>,
    mine: DashboardLayout
  ): void {
    if (!result.ok) {
      error.value = result.error;
      status.value = 'error';
      return;
    }
    const saved: SavedLayout = result.value;
    if (saved.outcome === 'saved') {
      // Edits made while this save ran are still pending: stay dirty.
      dirty = latest !== mine;
      error.value = null;
      status.value = dirty ? 'saving' : 'ready';
      return;
    }
    if (saved.outcome === 'kept-theirs') {
      dirty = false;
      apply(saved.layout);
      error.value = null;
      status.value = 'ready';
      return;
    }
    conflict.value = { mine, theirs: saved.layout };
    status.value = 'conflict';
  }

  function flush(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!dirty) return;
    const mine: DashboardLayout = latest;
    status.value = 'saving';
    void persistence
      .save(scope(), mine)
      .then((result) => finishSave(result, mine));
  }

  // Load when the scope changes. A change made while loading wins.
  let generation = 0;
  function load(): void {
    const current: number = ++generation;
    status.value = 'loading';
    conflict.value = null;
    remoteLayout.value = null;
    pageChosen = false;
    activePage.value = undefined;
    const target: StoreScope = scope();
    void persistence
      .load(target, definitions(), normalizeOptions)
      .then((result) => {
        if (current !== generation) return;
        if (!result.ok) {
          error.value = result.error;
          status.value = 'error';
          return;
        }
        error.value = null;
        if (!dirty && result.value.layout !== null) apply(result.value.layout);
        status.value = dirty ? 'saving' : 'ready';
      });
    void persistence.loadBackup(target).then((result) => {
      if (current === generation && result.ok) backup.value = result.value;
    });
    void persistence.loadActivePage(target).then((result) => {
      if (current !== generation || pageChosen) return;
      // An unreadable value just means the first page; the layout load
      // reports real storage failures.
      if (result.ok && result.value !== null) activePage.value = result.value;
    });
    // Another tab or device.
    stopWatching?.();
    stopWatching = persistence.watch(
      target,
      definitions(),
      (loaded: LoadedLayout) => {
        if (loaded.layout === null) return;
        if (dirty) {
          remoteLayout.value = loaded.layout;
          return;
        }
        apply(loaded.layout);
      },
      normalizeOptions
    );
  }

  const onHide = (): void => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState !== 'hidden'
    ) {
      return;
    }
    flush();
  };

  // Nothing runs on the server: effects start once the component mounts.
  onMounted(() => {
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', onHide);
    }
    watch(() => [persistence.keyFor(scope()), definitions()] as const, load);
  });

  // Flush best-effort when the page is hidden or the component goes away.
  onBeforeUnmount(() => {
    generation++;
    stopWatching?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    }
    flush();
  });

  function setLayout(next: DashboardLayout): void {
    apply(next);
    dirty = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, Math.max(0, saveDelayMs));
  }

  function setBackup(next: DashboardLayout | null): void {
    backup.value = next;
    const request =
      next === null
        ? persistence.clearBackup(scope())
        : persistence.saveBackup(scope(), next);
    void request.then((result) => {
      if (!result.ok) error.value = result.error;
    });
  }

  function setActivePage(pageKey: string): void {
    pageChosen = true;
    activePage.value = pageKey;
    void persistence.saveActivePage(scope(), pageKey).then((result) => {
      if (!result.ok) error.value = result.error;
    });
  }

  function resolveConflict(choice: 'mine' | 'theirs'): void {
    const pending: StoredLayoutConflict | null = conflict.value;
    if (pending === null) return;
    conflict.value = null;
    if (choice === 'theirs') {
      dirty = false;
      apply(pending.theirs);
      status.value = 'ready';
      return;
    }
    status.value = 'saving';
    void persistence
      .save(scope(), pending.mine, { force: true })
      .then((result) => finishSave(result, pending.mine));
  }

  function resolveRemote(choice: 'use' | 'ignore'): void {
    const remote: DashboardLayout | null = remoteLayout.value;
    remoteLayout.value = null;
    if (choice === 'use' && remote !== null) {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      dirty = false;
      apply(remote);
    }
  }

  return {
    layout,
    setLayout,
    backup,
    setBackup,
    activePage,
    setActivePage,
    status,
    error,
    conflict,
    resolveConflict,
    remoteLayout,
    resolveRemote,
  };
}
