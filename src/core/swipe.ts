/**
 * Swipe between pages, core part: the decision a horizontal swipe makes and
 * the page it lands on. Pure functions over numbers; the React
 * `usePageSwipe` measures the gesture and feeds them in. See
 * `docs/design/widget-pages.md`.
 */

import type { LayoutPage } from './layout.js';

/** The way a swipe moves through the pages. */
export type SwipeDirection = 'next' | 'previous';

/** Pixels a finger must travel sideways before a swipe counts. */
export const SWIPE_MIN_DISTANCE_PX = 56;

/** How much further the finger must go sideways than up or down. */
export const SWIPE_AXIS_RATIO = 1.5;

/** A press held longer than this is not a swipe (it is a hold or a drag). */
export const SWIPE_MAX_DURATION_MS = 1000;

/** What a finger did from touching down to lifting up. */
export interface SwipeGesture {
  /** Horizontal travel in pixels, positive to the right. */
  readonly dx: number;
  /** Vertical travel in pixels, positive downward. */
  readonly dy: number;
  readonly durationMs: number;
}

export interface SwipeOptions {
  /** Right-to-left layouts swipe the other way: a swipe right is `next`. */
  readonly rtl?: boolean;
}

/**
 * The direction a gesture swipes, or undefined when it is not a swipe: too
 * short, too slow, or more vertical than horizontal (a scroll). Swiping left
 * shows the next page, as on a phone's home screen.
 */
export function swipeDirection(
  gesture: SwipeGesture,
  options: SwipeOptions = {}
): SwipeDirection | undefined {
  const { dx, dy, durationMs } = gesture;
  if (![dx, dy, durationMs].every(Number.isFinite)) return undefined;
  if (durationMs > SWIPE_MAX_DURATION_MS) return undefined;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return undefined;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return undefined;
  const towardNext: boolean = options.rtl === true ? dx > 0 : dx < 0;
  return towardNext ? 'next' : 'previous';
}

/**
 * The key of the page a swipe from `activeKey` lands on. The pages do not
 * wrap: swiping past the first or last page, or from an unknown page, lands
 * nowhere (undefined).
 */
export function adjacentPageKey(
  pages: readonly Pick<LayoutPage, 'key'>[],
  activeKey: string,
  direction: SwipeDirection
): string | undefined {
  const index: number = pages.findIndex((page) => page.key === activeKey);
  if (index === -1) return undefined;
  return pages[direction === 'next' ? index + 1 : index - 1]?.key;
}
