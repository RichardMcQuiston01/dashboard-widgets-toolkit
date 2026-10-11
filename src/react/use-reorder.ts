import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import {
  autoScrollStep,
  dropTargetKey,
  type CardBox,
  type DropPlacement,
} from '../core/reorder.js';

/** Pixels the pointer must travel before a press on a handle becomes a drag. */
export const DRAG_START_DISTANCE_PX = 4;

/** What the dashboard renders while a card is being dragged with a pointer. */
export interface PointerDragState {
  /** The widget being dragged. */
  readonly key: string;
  /** How far the card is drawn from its place, in pixels. */
  readonly dx: number;
  readonly dy: number;
  /** The card it would drop onto, and where the indicator goes. */
  readonly targetKey?: string;
  readonly placement?: DropPlacement;
}

export interface UsePointerReorderOptions {
  readonly enabled: boolean;
  /** The element that contains the cards (`[data-widget-key]` children). */
  readonly gridRef: RefObject<HTMLElement | null>;
  /**
   * Whether `draggedKey` may drop onto `targetKey`, and where the indicator
   * goes. Return undefined for a drop that is not allowed (a pinned slot).
   */
  readonly placementFor: (
    draggedKey: string,
    targetKey: string
  ) => DropPlacement | undefined;
  /** Called on release over an allowed target. */
  readonly onDrop: (draggedKey: string, targetKey: string) => void;
  /** Called when a drag starts moving, ends, or is cancelled. */
  readonly onStateChange?: (
    event: 'start' | 'drop' | 'cancel',
    key: string
  ) => void;
}

export interface UsePointerReorderResult {
  readonly drag: PointerDragState | undefined;
  /**
   * Pointer handlers for a card's drag handle. Spread them on the handle
   * `<button>` (give it `touch-action: none`, which `.dwt-drag-handle` does).
   */
  readonly handleProps: (key: string) => {
    readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
}

interface Session {
  readonly key: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startScrollY: number;
  active: boolean;
  origin: CardBox | undefined;
  /** The allowed drop target for the pointer's last position. */
  targetKey: string | undefined;
  x: number;
  y: number;
}

function boxOf(element: Element, key: string): CardBox {
  const rect: DOMRect = element.getBoundingClientRect();
  return {
    key,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Every card in the grid, in document order. */
function cardBoxes(grid: HTMLElement): CardBox[] {
  const boxes: CardBox[] = [];
  grid.querySelectorAll<HTMLElement>('[data-widget-key]').forEach((card) => {
    const key: string | undefined = card.dataset['widgetKey'];
    if (key !== undefined) boxes.push(boxOf(card, key));
  });
  return boxes;
}

/**
 * Pointer (mouse, pen and touch) reordering of cards by their drag handle.
 * The dragged card follows the pointer (a CSS transform, so nothing else
 * reflows), the card it would drop onto gets an indicator, the window scrolls
 * near its top and bottom edges, and Escape or a cancelled pointer aborts.
 * The hook decides nothing about the layout: it reports the drop.
 */
export function usePointerReorder({
  enabled,
  gridRef,
  placementFor,
  onDrop,
  onStateChange,
}: UsePointerReorderOptions): UsePointerReorderResult {
  const [drag, setDrag] = useState<PointerDragState | undefined>(undefined);
  const session = useRef<Session | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const latest = useRef({ placementFor, onDrop, onStateChange });
  latest.current = { placementFor, onDrop, onStateChange };

  const stopScrolling = useCallback((): void => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);

  /** Re-measures and updates what the drag shows for the current pointer. */
  const refresh = useCallback((): void => {
    const current: Session | undefined = session.current;
    const grid: HTMLElement | null = gridRef.current;
    if (current === undefined || !current.active || grid === null) return;
    const boxes: CardBox[] = cardBoxes(grid);
    const target: string | undefined = dropTargetKey(
      boxes,
      current.key,
      { x: current.x, y: current.y },
      current.origin
    );
    const placement: DropPlacement | undefined =
      target === undefined
        ? undefined
        : latest.current.placementFor(current.key, target);
    current.targetKey =
      placement === undefined || target === undefined ? undefined : target;
    setDrag({
      key: current.key,
      dx: current.x - current.startX,
      dy: current.y - current.startY + (window.scrollY - current.startScrollY),
      ...(placement === undefined || target === undefined
        ? {}
        : { targetKey: target, placement }),
    });
  }, [gridRef]);

  const finish = useCallback(
    (outcome: 'drop' | 'cancel'): void => {
      const current: Session | undefined = session.current;
      session.current = undefined;
      stopScrolling();
      if (current === undefined) return;
      if (!current.active) return;
      setDrag(undefined);
      if (outcome === 'drop' && current.targetKey !== undefined) {
        latest.current.onDrop(current.key, current.targetKey);
        latest.current.onStateChange?.('drop', current.key);
      } else {
        latest.current.onStateChange?.('cancel', current.key);
      }
    },
    [stopScrolling]
  );

  const scrollLoop = useCallback((): void => {
    frame.current = undefined;
    const current: Session | undefined = session.current;
    if (current === undefined || !current.active) return;
    const step: number = autoScrollStep(current.y, window.innerHeight);
    if (step !== 0) {
      window.scrollBy(0, step);
      refresh();
      frame.current = requestAnimationFrame(scrollLoop);
    }
  }, [refresh]);

  // Escape cancels a drag in progress.
  const dragging: boolean = drag !== undefined;
  useEffect(() => {
    if (!dragging) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('cancel');
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, finish]);

  // A drag never outlives the hook.
  useEffect(
    () => () => {
      session.current = undefined;
      stopScrolling();
    },
    [stopScrolling]
  );

  const handleProps = useCallback(
    (key: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>): void => {
        if (!enabled || session.current !== undefined) return;
        // Mouse: the main button only. Touch and pen have button 0 too.
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        session.current = {
          key,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startScrollY: window.scrollY,
          active: false,
          origin: undefined,
          targetKey: undefined,
          x: event.clientX,
          y: event.clientY,
        };
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>): void => {
        const current: Session | undefined = session.current;
        if (current === undefined || current.pointerId !== event.pointerId) {
          return;
        }
        current.x = event.clientX;
        current.y = event.clientY;
        if (!current.active) {
          const travelled: number = Math.hypot(
            current.x - current.startX,
            current.y - current.startY
          );
          if (travelled < DRAG_START_DISTANCE_PX) return;
          const card: Element | null | undefined =
            gridRef.current?.querySelector(
              `[data-widget-key="${CSS.escape(key)}"]`
            );
          current.active = true;
          current.origin = card == null ? undefined : boxOf(card, key);
          latest.current.onStateChange?.('start', key);
        }
        event.preventDefault();
        refresh();
        if (frame.current === undefined) {
          frame.current = requestAnimationFrame(scrollLoop);
        }
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>): void => {
        const current: Session | undefined = session.current;
        if (current === undefined || current.pointerId !== event.pointerId) {
          return;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finish('drop');
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>): void => {
        const current: Session | undefined = session.current;
        if (current === undefined || current.pointerId !== event.pointerId) {
          return;
        }
        finish('cancel');
      },
    }),
    [enabled, finish, gridRef, refresh, scrollLoop]
  );

  return { drag, handleProps };
}
