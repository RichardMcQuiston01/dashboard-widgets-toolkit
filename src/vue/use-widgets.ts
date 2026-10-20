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
   * component mounts, so the page and the dashboard shell appear first and
   * each card fills in as its data arrives. `'visible'`: only once the card is
   * near the viewport (attach `gridRef` to an element around the cards).
   */
  readonly loadWhen?: 'mount' | 'visible';
  /** `IntersectionObserver` margin for `loadWhen: 'visible'`. Default `'200px'`. */
  readonly rootMargin?: string;
  /**
   * For `loadWhen: 'visible'`: keys of widgets to load ahead of time, once the
   * cards in view have finished loading (see `nearPageWidgetKeys`). The newest
   * list replaces the older one.
   */
  readonly prefetch?: readonly string[];
  /** Wait, in ms, before queueing `prefetch`. Default 150. */
  readonly prefetchDelayMs?: number;
  /** Reload started widgets every this many ms (skipped while the tab is hidden). */
  readonly refreshMs?: number;
  /** The viewer's chosen option values by widget key. */
  readonly optionValues?: Readonly<
    Record<string, Readonly<Record<string, unknown>> | undefined>
  >;
  /** The view each widget shows, by widget key. */
  readonly viewValues?: Readonly<Record<string, string | undefined>>;
  /** The dashboard's filters. Only a change in their content matters. */
  readonly filters?: readonly DashboardFilter[];
  /** The values chosen for those filters, by filter key. */
  readonly filterValues?: Readonly<Record<string, unknown>>;
}

export interface UseWidgetsResult {
  /** Pass to `ResolvedWidgetCard`: placeholders first, then results. */
  readonly widgets: Readonly<ShallowRef<readonly DashboardWidget[]>>;
  /** Reload one widget (for example from the error card's Retry) or all. */
  readonly refresh: (key?: string) => void;
  /** Choose option values for one widget; same effect as `optionValues`. */
  readonly setOptions: (
    key: string,
    chosen: Readonly<Record<string, unknown>>
  ) => void;
  /**
   * Drops the payloads of the widgets in `keys` (see `farPageWidgetKeys`). Only
   * for `loadWhen: 'visible'`, and a widget whose card is on screen is never
   * released.
   */
  readonly release: (keys: readonly string[]) => void;
  /** Choose the dashboard filter values; same effect as `filterValues`. */
  readonly setFilterValues: (chosen: Readonly<Record<string, unknown>>) => void;
  /** Choose a widget's view; same effect as `viewValues`. */
  readonly setView: (key: string, view: string | undefined) => void;
  /** For `loadWhen: 'visible'`: set as `ref="gridRef"` on an element around the cards. */
  readonly gridRef: Ref<HTMLElement | null>;
}

/**
 * Loads widget data after the component has mounted and returns widgets for
 * your template. The first render never waits for data (so server rendering
 * and first paint are unaffected); every widget starts as `loading`, loads
 * independently, and replaces its placeholder when its own data arrives.
 *
 * `definitions` and `options` may be refs or getters; `providers` and
 * `context` are read once per loader (change them to restart loading, which
 * aborts whatever is in flight). Definitions may change freely: widgets
 * already loaded keep their data and only new ones load.
 */
