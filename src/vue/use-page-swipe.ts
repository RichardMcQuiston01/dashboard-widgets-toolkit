import { swipeDirection, type SwipeDirection } from '../core/swipe.js';

/**
 * Elements a swipe never starts on: they have their own use for a touch and
 * drag (a handle, a slider, a text field, a dialog).
 */
const NO_SWIPE_SELECTOR =
  'button, a[href], input, select, textarea, summary, dialog, [role="slider"], [contenteditable="true"], [data-dwt-no-swipe], .dwt-drag-handle';

export interface UsePageSwipeOptions {
  /** Read on every touch, so it can follow state (`() => paged && !drag`). */
  readonly enabled: () => boolean;
  /** Called with the direction of a completed swipe. */
  readonly onSwipe: (direction: SwipeDirection) => void;
}

/** Touch listeners to give the element that holds the page. */
export interface PageSwipeProps {
  readonly onTouchstart: (event: TouchEvent) => void;
  readonly onTouchend: (event: TouchEvent) => void;
  readonly onTouchcancel: () => void;
}

interface Press {
  readonly identifier: number;
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
}

/** Whether `element` or an ancestor below `stop` scrolls sideways. */
function insideSideScroller(element: Element, stop: Element): boolean {
  for (
    let current: Element | null = element;
    current !== null && current !== stop;
    current = current.parentElement
  ) {
    if (current.scrollWidth <= current.clientWidth) continue;
    const overflowX: string = getComputedStyle(current).overflowX;
    if (overflowX === 'auto' || overflowX === 'scroll') return true;
  }
  return false;
}

/**
 * Swipe left or right on a touch screen to change page. It listens to touch
 * events (a mouse has the page bar), which, unlike pointer events, keep coming
 * while the browser pans, so scrolling a card or a table never gets in the
 * way. A swipe never starts on a control, a drag handle or a table that
 * actually scrolls sideways, a second finger cancels it, and a mostly
 * vertical movement is a scroll, not a swipe.
 */
export function usePageSwipe(options: UsePageSwipeOptions): PageSwipeProps {
  let press: Press | undefined;

  return {
    onTouchstart: (event: TouchEvent): void => {
      press = undefined;
      if (!options.enabled() || event.touches.length !== 1) return;
      const touch: Touch | undefined = event.touches[0];
      const target: EventTarget | null = event.target;
      const holder: EventTarget | null = event.currentTarget;
      if (
        touch === undefined ||
        (target instanceof Element &&
          (target.closest(NO_SWIPE_SELECTOR) !== null ||
            (holder instanceof Element && insideSideScroller(target, holder))))
      ) {
        return;
      }
      press = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: event.timeStamp,
      };
    },
    onTouchend: (event: TouchEvent): void => {
      const started: Press | undefined = press;
      if (started === undefined) return;
      const touch: Touch | undefined = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === started.identifier
      );
      // Another finger lifting, or one still down, is not our swipe.
      if (touch === undefined || event.touches.length > 0) return;
      press = undefined;
      const holder: EventTarget | null = event.currentTarget;
      const direction: SwipeDirection | undefined = swipeDirection(
        {
          dx: touch.clientX - started.startX,
          dy: touch.clientY - started.startY,
          durationMs: event.timeStamp - started.startTime,
        },
        {
          rtl:
            holder instanceof Element &&
            getComputedStyle(holder).direction === 'rtl',
        }
      );
      if (direction !== undefined) options.onSwipe(direction);
    },
    onTouchcancel: (): void => {
      press = undefined;
    },
  };
}
