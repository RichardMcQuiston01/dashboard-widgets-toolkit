/**
 * Loads widgets one by one, after the first render, and reports each result
 * as it arrives. It is the logic behind the React `useWidgets` hook, kept
 * framework-agnostic and runtime-neutral so it can be tested without a DOM
 * and reused by other renderers. Like the rest of the core it never fetches
 * anything itself: providers do the work.
 *
 * Lifecycle: `createWidgetLoader` (nothing runs yet; every widget is
 * `loading`) then `load(key)` / `loadAll()` when you want data (immediately
 * after mount, or when a card scrolls into view), `refresh()` to reload, and
 * `dispose()` to cancel everything.
 */

import type { WidgetDefinition } from './definition.js';
import {
  cacheKeyFor,
  loadingWidgets,
  resolvePayload,
  resolveWidget,
  widgetsFor,
  type DashboardWidget,
  type ResolveOptions,
  type WidgetContext,
  type WidgetProviders,
} from './resolve.js';

export interface WidgetLoaderOptions<
  C extends WidgetContext,
> extends ResolveOptions {
  readonly definitions: readonly WidgetDefinition[];
  readonly providers: WidgetProviders<C>;
  readonly context: C;
}

export interface RefreshOptions {
  /** Leave widgets that are still loading alone instead of restarting them. */
  readonly skipInFlight?: boolean;
}

export interface WidgetLoader {
  /** The current widgets in display order. A new array after every change. */
  getSnapshot(): readonly DashboardWidget[];
  /** Calls `listener` after every change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Starts loading one widget. Does nothing if it already started. */
  load(key: string): void;
  /** Starts loading every widget that has not started yet. */
  loadAll(): void;
  /**
   * Reloads started widgets (or just `key`). The previous call is aborted and
   * its result ignored. Visible data stays until the new data arrives; an
   * `error` widget goes back to `loading`. With `skipInFlight`, widgets that
   * are still loading are left alone (what polling wants: a provider slower
   * than the interval would otherwise be restarted forever and never finish).
   */
  refresh(key?: string, options?: RefreshOptions): void;
  /** Aborts everything in flight and ignores any later result. */
  dispose(): void;
}

export function createWidgetLoader<C extends WidgetContext>(
  options: WidgetLoaderOptions<C>
): WidgetLoader {
  const { definitions, providers, context, ...resolveOptions } = options;
  const visible: WidgetDefinition[] = widgetsFor(definitions, context.roles);
  let snapshot: readonly DashboardWidget[] = loadingWidgets(visible);

  const listeners = new Set<() => void>();
  const started = new Set<string>();
  const generations = new Map<string, number>();
  const inFlight = new Map<string, AbortController>();
  let disposed = false;

  function publish(next: readonly DashboardWidget[]): void {
    snapshot = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One failing subscriber must not stop the others or the load.
      }
    }
  }

  function replace(key: string, widget: DashboardWidget): void {
    publish(
      snapshot.map((current) =>
        current.definition.key === key ? widget : current
      )
    );
  }

  function abortAll(reason: unknown): void {
    for (const controller of inFlight.values()) controller.abort(reason);
    inFlight.clear();
  }

  resolveOptions.signal?.addEventListener(
    'abort',
    () => abortAll(resolveOptions.signal?.reason),
    { once: true }
  );

  async function run(
    definition: WidgetDefinition,
    readCache: boolean
  ): Promise<void> {
    const key: string = definition.key;
    const generation: number = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    inFlight.get(key)?.abort(new Error('Superseded by a newer load.'));
    const controller = new AbortController();
    inFlight.set(key, controller);
    const isCurrent = (): boolean =>
      !disposed && generations.get(key) === generation;

    if (readCache && resolveOptions.cache !== undefined) {
      try {
        const entry = await resolveOptions.cache.get(
          cacheKeyFor(definition, resolveOptions)
        );
        if (entry !== undefined && isCurrent()) {
          const cached = resolvePayload(
            definition,
            entry.payload,
            resolveOptions
          );
          if (cached.status === 'ok') {
            replace(key, { ...cached, updatedAt: entry.storedAt, stale: true });
          }
        }
      } catch {
        // An unreadable cache is just a miss.
      }
    }
    if (!isCurrent()) return;

    const provider = Object.prototype.hasOwnProperty.call(providers, key)
      ? providers[key]
      : undefined;
    const result = await resolveWidget(definition, provider, context, {
      ...resolveOptions,
      signal: controller.signal,
    });
    if (!isCurrent()) return;
    inFlight.delete(key);
    replace(key, result);
  }

  function start(definition: WidgetDefinition, readCache: boolean): void {
    started.add(definition.key);
    void run(definition, readCache);
  }

  function definitionFor(key: string): WidgetDefinition | undefined {
    return visible.find((definition) => definition.key === key);
  }

  function load(key: string): void {
    if (disposed || started.has(key)) return;
    const definition: WidgetDefinition | undefined = definitionFor(key);
    if (definition !== undefined) start(definition, true);
  }

  function loadAll(): void {
    for (const definition of visible) load(definition.key);
  }

  function refresh(key?: string, refreshOptions?: RefreshOptions): void {
    if (disposed) return;
    const keys: string[] = key === undefined ? [...started] : [key];
    for (const target of keys) {
      const definition: WidgetDefinition | undefined = definitionFor(target);
      if (definition === undefined) continue;
      if (refreshOptions?.skipInFlight === true && inFlight.has(target)) {
        continue;
      }
      const current: DashboardWidget | undefined = snapshot.find(
        (widget) => widget.definition.key === target
      );
      if (current?.status === 'error') {
        replace(target, { definition, status: 'loading' });
      }
      start(definition, false);
    }
  }

  function dispose(): void {
    disposed = true;
    abortAll(new Error('The widget loader was disposed.'));
    listeners.clear();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getSnapshot: () => snapshot,
    subscribe,
    load,
    loadAll,
    refresh,
    dispose,
  };
}
