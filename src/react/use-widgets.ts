import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { WidgetDefinition } from '../core/definition.js';
import type { DashboardFilter } from '../core/filters.js';
import { createWidgetLoader, type WidgetLoader } from '../core/loader.js';
import {
  loadingWidgets,
  widgetsFor,
  type DashboardWidget,
  type ResolveOptions,
  type WidgetContext,
  type WidgetProviders,
} from '../core/resolve.js';

export interface UseWidgetsOptions extends ResolveOptions {
  /**
   * When each widget's provider starts. `'mount'` (default): right after the
   * first render, so the page and the dashboard shell appear first and each
   * card fills in as its data arrives. `'visible'`: only once the card is
   * near the viewport (attach `gridRef` to an element around the cards).
   */
  readonly loadWhen?: 'mount' | 'visible';
  /** `IntersectionObserver` margin for `loadWhen: 'visible'`. Default `'200px'`. */
  readonly rootMargin?: string;
  /**
   * For `loadWhen: 'visible'`: keys of widgets to load ahead of time, once the
   * cards in view have finished loading (what a paged dashboard passes for the
   * pages next to the one in view: `nearPageWidgetKeys(definitions, layout,
   * pageKey)`). The newest list replaces the older one, so a page the viewer
   * has already left is not fetched. Ignored for `loadWhen: 'mount'`, which
   * loads everything up front. May be an inline array.
   */
  readonly prefetch?: readonly string[];
  /**
   * How long to wait, in ms, before queueing `prefetch` so the cards in view
   * get to start first. Default 150.
   */
  readonly prefetchDelayMs?: number;
  /**
   * Reload started widgets every this many ms. Ticks are skipped while the
   * tab is hidden, and a widget still loading is not restarted.
   */
  readonly refreshMs?: number;
  /**
   * The viewer's chosen option values by widget key (see
   * `WidgetDefinition.options`). Changing them reloads only the widgets whose
   * resolved values changed; it never recreates the loader, so it may be a
   * fresh object each render.
   */
  readonly optionValues?: Readonly<
    Record<string, Readonly<Record<string, unknown>> | undefined>
  >;
  /**
   * The view each widget shows, by widget key (see `viewValuesFromLayout`).
   * Only views the provider supplies matter: choosing one loads it (the
   * provider is called with `options.view`), and the card shows loading until
   * it arrives. It may be a fresh object each render.
   */
  readonly viewValues?: Readonly<Record<string, string | undefined>>;
  /**
   * The dashboard's filters (see `DashboardFilter`). They may be an inline
   * array: only a change in their content matters.
   */
  readonly filters?: readonly DashboardFilter[];
  /**
   * The values chosen for those filters, by filter key (see
   * `useDashboardFilters`). Changing them reloads only the widgets that use a
   * filter whose resolved value changed, keeping what they show (marked
   * `stale`) until the new data arrives. It may be a fresh object each render.
   */
  readonly filterValues?: Readonly<Record<string, unknown>>;
}

export interface UseWidgetsResult {
  /** Pass to `Dashboard` or `WidgetGrid`: placeholders first, then results. */
  readonly widgets: readonly DashboardWidget[];
  /** Reload one widget (for example from the error card's Retry) or all. */
  readonly refresh: (key?: string) => void;
  /** Choose option values for one widget; same effect as `optionValues`. */
  readonly setOptions: (
    key: string,
    chosen: Readonly<Record<string, unknown>>
  ) => void;
  /**
   * Drops the payloads of the widgets in `keys` (a paged dashboard's far-away
   * pages: see `farPageWidgetKeys`). They show as loading and load again the next
   * time their card appears, from the `cache` first when there is one. Only for
   * `loadWhen: 'visible'`, which is what loads them again (with `'mount'` this
   * does nothing, since every widget was promised to load up front), and a
   * widget whose card is on screen is never released.
   */
  readonly release: (keys: readonly string[]) => void;
  /** Choose the dashboard filter values; same effect as `filterValues`. */
  readonly setFilterValues: (chosen: Readonly<Record<string, unknown>>) => void;
  /** Choose a widget's view; same effect as `viewValues`. */
  readonly setView: (key: string, view: string | undefined) => void;
  /**
   * For `loadWhen: 'visible'`: attach to any element that contains the cards,
   * for example a wrapper `<div ref={gridRef}>` around `Dashboard`.
   */
  readonly gridRef: RefObject<HTMLDivElement | null>;
}

