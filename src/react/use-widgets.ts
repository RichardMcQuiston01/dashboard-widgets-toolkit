import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { WidgetDefinition } from '../core/definition.js';
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
    refreshMs = 0,
    validate,
    timeoutMs,
    signal,
    cache,
    cacheKey,
    optionValues,
    viewValues,
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

  return { widgets, refresh, setOptions, setView, gridRef };
}