export function useWidgets<C extends WidgetContext>(
  definitions: MaybeRefOrGetter<readonly WidgetDefinition[]>,
  providers: WidgetProviders<C>,
  context: C,
  options: MaybeRefOrGetter<UseWidgetsOptions> = {}
): UseWidgetsResult {
  const opts = (): UseWidgetsOptions => toValue(options);
  const widgets: ShallowRef<readonly DashboardWidget[]> = shallowRef(
    loadingWidgets(widgetsFor(toValue(definitions), context.roles))
  );
  const gridRef: Ref<HTMLElement | null> = ref(null);
  const loader: ShallowRef<WidgetLoader | null> = shallowRef(null);
  const cleanups: (() => void)[] = [];

  const visibleMode = (): boolean =>
    (opts().loadWhen ?? 'mount') === 'visible' &&
    typeof IntersectionObserver !== 'undefined';

  function pushChoices(target: WidgetLoader): void {
    for (const [key, chosen] of Object.entries(opts().optionValues ?? {})) {
      if (chosen !== undefined) target.setOptions(key, chosen);
    }
    for (const [key, view] of Object.entries(opts().viewValues ?? {})) {
      target.setView(key, view);
    }
  }

  // One loader per mount, created in onMounted (never during setup) so server
  // rendering starts nothing.
  onMounted(() => {
    const o: UseWidgetsOptions = opts();
    const created: WidgetLoader = createWidgetLoader({
      definitions: toValue(definitions),
      providers,
      context,
      ...(o.validate === undefined ? {} : { validate: o.validate }),
      ...(o.timeoutMs === undefined ? {} : { timeoutMs: o.timeoutMs }),
      ...(o.signal === undefined ? {} : { signal: o.signal }),
      ...(o.cache === undefined ? {} : { cache: o.cache }),
      ...(o.cacheKey === undefined ? {} : { cacheKey: o.cacheKey }),
      ...(o.optionValues === undefined ? {} : { optionValues: o.optionValues }),
      ...(o.viewValues === undefined ? {} : { viewValues: o.viewValues }),
      ...(o.filters === undefined ? {} : { filters: o.filters }),
      ...(o.filterValues === undefined ? {} : { filterValues: o.filterValues }),
    });
    loader.value = created;
    widgets.value = created.getSnapshot();
    const unsubscribe: () => void = created.subscribe(() => {
      widgets.value = created.getSnapshot();
    });
    cleanups.push(() => {
      unsubscribe();
      created.dispose();
      loader.value = null;
    });
    if (!visibleMode()) created.loadAll();
  });

  onBeforeUnmount(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  // Definitions changed: update the running loader in place.
  watch(
    () => toValue(definitions),
    (next) => {
      const target: WidgetLoader | null = loader.value;
      if (target === null) {
        widgets.value = loadingWidgets(widgetsFor(next, context.roles));
        return;
      }
      target.setDefinitions(next);
      pushChoices(target);
      if (!visibleMode()) target.loadAll();
    }
  );

  // Option, view and filter choices reach the running loader, which reloads
  // just the widgets whose resolved values differ.
  watch(
    () => JSON.stringify([opts().optionValues ?? {}, opts().viewValues ?? {}]),
    () => {
      const target: WidgetLoader | null = loader.value;
      if (target !== null) pushChoices(target);
    }
  );
  watch(
    () => JSON.stringify(opts().filterValues ?? {}),
    () => loader.value?.setFilterValues(opts().filterValues ?? {})
  );

  // loadWhen 'visible': start a widget the first time its card nears the
  // viewport. Cards that appear later (another page, a restored widget) are
  // picked up as they are added.
  watch(
    [loader, gridRef],
    ([target, grid], _previous, onCleanup) => {
      if (target === null || grid === null || !visibleMode()) return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const key: string | undefined = (entry.target as HTMLElement)
              .dataset['widgetKey'];
            if (entry.isIntersecting && key !== undefined) {
              target.load(key);
              observer.unobserve(entry.target);
            }
          }
        },
        { rootMargin: opts().rootMargin ?? '200px' }
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
      onCleanup(() => {
        mutations?.disconnect();
        observer.disconnect();
      });
    },
    { flush: 'post' }
  );

  // Prefetch: after a short wait (so the cards in view start first), queue the
  // widgets on the neighbouring pages; the loader starts them once nothing
  // else is loading. A changed list replaces the queue.
  watch(
    [loader, () => JSON.stringify(opts().prefetch ?? [])],
    ([target, signature], _previous, onCleanup) => {
      if (target === null || !visibleMode()) return;
      const keys: readonly string[] = JSON.parse(signature) as string[];
      const timer = setTimeout(
        () => target.prefetch(keys),
        opts().prefetchDelayMs ?? 150
      );
      onCleanup(() => {
        clearTimeout(timer);
        target.prefetch([]);
      });
    }
  );

  // Polling: reload started widgets, skipping ticks while the tab is hidden.
  watch(
    [loader, () => opts().refreshMs ?? 0],
    ([target, refreshMs], _previous, onCleanup) => {
      if (target === null || !(refreshMs > 0)) return;
      const timer = setInterval(() => {
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        target.refresh(undefined, { skipInFlight: true });
      }, refreshMs);
      onCleanup(() => clearInterval(timer));
    }
  );

  return {
    widgets,
    refresh: (key?: string): void => loader.value?.refresh(key),
    setOptions: (key, chosen): void => loader.value?.setOptions(key, chosen),
    setFilterValues: (chosen): void => loader.value?.setFilterValues(chosen),
    setView: (key, view): void => loader.value?.setView(key, view),
    release: (keys: readonly string[]): void => {
      if (!visibleMode()) return;
      const grid: HTMLElement | null = gridRef.value;
      const gone: string[] = keys.filter(
        (key) =>
          grid === null ||
          grid.querySelector(`[data-widget-key="${CSS.escape(key)}"]`) === null
      );
      loader.value?.release(gone);
    },
    gridRef,
  };
}
