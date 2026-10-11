/**
 * Drag-and-drop reordering, core part: pure functions for the decisions a
 * drag needs (which card is under the pointer, where the drop indicator goes,
 * what the layout becomes, how fast to scroll). Nothing here touches the DOM;
 * the React `Dashboard` measures the cards and feeds the numbers in. The
 * commit is `moveWidget`, so pinned widgets and locks are enforced by the same
 * rules as the move buttons. See `docs/design/widget-extensions.md`.
 */

import {
  moveWidget,
  visibleWidgets,
  type DashboardLayout,
  type LayoutItem,
} from './layout.js';

/** A card's rectangle in viewport coordinates. */
export interface CardBox {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface DragPoint {
  readonly x: number;
  readonly y: number;
}

/** Where the drop indicator goes relative to the target card. */
export type DropPlacement = 'before' | 'after';

function contains(box: CardBox, point: DragPoint): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.left + box.width &&
    point.y >= box.top &&
    point.y <= box.top + box.height
  );
}

/** Distance from `point` to the nearest edge of `box` (0 when inside). */
function distanceTo(box: CardBox, point: DragPoint): number {
  const dx: number = Math.max(
    box.left - point.x,
    0,
    point.x - box.left - box.width
  );
  const dy: number = Math.max(
    box.top - point.y,
    0,
    point.y - box.top - box.height
  );
  return Math.hypot(dx, dy);
}

/**
 * The card a drag would drop onto: the one under the pointer, else the
 * nearest by edge distance (the first in `boxes` order wins a tie). The
 * dragged card is never a target, and a pointer still inside `origin` (where
 * the dragged card started) means "put it back": no target.
 */
export function dropTargetKey(
  boxes: readonly CardBox[],
  draggedKey: string,
  point: DragPoint,
  origin?: CardBox
): string | undefined {
  if (origin !== undefined && contains(origin, point)) return undefined;
  let best: CardBox | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    if (box.key === draggedKey) continue;
    const distance: number = distanceTo(box, point);
    if (distance < bestDistance) {
      best = box;
      bestDistance = distance;
    }
  }
  return best?.key;
}

/**
 * Where the indicator sits: after the target when the dragged widget is
 * earlier in the visible order (it lands on the target's slot, so it ends up
 * after the cards in between), before it otherwise. Undefined when either key
 * is not visible or they are the same.
 */
export function dropPlacement<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  draggedKey: string,
  targetKey: string
): DropPlacement | undefined {
  const keys: string[] = visibleWidgets(definitions, layout).map((d) => d.key);
  const from: number = keys.indexOf(draggedKey);
  const to: number = keys.indexOf(targetKey);
  if (from === -1 || to === -1 || from === to) return undefined;
  return to > from ? 'after' : 'before';
}

/**
 * The layout after dropping `key` onto the card `targetKey`: `key` takes the
 * target's place in the visible order. Returns the same layout object when
 * nothing would change (unknown keys, a pinned mover or target), so callers
 * can use `next === layout` as "this drop is not allowed".
 */
export function reorderOnto<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string,
  targetKey: string
): DashboardLayout {
  const toIndex: number = visibleWidgets(definitions, layout).findIndex(
    (d) => d.key === targetKey
  );
  return toIndex === -1
    ? layout
    : moveWidget(definitions, layout, key, toIndex);
}

/** A widget's 1-based place among the visible widgets, for announcements. */
export function listPosition<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string
): { readonly position: number; readonly total: number } | undefined {
  const keys: string[] = visibleWidgets(definitions, layout).map((d) => d.key);
  const index: number = keys.indexOf(key);
  return index === -1 ? undefined : { position: index + 1, total: keys.length };
}

/** Pixels from the viewport edge where auto-scroll starts. */
export const AUTO_SCROLL_EDGE_PX = 64;
/** Fastest auto-scroll, in pixels per frame. */
export const AUTO_SCROLL_MAX_STEP_PX = 20;

/**
 * How far to scroll this frame while dragging: negative scrolls up, positive
 * down, 0 when the pointer is away from both edges. Speeds up the closer the
 * pointer is to the edge (and past it).
 */
export function autoScrollStep(
  pointerY: number,
  viewportHeight: number,
  edge: number = AUTO_SCROLL_EDGE_PX,
  maxStep: number = AUTO_SCROLL_MAX_STEP_PX
): number {
  if (!(edge > 0) || !(viewportHeight > 0)) return 0;
  if (pointerY < edge) {
    const depth: number = Math.min(1, (edge - pointerY) / edge);
    return -Math.max(1, Math.round(depth * maxStep));
  }
  if (pointerY > viewportHeight - edge) {
    const depth: number = Math.min(
      1,
      (pointerY - (viewportHeight - edge)) / edge
    );
    return Math.max(1, Math.round(depth * maxStep));
  }
  return 0;
}
