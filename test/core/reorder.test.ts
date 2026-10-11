import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_LAYOUT, visibleWidgets } from '../../src/core/layout.js';
import type { DashboardLayout, LayoutItem } from '../../src/core/layout.js';
import {
  autoScrollStep,
  dropPlacement,
  dropTargetKey,
  listPosition,
  reorderOnto,
  type CardBox,
} from '../../src/core/reorder.js';

const defs: LayoutItem[] = [
  { key: 'a', sortOrder: 10 },
  { key: 'b', sortOrder: 20 },
  { key: 'c', sortOrder: 30 },
  { key: 'd', sortOrder: 40 },
];

function order(layout: DashboardLayout): string {
  return visibleWidgets(defs, layout)
    .map((d) => d.key)
    .join('');
}

// A 2 x 2 grid of 100 x 100 cards with 10px gaps.
const boxes: CardBox[] = [
  { key: 'a', left: 0, top: 0, width: 100, height: 100 },
  { key: 'b', left: 110, top: 0, width: 100, height: 100 },
  { key: 'c', left: 0, top: 110, width: 100, height: 100 },
  { key: 'd', left: 110, top: 110, width: 100, height: 100 },
];

void describe('dropTargetKey', () => {
  const origin: CardBox = boxes[0] as CardBox;

  void it('picks the card under the pointer', () => {
    assert.equal(dropTargetKey(boxes, 'a', { x: 150, y: 150 }, origin), 'd');
  });

  void it('picks the nearest card when the pointer is in a gap or outside', () => {
    assert.equal(dropTargetKey(boxes, 'a', { x: 105, y: 40 }, origin), 'b');
    assert.equal(dropTargetKey(boxes, 'a', { x: 300, y: 300 }, origin), 'd');
    assert.equal(dropTargetKey(boxes, 'a', { x: -50, y: 160 }, origin), 'c');
  });

  void it('has no target inside the dragged card origin, and never targets itself', () => {
    assert.equal(
      dropTargetKey(boxes, 'a', { x: 50, y: 50 }, origin),
      undefined
    );
    // Without an origin the dragged card is skipped, so the next nearest wins.
    assert.equal(dropTargetKey(boxes, 'a', { x: 50, y: 50 }), 'b');
    assert.equal(dropTargetKey([origin], 'a', { x: 500, y: 0 }), undefined);
    assert.equal(dropTargetKey([], 'a', { x: 0, y: 0 }), undefined);
  });
});

void describe('reorderOnto and dropPlacement', () => {
  void it('puts the dragged widget in the target slot', () => {
    assert.equal(order(reorderOnto(defs, EMPTY_LAYOUT, 'a', 'c')), 'bcad');
    assert.equal(order(reorderOnto(defs, EMPTY_LAYOUT, 'd', 'b')), 'adbc');
  });

  void it('places the indicator after when moving later, before when earlier', () => {
    assert.equal(dropPlacement(defs, EMPTY_LAYOUT, 'a', 'c'), 'after');
    assert.equal(dropPlacement(defs, EMPTY_LAYOUT, 'd', 'b'), 'before');
    assert.equal(dropPlacement(defs, EMPTY_LAYOUT, 'a', 'a'), undefined);
    assert.equal(dropPlacement(defs, EMPTY_LAYOUT, 'a', 'zzz'), undefined);
  });

  void it('returns the same layout for unknown keys and for pinned widgets', () => {
    assert.equal(reorderOnto(defs, EMPTY_LAYOUT, 'a', 'zzz'), EMPTY_LAYOUT);
    assert.equal(reorderOnto(defs, EMPTY_LAYOUT, 'a', 'a'), EMPTY_LAYOUT);
    const pinned: LayoutItem[] = [
      { key: 'a', sortOrder: 10, locked: { move: true } },
      { key: 'b', sortOrder: 20 },
      { key: 'c', sortOrder: 30 },
    ];
    assert.equal(reorderOnto(pinned, EMPTY_LAYOUT, 'c', 'a'), EMPTY_LAYOUT);
    assert.equal(reorderOnto(pinned, EMPTY_LAYOUT, 'a', 'c'), EMPTY_LAYOUT);
    assert.notEqual(reorderOnto(pinned, EMPTY_LAYOUT, 'c', 'b'), EMPTY_LAYOUT);
  });

  void it('skips hidden widgets when counting the target slot', () => {
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, hidden: ['b'] };
    // Visible order is a c d, so dropping a onto c gives c a d.
    assert.deepEqual(
      visibleWidgets(defs, reorderOnto(defs, layout, 'a', 'c')).map(
        (d) => d.key
      ),
      ['c', 'a', 'd']
    );
  });
});

void describe('listPosition', () => {
  void it('is 1-based among the visible widgets', () => {
    assert.deepEqual(listPosition(defs, EMPTY_LAYOUT, 'c'), {
      position: 3,
      total: 4,
    });
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, hidden: ['a'] };
    assert.deepEqual(listPosition(defs, layout, 'c'), {
      position: 2,
      total: 3,
    });
    assert.equal(listPosition(defs, layout, 'a'), undefined);
  });
});

void describe('autoScrollStep', () => {
  void it('is 0 away from the edges', () => {
    assert.equal(autoScrollStep(400, 800), 0);
  });

  void it('scrolls up near the top and down near the bottom, faster closer in', () => {
    assert.ok(autoScrollStep(40, 800) < 0);
    assert.ok(autoScrollStep(10, 800) < autoScrollStep(40, 800));
    assert.ok(autoScrollStep(760, 800) > 0);
    assert.ok(autoScrollStep(795, 800) > autoScrollStep(760, 800));
    assert.equal(autoScrollStep(-500, 800), -20);
    assert.equal(autoScrollStep(2000, 800), 20);
  });

  void it('does nothing for a degenerate viewport', () => {
    assert.equal(autoScrollStep(0, 0), 0);
  });
});
