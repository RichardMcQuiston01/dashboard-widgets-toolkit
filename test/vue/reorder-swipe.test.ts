import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { defineComponent, h, ref, type Ref } from 'vue';

import type { DropPlacement } from '../../src/core/reorder.js';
import type { SwipeDirection } from '../../src/core/swipe.js';
import {
  usePageSwipe,
  usePointerReorder,
  type PageSwipeProps,
  type PointerHandleProps,
  type TabDropStatus,
  type UsePointerReorderResult,
} from '../../src/vue/index.js';
import { mountComponent, settle, type Mounted } from './mount.js';

/* A page with three cards in a row, two page tabs above them, and no DOM. */

interface FakeBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function fakeElement(
  dataName: 'widgetKey' | 'pageKey',
  key: string,
  box: FakeBox
): HTMLElement {
  return {
    dataset: { [dataName]: key },
    getBoundingClientRect: () => ({ ...box, right: 0, bottom: 0 }),
  } as unknown as HTMLElement;
}

function fakeContainer(
  selector: string,
  children: readonly HTMLElement[]
): HTMLElement {
  return {
    querySelector: (query: string) =>
      children.find((child) =>
        query.includes(
          `"${child.dataset['widgetKey'] ?? child.dataset['pageKey'] ?? ''}"`
        )
      ) ?? null,
    querySelectorAll: (query: string) => (query === selector ? children : []),
  } as unknown as HTMLElement;
}

const box = (index: number): FakeBox => ({
  left: index * 110,
  top: 100,
  width: 100,
  height: 100,
});
const CARD_KEYS: readonly string[] = ['a', 'b', 'c'];
const grid: HTMLElement = fakeContainer(
  '[data-widget-key]',
  CARD_KEYS.map((key, index) => fakeElement('widgetKey', key, box(index)))
);
const tabs: HTMLElement = fakeContainer('[data-page-key]', [
  fakeElement('pageKey', 'p1', { left: 0, top: 0, width: 80, height: 30 }),
  fakeElement('pageKey', 'p2', { left: 90, top: 0, width: 80, height: 30 }),
]);

interface Pointer {
  readonly handle: PointerHandleProps;
  readonly captured: number[];
}

function handleFor(result: UsePointerReorderResult, key: string): Pointer {
  const captured: number[] = [];
  return { handle: result.handleProps(key), captured };
}

function pointerEvent(
  captured: number[],
  init: { x: number; y: number; type?: string; button?: number; id?: number }
): PointerEvent {
  return {
    pointerId: init.id ?? 1,
    pointerType: init.type ?? 'mouse',
    button: init.button ?? 0,
    clientX: init.x,
    clientY: init.y,
    preventDefault: () => undefined,
    currentTarget: {
      setPointerCapture: (id: number) => captured.push(id),
      hasPointerCapture: () => true,
      releasePointerCapture: () => undefined,
    },
  } as unknown as PointerEvent;
}

interface Harness {
  readonly result: () => UsePointerReorderResult;
  readonly drops: [string, string][];
  readonly tabDrops: [string, string][];
  readonly events: string[];
  readonly enabled: Ref<boolean>;
  readonly mounted: Mounted;
}

function reorderHarness(
  tabStatus: TabDropStatus | undefined = undefined
): Harness {
  const drops: [string, string][] = [];
  const tabDrops: [string, string][] = [];
  const events: string[] = [];
  const enabled: Ref<boolean> = ref(true);
  let captured: UsePointerReorderResult | undefined;
  const component = defineComponent(() => {
    captured = usePointerReorder({
      enabled: () => enabled.value,
      gridRef: ref(grid),
      placementFor: (dragged, target): DropPlacement | undefined =>
        target === 'b' ? undefined : dragged < target ? 'after' : 'before',
      onDrop: (dragged, target) => drops.push([dragged, target]),
      tabsRef: ref(tabs),
      tabFor: (_dragged, pageKey) => (pageKey === 'p1' ? undefined : tabStatus),
      onDropOnTab: (dragged, pageKey) => tabDrops.push([dragged, pageKey]),
      onStateChange: (event, key) => events.push(`${event}:${key}`),
    });
    return () => h('div');
  });
  const mounted: Mounted = mountComponent(component);
  return {
    result: () => captured as UsePointerReorderResult,
    drops,
    tabDrops,
    events,
    enabled,
    mounted,
  };
}

