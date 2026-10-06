import type { WidgetFill, WidgetSize } from './definition.js';

/** The parts of a widget definition that decide its place in a grid. */
export interface GridItem {
  readonly key: string;
  readonly defaultSize?: WidgetSize;
  readonly fill?: WidgetFill;
}

/** Whether the widget should take the columns left over in its row. */
export function fillsWidth(fill: WidgetFill | undefined): boolean {
  return fill === 'width' || fill === 'both';
}

/** Whether the widget should stretch to the height of its row. */
export function fillsHeight(fill: WidgetFill | undefined): boolean {
  return fill === 'height' || fill === 'both';
}

/**
 * Columns a size takes in a grid of `columns` tracks: `large` spans
 * `largeSpan` (default 2), `full` spans every column, anything else one.
 */
export function baseColumnSpan(
  size: WidgetSize | undefined,
  columns: number,
  largeSpan = 2
): number {
  if (size === 'full') return columns;
  if (size === 'large') return Math.min(largeSpan, columns);
  return 1;
}

/**
 * Places `items` in a grid of `columns` tracks the way a sparse grid
 * auto-places them (left to right, wrapping to a new row when an item does
 * not fit), then gives the columns left over in each row to the items that
 * `fill` their width, shared evenly (earlier items get the remainder).
 *
 * Returns the column span for each width-filling item, keyed by `key`. Items
 * that do not fill width keep their normal size and are not in the map.
 */
export function fillColumnSpans(
  items: readonly GridItem[],
  columns: number,
  largeSpan = 2
): Map<string, number> {
  const trackCount: number = Math.max(1, Math.floor(columns));
  const spans = new Map<string, number>();
  let row: { item: GridItem; span: number }[] = [];
  let used = 0;

  function closeRow(): void {
    const fillers = row.filter(({ item }) => fillsWidth(item.fill));
    const leftover: number = trackCount - used;
    if (fillers.length > 0) {
      const share: number = Math.floor(leftover / fillers.length);
      const remainder: number = leftover % fillers.length;
      fillers.forEach(({ item, span }, index) => {
        spans.set(item.key, span + share + (index < remainder ? 1 : 0));
      });
    }
    row = [];
    used = 0;
  }

  for (const item of items) {
    const span: number = baseColumnSpan(
      item.defaultSize,
      trackCount,
      largeSpan
    );
    if (used + span > trackCount && row.length > 0) closeRow();
    row.push({ item, span });
    used += span;
  }
  closeRow();
  return spans;
}