/**
 * Loads widget data after the page has rendered and returns widgets for
 * `Dashboard`. The first render never waits for data (so server rendering
 * and first paint are unaffected); every widget starts as `loading`, loads
 * independently, and replaces its placeholder when its own data arrives.
 *
 * Keep `providers`, `context` and `options.cache` referentially stable
 * (module constants or `useMemo`): a changed value restarts loading, aborting
 * whatever is in flight. `definitions` may change freely (for example when a
 * clone is added or deleted): widgets already loaded keep their data and only
 * new ones load.
 */
export function useWidgets<C extends WidgetContext>(
  definitions: readonly WidgetDefinition[],
  providers: WidgetProviders<C>,
  context: C,
  options: UseWidgetsOptions = {}
): UseWidgetsResult {
  const {
    loadWhen = 'mount',
    rootMargin = '200px',
    prefetch,
    prefetchDelayMs = 150,
    refreshMs = 0,
    validate,
    timeoutMs,
    signal,
    cache,
    cacheKey,
    optionValues,
    viewValues,
    filters,
    filterValues,
  } = options;

  const placeholders: readonly DashboardWidget[] = useMemo(
    () => loadingWidgets(widgetsFor(definitions, context.roles)),
    [definitions, context.roles]
  );
  const [widgets, setWidgets] =
    useState<readonly DashboardWidget[]>(placeholders);
  const [loader, setLoader] = useState<WidgetLoader | null>(null);
  const loaderRef = useRef<WidgetLoader | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const optionValuesRef = useRef(optionValues);
  optionValuesRef.current = optionValues;
  const viewValuesRef = useRef(viewValues);
  viewValuesRef.current = viewValues;
  // Filters are compared by content, so an inline array doesn't restart the
  // loader on every render.
  const filtersSignature: string = JSON.stringify(filters ?? []);
  const stableFilters: readonly DashboardFilter[] | undefined = useMemo(
    () => (filters === undefined ? undefined : filters),
    [filtersSignature]
  );
  const filterValuesRef = useRef(filterValues);
  filterValuesRef.current = filterValues;
  // The latest definitions, for a loader created later; changing them never
  // recreates the loader (see the effect below).
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;

  // One loader per set of inputs. It is created in an effect (never during
  // render) so server rendering starts nothing, and so React StrictMode's
  // mount, unmount, mount cycle gets a fresh loader instead of a disposed one.
  useEffect(() => {
    const created: WidgetLoader = createWidgetLoader({
      definitions: definitionsRef.current,
      providers,
      context,
      ...(validate === undefined ? {} : { validate }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(signal === undefined ? {} : { signal }),
      ...(cache === undefined ? {} : { cache }),
      ...(cacheKey === undefined ? {} : { cacheKey }),
      ...(optionValuesRef.current === undefined
        ? {}
        : { optionValues: optionValuesRef.current }),
      ...(viewValuesRef.current === undefined
        ? {}
        : { viewValues: viewValuesRef.current }),
      ...(stableFilters === undefined ? {} : { filters: stableFilters }),
      ...(filterValuesRef.current === undefined
        ? {}
        : { filterValues: filterValuesRef.current }),
    });
    loaderRef.current = created;
    setWidgets(created.getSnapshot());
    const unsubscribe: () => void = created.subscribe(() =>
      setWidgets(created.getSnapshot())
    );
    setLoader(created);
    if (loadWhen === 'mount' || typeof IntersectionObserver === 'undefined') {
      created.loadAll();
    }
    return () => {
      unsubscribe();
      created.dispose();
      loaderRef.current = null;
      setLoader(null);
    };
  }, [
    providers,
    context,
    validate,
    timeoutMs,
    signal,
    cache,
    cacheKey,
    loadWhen,
    stableFilters,
  ]);

  // Definitions changed (a clone added or deleted, a widget shown or hidden):
  // update the running loader in place. Widgets already loaded keep their data
  // and nothing in flight is aborted; only new widgets load.
  useEffect(() => {
    if (loader === null) return;
    loader.setDefinitions(definitions);
    for (const [key, chosen] of Object.entries(optionValuesRef.current ?? {})) {
      if (chosen !== undefined) loader.setOptions(key, chosen);
    }
    for (const [key, view] of Object.entries(viewValuesRef.current ?? {})) {
      loader.setView(key, view);
    }
    if (loadWhen === 'mount' || typeof IntersectionObserver === 'undefined') {
      loader.loadAll();
    }
  }, [loader, definitions, loadWhen]);

  // loadWhen 'visible': start a widget the first time its card nears the
  // viewport. Cards that appear later (another page, a restored widget) are
  // picked up as they are added, so they load when first shown.
  const cardKeys: string = widgets
    .map((widget) => widget.definition.key)
    .join('\u0000');
  useEffect(() => {
    const grid: HTMLDivElement | null = gridRef.current;
    if (
      loader === null ||
      grid === null ||
      loadWhen !== 'visible' ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key: string | undefined = (entry.target as HTMLElement).dataset[
            'widgetKey'
          ];
          if (entry.isIntersecting && key !== undefined) {
            loader.load(key);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin }
    );
    const observed = new WeakSet<Element>();
    const observeNewCards = (): void => {
      grid.querySelectorAll('[data-widget-key]').forEach((card) => {
        if (observed.has(card)) return;
        observed.add(card);
        observer.observe(card);
      });
    };
    observeNewCards();
    const mutations: MutationObserver | undefined =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(observeNewCards);
    mutations?.observe(grid, { childList: true, subtree: true });
    return () => {
      mutations?.disconnect();
      observer.disconnect();
    };
  }, [loader, loadWhen, rootMargin, cardKeys]);

  // Prefetch: after a short wait (so the cards in view start first), queue the
  // widgets on the neighbouring pages; the loader starts them once nothing else
  // is loading. A changed list replaces the queue.
  const prefetchSignature: string = JSON.stringify(prefetch ?? []);
  useEffect(() => {
    if (
      loader === null ||
      loadWhen !== 'visible' ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return undefined;
    }
    const keys: readonly string[] = JSON.parse(prefetchSignature) as string[];
    const timer = setTimeout(() => loader.prefetch(keys), prefetchDelayMs);
    return () => {
      clearTimeout(timer);
      loader.prefetch([]);
    };
  }, [loader, loadWhen, prefetchSignature, prefetchDelayMs]);

  // Polling: reload started widgets, skipping ticks while the tab is hidden.
  useEffect(() => {
    if (loader === null || !(refreshMs > 0)) return undefined;
    const timer = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      loader.refresh(undefined, { skipInFlight: true });
    }, refreshMs);
    return () => clearInterval(timer);
  }, [loader, refreshMs]);

  // Push changed option values to the running loader, which reloads just the
  // widgets whose resolved values differ.
  const optionSignature: string = JSON.stringify(optionValues ?? {});
  useEffect(() => {
    if (loader === null) return;
    for (const [key, chosen] of Object.entries(optionValuesRef.current ?? {})) {
      if (chosen !== undefined) loader.setOptions(key, chosen);
    }
  }, [loader, optionSignature]);

  // Likewise for the view each widget shows.
  const viewSignature: string = JSON.stringify(viewValues ?? {});
  useEffect(() => {
    if (loader === null) return;
    for (const [key, view] of Object.entries(viewValuesRef.current ?? {})) {
      loader.setView(key, view);
    }
  }, [loader, viewSignature]);

  // Likewise for the dashboard filters: only the widgets that use a changed
  // filter reload.
  const filterSignature: string = JSON.stringify(filterValues ?? {});
  useEffect(() => {
    if (loader === null) return;
    loader.setFilterValues(filterValuesRef.current ?? {});
  }, [loader, filterSignature]);

  const setFilterValues = useCallback(
    (chosen: Readonly<Record<string, unknown>>): void => {
      loaderRef.current?.setFilterValues(chosen);
    },
    []
  );

  const setView = useCallback((key: string, view: string | undefined): void => {
    loaderRef.current?.setView(key, view);
  }, []);

  const setOptions = useCallback(
    (key: string, chosen: Readonly<Record<string, unknown>>): void => {
      loaderRef.current?.setOptions(key, chosen);
    },
    []
  );

  const refresh = useCallback((key?: string): void => {
    loaderRef.current?.refresh(key);
  }, []);

  const release = useCallback(
    (keys: readonly string[]): void => {
      if (
        loadWhen !== 'visible' ||
        typeof IntersectionObserver === 'undefined'
      ) {
        return;
      }
      const grid: HTMLDivElement | null = gridRef.current;
      const gone: string[] = keys.filter(
        (key) =>
          grid === null ||
          grid.querySelector(`[data-widget-key="${CSS.escape(key)}"]`) === null
      );
      loaderRef.current?.release(gone);
    },
    [loadWhen]
  );

  return {
    widgets,
    refresh,
    release,
    setOptions,
    setFilterValues,
    setView,
    gridRef,
  };
}
