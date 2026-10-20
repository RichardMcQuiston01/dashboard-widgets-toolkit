import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { WidgetDefinition } from '../core/definition.js';
import {
  WIDTH_COLUMNS,
  fillColumnSpans,
  fillWidthSpans,
  fillsWidth,
  itemWidth,
} from '../core/grid.js';

/** Viewport width at or below which the stylesheet stops spanning `large`. */
const NARROW_VIEWPORT_QUERY = '(max-width: 640px)';

/** Grid width above which a 12-column grid uses each widget's own width. */
const WIDE_GRID_PX = 900;

interface GridMetrics {
  readonly columns: number;
  readonly largeSpan: number;
}

/**
 * Column spans for widgets that `fill` their width. The number of columns
 * comes from the rendered grid (so it follows your CSS and the container
 * width); until it is measured, and on the server, no spans are set and the
 * grid lays out normally. Empty when no widget fills width.
 */
export function useFillSpans(
  definitions: () => readonly WidgetDefinition[],
  gridRef: Ref<HTMLElement | null>,
  twelve: () => boolean
): ComputedRef<ReadonlyMap<string, number>> {
  const metrics: Ref<GridMetrics | undefined> = ref(undefined);
  const needsSpans = (): boolean =>
    definitions().some((definition) => fillsWidth(definition.fill));

  watch(
    [needsSpans, gridRef, twelve],
    ([needs, grid, isTwelve], _previous, onCleanup) => {
      if (!needs || grid === null || typeof ResizeObserver === 'undefined') {
        metrics.value = undefined;
        return;
      }
      const measure = (): void => {
        if (isTwelve) {
          // Narrow grids reflow in CSS; only fill when widths apply as set.
          const wide: boolean = grid.clientWidth > WIDE_GRID_PX;
          const previous = metrics.value;
          metrics.value = !wide
            ? undefined
            : previous?.columns === WIDTH_COLUMNS
              ? previous
              : { columns: WIDTH_COLUMNS, largeSpan: 2 };
          return;
        }
        const tracks: string = getComputedStyle(grid).gridTemplateColumns;
        const columns: number =
          tracks === '' || tracks === 'none'
            ? 0
            : tracks.trim().split(/\s+/).length;
        const largeSpan: number = window.matchMedia(NARROW_VIEWPORT_QUERY)
          .matches
          ? 1
          : 2;
        const previous = metrics.value;
        metrics.value =
          columns === 0
            ? undefined
            : previous?.columns === columns && previous.largeSpan === largeSpan
              ? previous
              : { columns, largeSpan };
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(grid);
      onCleanup(() => observer.disconnect());
    },
    { flush: 'post' }
  );

  return computed(() =>
    metrics.value === undefined
      ? new Map<string, number>()
      : twelve()
        ? fillWidthSpans(definitions())
        : fillColumnSpans(
            definitions(),
            metrics.value.columns,
            metrics.value.largeSpan
          )
  );
}

/** The `width` prop of a card on a 12-column grid. */
export function widthProps(
  twelve: boolean,
  definition: WidgetDefinition
): { width?: number } {
  return twelve ? { width: itemWidth(definition) } : {};
}

/** The `columnSpan` prop of a card whose span was measured. */
export function spanProps(
  spans: ReadonlyMap<string, number>,
  key: string
): { columnSpan?: number } {
  const columnSpan: number | undefined = spans.get(key);
  return columnSpan === undefined ? {} : { columnSpan };
}