const globals = globalThis as Record<string, unknown>;
let keydown: ((event: KeyboardEvent) => void) | undefined;
let frame: (() => void) | undefined;
let scrolled: number[] = [];

beforeEach(() => {
  keydown = undefined;
  frame = undefined;
  scrolled = [];
  globals['window'] = {
    scrollY: 0,
    innerHeight: 800,
    scrollBy: (_x: number, y: number) => scrolled.push(y),
    addEventListener: (
      type: string,
      listener: (event: KeyboardEvent) => void
    ) => {
      if (type === 'keydown') keydown = listener;
    },
    removeEventListener: (type: string) => {
      if (type === 'keydown') keydown = undefined;
    },
  };
  globals['CSS'] = { escape: (text: string) => text };
  globals['requestAnimationFrame'] = (callback: () => void) => {
    frame = callback;
    return 1;
  };
  globals['cancelAnimationFrame'] = () => {
    frame = undefined;
  };
});

afterEach(() => {
  for (const name of [
    'window',
    'CSS',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'Element',
    'getComputedStyle',
  ]) {
    delete globals[name];
  }
});

void describe('usePointerReorder', () => {
  void it('drags a card over another and reports the drop', async () => {
    const { result, drops, events, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    assert.deepEqual(captured, [1], 'the handle captures the pointer');
    assert.equal(result().drag.value, undefined, 'a press alone is no drag');

    handle.onPointermove(pointerEvent(captured, { x: 60, y: 150 }));
    assert.equal(result().drag.value?.key, 'a');
    assert.deepEqual(events, ['start:a']);
    assert.equal(result().drag.value?.dx, 10);

    // Over card c: it is the target, and the indicator goes after it.
    handle.onPointermove(pointerEvent(captured, { x: 270, y: 150 }));
    assert.equal(result().drag.value?.targetKey, 'c');
    assert.equal(result().drag.value?.placement, 'after');
    assert.equal(result().drag.value?.dx, 220);

    handle.onPointerup(pointerEvent(captured, { x: 270, y: 150 }));
    assert.deepEqual(drops, [['a', 'c']]);
    assert.deepEqual(events, ['start:a', 'drop:a']);
    assert.equal(result().drag.value, undefined);
    mounted.unmount();
  });

  void it('does not start a drag below the travel threshold', async () => {
    const { result, drops, events, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 52, y: 151 }));
    handle.onPointerup(pointerEvent(captured, { x: 52, y: 151 }));
    assert.equal(result().drag.value, undefined);
    assert.deepEqual([drops, events], [[], []]);
    mounted.unmount();
  });

  void it('puts the card back when released over where it started, or over a refused target', async () => {
    const { result, drops, events, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 70, y: 160 }));
    assert.equal(
      result().drag.value?.targetKey,
      undefined,
      'over its own place'
    );
    handle.onPointermove(pointerEvent(captured, { x: 160, y: 150 }));
    assert.equal(result().drag.value?.targetKey, undefined, 'b refuses a drop');
    handle.onPointerup(pointerEvent(captured, { x: 160, y: 150 }));
    assert.deepEqual(drops, []);
    assert.deepEqual(events, ['start:a', 'cancel:a']);
    mounted.unmount();
  });

  void it('Escape cancels a drag in progress', async () => {
    const { result, drops, events, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 270, y: 150 }));
    assert.ok(keydown, 'a keydown listener is on while dragging');
    let prevented = false;
    keydown({
      key: 'Escape',
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as KeyboardEvent);
    assert.equal(prevented, true);
    assert.equal(result().drag.value, undefined);
    assert.equal(keydown, undefined, 'the listener is removed again');
    handle.onPointerup(pointerEvent(captured, { x: 270, y: 150 }));
    assert.deepEqual(drops, []);
    assert.deepEqual(events, ['start:a', 'cancel:a']);
    mounted.unmount();
  });

  void it('a cancelled pointer aborts the drag', async () => {
    const { result, drops, events, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 270, y: 150 }));
    handle.onPointercancel(pointerEvent(captured, { x: 270, y: 150 }));
    assert.equal(result().drag.value, undefined);
    assert.deepEqual(drops, []);
    assert.deepEqual(events, ['start:a', 'cancel:a']);
    mounted.unmount();
  });

  void it('ignores presses while disabled, other buttons and other pointers', async () => {
    const { result, enabled, events, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    enabled.value = false;
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 270, y: 150 }));
    assert.deepEqual([captured, events], [[], []]);

    enabled.value = true;
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150, button: 2 }));
    assert.deepEqual(captured, [], 'a right click does not drag');

    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150, id: 7 }));
    handle.onPointermove(pointerEvent(captured, { x: 270, y: 150, id: 9 }));
    assert.equal(result().drag.value, undefined, 'another pointer is ignored');
    mounted.unmount();
  });

  void it('dropping on a page tab moves the card there, and says when it is refused', async () => {
    for (const status of ['allowed', 'refused'] as const) {
      const { result, drops, tabDrops, mounted } = reorderHarness(status);
      const { handle, captured } = handleFor(result(), 'a');
      handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
      // Inside tab p2, 8px of slop around it counts too.
      handle.onPointermove(pointerEvent(captured, { x: 130, y: 15 }));
      assert.equal(result().drag.value?.tabKey, 'p2');
      assert.equal(result().drag.value?.tabRefused, status === 'refused');
      assert.equal(result().drag.value?.targetKey, undefined);
      handle.onPointerup(pointerEvent(captured, { x: 130, y: 15 }));
      assert.deepEqual(tabDrops, [['a', 'p2']], status);
      assert.deepEqual(drops, []);
      mounted.unmount();
    }
  });

  void it('the tab the page is already on is not a target', async () => {
    const { result, tabDrops, mounted } = reorderHarness('allowed');
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 40, y: 15 }));
    assert.equal(
      result().drag.value?.tabKey,
      undefined,
      'p1 is the current page'
    );
    handle.onPointerup(pointerEvent(captured, { x: 40, y: 15 }));
    assert.deepEqual(tabDrops, []);
    mounted.unmount();
  });

  void it('scrolls the window near its bottom edge', async () => {
    const { result, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 60, y: 790 }));
    assert.ok(frame, 'a frame was requested');
    frame();
    assert.ok(scrolled.length === 1 && (scrolled[0] ?? 0) > 0, 'scrolled down');
    mounted.unmount();
  });

  void it('a drag never outlives the component', async () => {
    const { result, mounted } = reorderHarness();
    const { handle, captured } = handleFor(result(), 'a');
    handle.onPointerdown(pointerEvent(captured, { x: 50, y: 150 }));
    handle.onPointermove(pointerEvent(captured, { x: 270, y: 150 }));
    assert.ok(keydown);
    mounted.unmount();
    await settle();
    assert.equal(keydown, undefined, 'the keydown listener is removed');
    assert.equal(frame, undefined, 'the scroll frame is cancelled');
  });
});

