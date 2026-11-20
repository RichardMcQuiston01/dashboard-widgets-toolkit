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

import { providerKeyOf, type WidgetDefinition } from './definition.js';
import {
  optionsCacheSuffix,
  sameOptionValues,
  type OptionValues,
} from './options.js';
import type { WidgetPayload } from './payload.js';
import { describeUnknownError } from './result.js';
import type { StreamStatus, WidgetStream, WidgetStreams } from './stream.js';
import { loadViewKey } from './views.js';
import {
  cacheKeyFor,
  filterValuesOf,
  finalizeWidget,
  loadingWidgets,
  optionValuesFor,
  resolvePayload,
  resolveWidgetUnapplied,
  widgetsFor,
  type DashboardWidget,
  type ResolveOptions,
  type ResolvedWidget,
  type WidgetContext,
  type WidgetProviders,
} from './resolve.js';

export interface WidgetLoaderOptions<
  C extends WidgetContext,
> extends ResolveOptions {
  readonly definitions: readonly WidgetDefinition[];
  readonly providers: WidgetProviders<C>;
  readonly context: C;
  /**
   * Live feeds by widget key. A key with a stream never calls its provider.
   * `timeoutMs` and `cache` writes do not apply to streams.
   */
  readonly streams?: WidgetStreams<C>;
  /**
   * Shows at most one emitted payload per this many ms per widget, keeping the
   * newest: a feed that emits 50 times a second renders a few times a second.
   * The first emit after a quiet spell shows at once. Default 0 (every emit).
   */
  readonly minIntervalMs?: number;
  /** Called when a stream reports its status, and with `closed` when it stops. */
  readonly onStreamStatus?: (key: string, status: StreamStatus) => void;
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
   * its result ignored. Visible data stays (marked `stale`) until the new data
   * arrives, and if the reload fails it stays for good with `refreshError` set,
   * so a flaky provider never blanks a card that has data. An `error` widget
   * goes back to `loading`. With `skipInFlight`, widgets that
   * are still loading are left alone (what polling wants: a provider slower
   * than the interval would otherwise be restarted forever and never finish).
   */
  refresh(key?: string, options?: RefreshOptions): void;
  /**
   * Sets the values chosen for a widget's options (all of them: keys left out
   * go back to their defaults). A choice only the toolkit applies (`sort` or
   * `columns` with `apply: 'client'`) re-derives the payload it already has.
   * A choice your provider sees reloads that widget alone: what is shown stays
   * (marked `stale`) until the new data arrives, and an earlier answer for the
   * same choices comes back from the cache. Does nothing when the resolved
   * values don't change.
   */
  setOptions(key: string, chosen: Readonly<Record<string, unknown>>): void;
  /**
   * Sets the values chosen for the dashboard's filters (all of them: keys left
   * out go back to their defaults). A widget that uses a filter whose resolved
   * value changed reloads: what is shown stays (marked `stale`) until the new
   * data arrives, and an earlier answer for the same choices comes back from
   * the cache. Widgets that don't use the changed filters keep their data and
   * are not asked again, and widgets that haven't started yet simply load with
   * the new values. Does nothing when the resolved values don't change.
   */
  setFilterValues(values: Readonly<Record<string, unknown>>): void;
  /**
   * Sets the view a widget shows (`undefined` or an empty string: its
   * `defaultView`). Only a view the provider supplies loads anything: the
   * provider is called with that view, the card shows loading until it
   * arrives, and an earlier answer for the same view comes back from the
   * cache. Switching among the base and converted views reloads nothing.
   */
  setView(key: string, view: string | undefined): void;
  /**
   * Replaces the set of widgets without starting over. A widget whose key is
   * still present keeps its data, its state and any load in flight (it only
   * gets the new definition object); a new key appears as `loading` and loads
   * when you call `load` or `loadAll`; a removed key is aborted and dropped.
   * The snapshot follows the new order. Call `refresh(key)` if a kept
   * widget's definition changed in a way its data depends on.
   */
  setDefinitions(definitions: readonly WidgetDefinition[]): void;
  /**
   * Lets go of what the widgets in `keys` hold: a load in flight is aborted and
   * its result ignored, the payload is dropped, and the card goes back to
   * `loading`, as if it had never started (its option and view choices are
   * kept). It loads again the next time `load(key)` is called, from the cache
   * first when there is one. For a long-lived paged dashboard that wants to drop
   * the payloads of pages the viewer left far behind (see `farPageWidgetKeys`).
   * Keys that are unknown or never started are ignored.
   */
  release(keys: readonly string[]): void;
  /**
   * Queues `keys` to load once nothing else is loading: what a paged dashboard
   * does for the pages next to the one in view (see `nearPageWidgetKeys`), so
   * the visible cards are never held up. Each call replaces the earlier queue,
   * keys that already started are skipped, and a key whose page the viewer
   * left in the meantime is simply dropped by the next call. Starts at once
   * when nothing is loading. Unknown keys are ignored.
   */
  prefetch(keys: readonly string[]): void;
  /** Aborts everything in flight and ignores any later result. */
  dispose(): void;
}

