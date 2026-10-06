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
}

export interface UseWidgetsResult {
  /** Pass to `Dashboard` or `WidgetGrid`: placeholders first, then results. */
  readonly widgets: readonly DashboardWidget[];
  /** Reload one widget (for example from the error card's Retry) or all. */
  readonly refresh: (key?: string) => void;
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
 * Keep `definitions`, `providers`, `context` and `options.cache` referentially
 * stable (module constants or `useMemo`): a changed value restarts loading,
 * aborting whatever is in flight.
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

  // One loader per set of inputs. It is created in an effect (never during
  // render) so server rendering starts nothing, and so React StrictMode's
  // mount, unmount, mount cycle gets a fresh loader instead of a disposed one.
  useEffect(() => {
    const created: WidgetLoader = createWidgetLoader({
      definitions,
      providers,
      context,
      ...(validate === undefined ? {} : { validate }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(signal === undefined ? {} : { signal }),
      ...(cache === undefined ? {} : { cache }),
      ...(cacheKey === undefined ? {} : { cacheKey }),
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
    definitions,
    providers,
    context,
    validate,
    timeoutMs,
    signal,
    cache,
    cacheKey,
    loadWhen,
  ]);

  // loadWhen 'visible': start a widget the first time its card nears the viewport.
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
    grid
      .querySelectorAll('[data-widget-key]')
      .forEach((card) => observer.observe(card));
    return () => observer.disconnect();
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

  const refresh = useCallback((key?: string): void => {
    loaderRef.current?.refresh(key);
  }, []);

  return { widgets, refresh, gridRef };
}