/* Touch swipe */

class FakeElement {
  scrollWidth = 100;
  clientWidth = 100;
  parentElement: FakeElement | null = null;
  direction = 'ltr';
  closestMatch = false;
  closest(): FakeElement | null {
    return this.closestMatch ? this : null;
  }
}

function swipeHarness(enabled = true): {
  readonly swipes: SwipeDirection[];
  readonly props: PageSwipeProps;
  readonly holder: FakeElement;
  readonly target: FakeElement;
} {
  globals['Element'] = FakeElement;
  globals['getComputedStyle'] = (element: FakeElement) => ({
    direction: element.direction,
    overflowX: 'visible',
  });
  const swipes: SwipeDirection[] = [];
  const holder = new FakeElement();
  const target = new FakeElement();
  target.parentElement = holder;
  const props: PageSwipeProps = usePageSwipe({
    enabled: () => enabled,
    onSwipe: (direction) => swipes.push(direction),
  });
  return { swipes, props, holder, target };
}

function touch(id: number, x: number, y: number): Touch {
  return { identifier: id, clientX: x, clientY: y } as unknown as Touch;
}

function touchEvent(init: {
  touches: Touch[];
  changed?: Touch[];
  target: FakeElement;
  holder: FakeElement;
  time: number;
}): TouchEvent {
  return {
    touches: init.touches,
    changedTouches: init.changed ?? init.touches,
    target: init.target,
    currentTarget: init.holder,
    timeStamp: init.time,
  } as unknown as TouchEvent;
}