export function createWidgetLoader<C extends WidgetContext>(
  options: WidgetLoaderOptions<C>
): WidgetLoader {
  const {
    definitions,
    providers,
    context,
    streams = {},
    minIntervalMs = 0,
    onStreamStatus,
    ...baseOptions
  } = options;
  // What was chosen per widget; `setOptions` changes it.
  const chosen = new Map<string, Readonly<Record<string, unknown>>>(
    Object.entries(baseOptions.optionValues ?? {}).flatMap(([key, values]) =>
      values === undefined ? [] : [[key, values] as const]
    )
  );
  // The view chosen per widget; `setView` changes it.
  const chosenViews = new Map<string, string>(
    Object.entries(baseOptions.viewValues ?? {}).flatMap(([key, view]) =>
      view === undefined ? [] : [[key, view] as const]
    )
  );
  // The dashboard filter values chosen; `setFilterValues` changes them.
  let chosenFilters: Readonly<Record<string, unknown>> = {
    ...(baseOptions.filterValues ?? {}),
  };
  const resolveOptions: ResolveOptions = baseOptions;
  /** The resolve options as they are right now, with the current choices. */
  function currentOptions(): ResolveOptions {
    return {
      ...resolveOptions,
      optionValues: Object.fromEntries(chosen),
      viewValues: Object.fromEntries(chosenViews),
      filterValues: chosenFilters,
    };
  }
  // The payload as the provider returned it, before client-side options.
  const unapplied = new Map<string, ResolvedWidget>();
  let visible: WidgetDefinition[] = widgetsFor(definitions, context.roles);
  let snapshot: readonly DashboardWidget[] = loadingWidgets(visible);

  const listeners = new Set<() => void>();
  const started = new Set<string>();
  const generations = new Map<string, number>();
  const inFlight = new Map<string, AbortController>();
  // Running streams by widget key: the controller that stops each one.
  const streamRuns = new Map<string, AbortController>();
  let prefetchQueue: readonly string[] = [];
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

  function stopStream(key: string, reason: unknown): void {
    const controller: AbortController | undefined = streamRuns.get(key);
    if (controller === undefined) return;
    streamRuns.delete(key);
    controller.abort(reason);
  }

  function abortAll(reason: unknown): void {
    for (const controller of inFlight.values()) controller.abort(reason);
    inFlight.clear();
    for (const key of [...streamRuns.keys()]) stopStream(key, reason);
  }

  resolveOptions.signal?.addEventListener(
    'abort',
    () => abortAll(resolveOptions.signal?.reason),
    { once: true }
  );

  /** Runs one widget's live feed until `controller` aborts. */
  function startStream(
    definition: WidgetDefinition,
    stream: WidgetStream<C>,
    runOptions: ResolveOptions,
    values: OptionValues,
    controller: AbortController,
    isCurrent: () => boolean
  ): void {
    const key: string = definition.key;
    const quotedKey: string = JSON.stringify(key);
    streamRuns.set(key, controller);
    const live = (): boolean => !controller.signal.aborted && isCurrent();
    const report = (status: StreamStatus): void => {
      try {
        onStreamStatus?.(key, status);
      } catch {
        // A failing status listener must not stop the feed.
      }
    };
    let lastShownAt: number = Number.NEGATIVE_INFINITY;
    let newest: WidgetPayload | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const showFailure = (message: string): void => {
      const kept: DashboardWidget | undefined = snapshot.find(
        (widget) => widget.definition.key === key
      );
      if (kept?.status === 'ok') {
        // The last good data stays, with a note, as for a failed refresh.
        const { stale: _stale, ...rest } = kept;
        replace(key, { ...rest, refreshError: message });
        return;
      }
      unapplied.delete(key);
      replace(key, { definition, status: 'error', error: message });
    };

    const show = (payload: WidgetPayload): void => {
      lastShownAt = Date.now();
      const resolved: ResolvedWidget = resolvePayload(
        definition,
        payload,
        runOptions
      );
      if (resolved.status === 'error') {
        showFailure(`Widget ${quotedKey}: stream sent ${resolved.error}`);
        return;
      }
      const shown: ResolvedWidget =
        resolved.status === 'ok'
          ? { ...resolved, updatedAt: lastShownAt }
          : resolved;
      if (shown.status === 'ok') unapplied.set(key, shown);
      else unapplied.delete(key);
      replace(
        key,
        finalizeWidget(shown, values, filterValuesOf(definition, runOptions))
      );
    };

    const emit = (payload: WidgetPayload): void => {
      if (!live()) return;
      const wait: number = lastShownAt + minIntervalMs - Date.now();
      if (wait <= 0 && timer === undefined) {
        show(payload);
        return;
      }
      newest = payload;
      if (timer !== undefined) return;
      timer = setTimeout(
        () => {
          timer = undefined;
          const latest: WidgetPayload | undefined = newest;
          newest = undefined;
          if (live() && latest !== undefined) show(latest);
        },
        Math.max(wait, 0)
      );
    };

    controller.signal.addEventListener(
      'abort',
      () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        newest = undefined;
        report('closed');
      },
      { once: true }
    );

    let cleanup: void | (() => void);
    try {
      cleanup = stream(context, definition, {
        emit,
        fail: (cause: unknown): void => {
          if (!live()) return;
          if (timer !== undefined) clearTimeout(timer);
          timer = undefined;
          newest = undefined;
          showFailure(
            `Widget ${quotedKey}: stream failed: ${describeUnknownError(cause)}`
          );
        },
        status: (status: StreamStatus): void => {
          if (live()) report(status);
        },
        signal: controller.signal,
        options: values,
        view: loadViewKey(definition, runOptions.viewValues?.[key]),
        filters: filterValuesOf(definition, runOptions),
      });
    } catch (cause: unknown) {
      if (live()) {
        showFailure(
          `Widget ${quotedKey}: stream failed to start: ${describeUnknownError(cause)}`
        );
      }
      return;
    }
    if (typeof cleanup === 'function') {
      const close: () => void = cleanup;
      const runCleanup = (): void => {
        try {
          close();
        } catch {
          // A cleanup that throws must not break the loader.
        }
      };
      if (controller.signal.aborted) runCleanup();
      else
        controller.signal.addEventListener('abort', runCleanup, { once: true });
    }
  }

  async function run(
    definition: WidgetDefinition,
    readCache: boolean,
    keepDataOnError = false
  ): Promise<void> {
    const key: string = definition.key;
    const generation: number = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    inFlight.get(key)?.abort(new Error('Superseded by a newer load.'));
    stopStream(key, new Error('Superseded by a newer load.'));
    const controller = new AbortController();
    inFlight.set(key, controller);
    const isCurrent = (): boolean =>
      !disposed && generations.get(key) === generation;

    const runOptions: ResolveOptions = currentOptions();
    const values: OptionValues = optionValuesFor(definition, runOptions);
    if (readCache && runOptions.cache !== undefined) {
      try {
        const entry = await runOptions.cache.get(
          cacheKeyFor(definition, runOptions, values)
        );
        if (entry !== undefined && isCurrent()) {
          const cached = resolvePayload(definition, entry.payload, runOptions);
          if (cached.status === 'ok') {
            const stale = { ...cached, updatedAt: entry.storedAt, stale: true };
            unapplied.set(key, stale);
            replace(
              key,
              finalizeWidget(
                stale,
                values,
                filterValuesOf(definition, runOptions)
              )
            );
          }
        }
      } catch {
        // An unreadable cache is just a miss.
      }
    }
    if (!isCurrent()) return;

    const providerKey: string = providerKeyOf(definition);
    if (Object.prototype.hasOwnProperty.call(streams, providerKey)) {
      const stream: WidgetStream<C> | undefined = streams[providerKey];
      if (stream !== undefined) {
        // A stream never finishes, so it must not hold prefetching back.
        inFlight.delete(key);
        startStream(
          definition,
          stream,
          runOptions,
          values,
          controller,
          isCurrent
        );
        runPrefetch();
        return;
      }
    }
    const provider = Object.prototype.hasOwnProperty.call(
      providers,
      providerKey
    )
      ? providers[providerKey]
      : undefined;
    const result = await resolveWidgetUnapplied(definition, provider, context, {
      ...runOptions,
      signal: controller.signal,
    });
    if (!isCurrent()) return;
    inFlight.delete(key);
    runPrefetch();
    if (result.status === 'error' && keepDataOnError) {
      // A refresh failed: keep the last good data on screen and say so.
      const kept: DashboardWidget | undefined = snapshot.find(
        (widget) => widget.definition.key === key
      );
      if (kept?.status === 'ok') {
        const { stale: _stale, ...rest } = kept;
        replace(key, { ...rest, refreshError: result.error });
        return;
      }
    }
    if (result.status === 'ok') unapplied.set(key, result);
    else unapplied.delete(key);
    replace(
      key,
      finalizeWidget(result, values, filterValuesOf(definition, runOptions))
    );
  }

  function start(
    definition: WidgetDefinition,
    readCache: boolean,
    keepDataOnError = false
  ): void {
    started.add(definition.key);
    void run(definition, readCache, keepDataOnError);
  }

  function definitionFor(key: string): WidgetDefinition | undefined {
    return visible.find((definition) => definition.key === key);
  }

  function load(key: string): void {
    if (disposed || started.has(key)) return;
    const definition: WidgetDefinition | undefined = definitionFor(key);
    if (definition !== undefined) start(definition, true);
  }

  // Starts the queued prefetch keys once nothing is in flight.
  function runPrefetch(): void {
    if (disposed || inFlight.size > 0 || prefetchQueue.length === 0) return;
    const keys: readonly string[] = prefetchQueue;
    prefetchQueue = [];
    for (const key of keys) load(key);
  }

  function prefetch(keys: readonly string[]): void {
    if (disposed) return;
    prefetchQueue = keys.filter((key) => !started.has(key));
    runPrefetch();
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
      if (
        refreshOptions?.skipInFlight === true &&
        (inFlight.has(target) || streamRuns.has(target))
      ) {
        continue;
      }
      const current: DashboardWidget | undefined = snapshot.find(
        (widget) => widget.definition.key === target
      );
      if (current?.status === 'error') {
        replace(target, { definition, status: 'loading' });
      }
      let keepDataOnError = false;
      if (current?.status === 'ok') {
        // The data stays, marked as being replaced; a failed reload keeps it.
        const { refreshError: _previous, ...rest } = current;
        replace(target, { ...rest, stale: true });
        keepDataOnError = true;
      }
      start(definition, false, keepDataOnError);
    }
  }

  function setOptions(
    key: string,
    values: Readonly<Record<string, unknown>>
  ): void {
    if (disposed) return;
    const definition: WidgetDefinition | undefined = definitionFor(key);
    if (definition === undefined) return;
    const before: OptionValues = optionValuesFor(definition, currentOptions());
    chosen.set(key, { ...values });
    const runOptions: ResolveOptions = currentOptions();
    const after: OptionValues = optionValuesFor(definition, runOptions);
    if (sameOptionValues(before, after) || !started.has(key)) return;
    const kept: ResolvedWidget | undefined = unapplied.get(key);
    if (
      kept !== undefined &&
      optionsCacheSuffix(definition, before, runOptions) ===
        optionsCacheSuffix(definition, after, runOptions)
    ) {
      // Only a choice the toolkit applies changed: no need to ask again.
      replace(
        key,
        finalizeWidget(kept, after, filterValuesOf(definition, runOptions))
      );
      return;
    }
    const current: DashboardWidget | undefined = snapshot.find(
      (widget) => widget.definition.key === key
    );
    if (current?.status === 'ok') replace(key, { ...current, stale: true });
    else if (current?.status === 'error') {
      replace(key, { definition, status: 'loading' });
    }
    start(definition, true);
  }

  function setFilterValues(values: Readonly<Record<string, unknown>>): void {
    if (disposed) return;
    const before: ResolveOptions = currentOptions();
    chosenFilters = { ...values };
    const after: ResolveOptions = currentOptions();
    for (const definition of visible) {
      if (!started.has(definition.key)) continue;
      if (
        sameOptionValues(
          filterValuesOf(definition, before),
          filterValuesOf(definition, after)
        )
      ) {
        continue;
      }
      const current: DashboardWidget | undefined = snapshot.find(
        (widget) => widget.definition.key === definition.key
      );
      if (current?.status === 'ok') {
        replace(definition.key, { ...current, stale: true });
      } else if (current?.status === 'error') {
        replace(definition.key, { definition, status: 'loading' });
      }
      start(definition, true);
    }
  }

  function setView(key: string, view: string | undefined): void {
    if (disposed) return;
    const definition: WidgetDefinition | undefined = definitionFor(key);
    if (definition === undefined) return;
    const before: string = loadViewKey(definition, chosenViews.get(key));
    if (view === undefined || view === '') chosenViews.delete(key);
    else chosenViews.set(key, view);
    const after: string = loadViewKey(definition, chosenViews.get(key));
    if (before === after || !started.has(key)) return;
    const current: DashboardWidget | undefined = snapshot.find(
      (widget) => widget.definition.key === key
    );
    // What is shown belongs to the other view: wait for the right one.
    if (current !== undefined && current.status !== 'loading') {
      replace(key, { definition, status: 'loading' });
    }
    start(definition, true);
  }

  function setDefinitions(next: readonly WidgetDefinition[]): void {
    if (disposed) return;
    visible = widgetsFor(next, context.roles);
    const keys = new Set<string>(visible.map((definition) => definition.key));
    for (const key of [...started, ...unapplied.keys()]) {
      if (keys.has(key)) continue;
      inFlight.get(key)?.abort(new Error('The widget was removed.'));
      inFlight.delete(key);
      stopStream(key, new Error('The widget was removed.'));
      started.delete(key);
      unapplied.delete(key);
      chosen.delete(key);
      chosenViews.delete(key);
    }
    const byKey = new Map<string, DashboardWidget>(
      snapshot.map((widget) => [widget.definition.key, widget])
    );
    publish(
      visible.map((definition): DashboardWidget => {
        const existing: DashboardWidget | undefined = byKey.get(definition.key);
        const kept: ResolvedWidget | undefined = unapplied.get(definition.key);
        if (kept !== undefined)
          unapplied.set(definition.key, { ...kept, definition });
        return existing === undefined
          ? { definition, status: 'loading' }
          : { ...existing, definition };
      })
    );
  }

  function release(keys: readonly string[]): void {
    if (disposed) return;
    const released = new Set<string>();
    for (const key of keys) {
      if (!started.has(key)) continue;
      const definition: WidgetDefinition | undefined = definitionFor(key);
      if (definition === undefined) continue;
      inFlight.get(key)?.abort(new Error('The widget was released.'));
      inFlight.delete(key);
      stopStream(key, new Error('The widget was released.'));
      started.delete(key);
      unapplied.delete(key);
      // A result that is still on its way must not bring the widget back.
      generations.set(key, (generations.get(key) ?? 0) + 1);
      released.add(key);
    }
    if (released.size === 0) return;
    publish(
      snapshot.map((widget) =>
        released.has(widget.definition.key)
          ? { definition: widget.definition, status: 'loading' as const }
          : widget
      )
    );
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
    setOptions,
    setFilterValues,
    setView,
    setDefinitions,
    release,
    prefetch,
    dispose,
  };
}
