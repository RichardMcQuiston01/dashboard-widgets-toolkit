import { useCallback, useRef, type TouchEvent as ReactTouchEvent } from 'react';

import { swipeDirection, type SwipeDirection } from '../core/swipe.js';

/**
 * Elements a swipe never starts on: they have their own use for a touch and
 * drag (a handle, a slider, a text field, a dialog).
 */
const NO_SWIPE_SELECTOR =
  'button, a[href], input, select, textarea, summary, dialog, [role="slider"], [contenteditable="true"], [data-dwt-no-swipe], .dwt-drag-handle';

export interface UsePageSwipeOptions {
  readonly enabled: boolean;
  /** Called with the direction of a completed swipe. */
  readonly onSwipe: (direction: SwipeDirection) => void;
}

/** Touch handlers to spread on the element that holds the page. */
export interface PageSwipeProps {
  readonly onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void;
  readonly onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => void;
  readonly onTouchCancel: (event: ReactTouchEvent<HTMLElement>) => void;
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
export function usePageSwipe({
  enabled,
  onSwipe,
}: UsePageSwipeOptions): PageSwipeProps {
  const press = useRef<Press | undefined>(undefined);
  const latest = useRef(onSwipe);
  latest.current = onSwipe;

  const onTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>): void => {
      press.current = undefined;
      if (!enabled || event.touches.length !== 1) return;
      const touch: ReactTouchEvent['touches'][number] | undefined =
        event.touches[0];
      const target: EventTarget = event.target;
      if (
        touch === undefined ||
        (target instanceof Element &&
          (target.closest(NO_SWIPE_SELECTOR) !== null ||
            insideSideScroller(target, event.currentTarget)))
      ) {
        return;
      }
      press.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: event.timeStamp,
      };
    },
    [enabled]
  );

  const onTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>): void => {
      const started: Press | undefined = press.current;
      if (started === undefined) return;
      const touch: ReactTouchEvent['changedTouches'][number] | undefined =
        Array.from(event.changedTouches).find(
          (candidate) => candidate.identifier === started.identifier
        );
      // Another finger lifting, or one still down, is not our swipe.
      if (touch === undefined || event.touches.length > 0) return;
      press.current = undefined;
      const direction: SwipeDirection | undefined = swipeDirection(
        {
          dx: touch.clientX - started.startX,
          dy: touch.clientY - started.startY,
          durationMs: event.timeStamp - started.startTime,
        },
        { rtl: getComputedStyle(event.currentTarget).direction === 'rtl' }
      );
      if (direction !== undefined) latest.current(direction);
    },
    []
  );

  const onTouchCancel = useCallback((): void => {
    press.current = undefined;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