function swipe(
  harness: ReturnType<typeof swipeHarness>,
  from: [number, number],
  to: [number, number],
  durationMs = 200
): void {
  const { props, target, holder } = harness;
  props.onTouchstart(
    touchEvent({ touches: [touch(1, ...from)], target, holder, time: 1000 })
  );
  props.onTouchend(
    touchEvent({
      touches: [],
      changed: [touch(1, ...to)],
      target,
      holder,
      time: 1000 + durationMs,
    })
  );
}

void describe('usePageSwipe', () => {
  void it('swiping left is next and swiping right is previous', () => {
    const harness = swipeHarness();
    swipe(harness, [300, 100], [150, 105]);
    swipe(harness, [100, 100], [260, 98]);
    assert.deepEqual(harness.swipes, ['next', 'previous']);
  });

  void it('right-to-left layouts swipe the other way', () => {
    const harness = swipeHarness();
    harness.holder.direction = 'rtl';
    swipe(harness, [300, 100], [150, 105]);
    assert.deepEqual(harness.swipes, ['previous']);
  });

  void it('a short, slow or mostly vertical movement is not a swipe', () => {
    const harness = swipeHarness();
    swipe(harness, [300, 100], [280, 100]);
    swipe(harness, [300, 100], [100, 100], 1500);
    swipe(harness, [300, 100], [200, 400]);
    assert.deepEqual(harness.swipes, []);
  });

  void it('does nothing while disabled', () => {
    const harness = swipeHarness(false);
    swipe(harness, [300, 100], [100, 100]);
    assert.deepEqual(harness.swipes, []);
  });

  void it('a swipe never starts on a control or a drag handle', () => {
    const harness = swipeHarness();
    harness.target.closestMatch = true;
    swipe(harness, [300, 100], [100, 100]);
    assert.deepEqual(harness.swipes, []);
  });

  void it('a swipe never starts in a table that scrolls sideways', () => {
    const harness = swipeHarness();
    harness.target.scrollWidth = 400;
    globals['getComputedStyle'] = (element: FakeElement) => ({
      direction: element.direction,
      overflowX: element === harness.target ? 'auto' : 'visible',
    });
    swipe(harness, [300, 100], [100, 100]);
    assert.deepEqual(harness.swipes, []);
  });

  void it('a second finger, or a cancelled touch, ends the swipe', () => {
    const harness = swipeHarness();
    const { props, target, holder } = harness;
    props.onTouchstart(
      touchEvent({
        touches: [touch(1, 300, 100), touch(2, 310, 100)],
        target,
        holder,
        time: 1000,
      })
    );
    props.onTouchend(
      touchEvent({
        touches: [],
        changed: [touch(1, 100, 100)],
        target,
        holder,
        time: 1200,
      })
    );
    assert.deepEqual(harness.swipes, [], 'two fingers down is no swipe');

    props.onTouchstart(
      touchEvent({ touches: [touch(1, 300, 100)], target, holder, time: 2000 })
    );
    props.onTouchcancel();
    props.onTouchend(
      touchEvent({
        touches: [],
        changed: [touch(1, 100, 100)],
        target,
        holder,
        time: 2200,
      })
    );
    assert.deepEqual(harness.swipes, []);
  });
});
