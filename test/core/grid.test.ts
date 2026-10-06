import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  baseColumnSpan,
  fillColumnSpans,
  fillsHeight,
  fillsWidth,
  type GridItem,
} from '../../src/core/grid.js';

function spansOf(
  items: readonly GridItem[],
  columns: number,
  largeSpan?: number
): Record<string, number> {
  return Object.fromEntries(fillColumnSpans(items, columns, largeSpan));
}

void describe('fill helpers', () => {
  void it('maps fill modes to width and height', () => {
    assert.equal(fillsWidth('width'), true);
    assert.equal(fillsWidth('both'), true);
    assert.equal(fillsWidth('height'), false);
    assert.equal(fillsWidth(undefined), false);
    assert.equal(fillsHeight('height'), true);
    assert.equal(fillsHeight('both'), true);
    assert.equal(fillsHeight('width'), false);
    assert.equal(fillsHeight(undefined), false);
  });

  void it('computes base spans from size', () => {
    assert.equal(baseColumnSpan(undefined, 4), 1);
    assert.equal(baseColumnSpan('small', 4), 1);
    assert.equal(baseColumnSpan('large', 4), 2);
    assert.equal(baseColumnSpan('large', 1), 1);
    assert.equal(baseColumnSpan('large', 4, 1), 1);
    assert.equal(baseColumnSpan('full', 4), 4);
  });
});

void describe('fillColumnSpans', () => {
  void it('gives the leftover columns in the last row to a filler', () => {
    const items: GridItem[] = [
      { key: 'a' },
      { key: 'b' },
      { key: 'c' },
      { key: 'd' },
      { key: 'e', fill: 'width' },
    ];
    // 3 columns: a b c / d e -> e takes the one leftover column.
    assert.deepEqual(spansOf(items, 3), { e: 2 });
  });

  void it('accounts for large widgets and wrapping', () => {
    const items: GridItem[] = [
      { key: 'a' },
      { key: 'b', defaultSize: 'large' },
      { key: 'c', defaultSize: 'large', fill: 'width' },
    ];
    // 3 columns: a b b / c c . -> c grows from 2 to 3.
    assert.deepEqual(spansOf(items, 3), { c: 3 });
  });

  void it('shares leftover columns between fillers, earlier first', () => {
    const items: GridItem[] = [
      { key: 'a', fill: 'width' },
      { key: 'b', fill: 'both' },
      { key: 'c' },
    ];
    // 6 columns: leftover 3 -> a gets 2, b gets 1.
    assert.deepEqual(spansOf(items, 6), { a: 3, b: 2 });
  });

  void it('leaves full rows and non-fillers alone', () => {
    const items: GridItem[] = [
      { key: 'a', fill: 'width' },
      { key: 'b' },
      { key: 'c', fill: 'height' },
    ];
    // 3 columns exactly: a keeps 1; 'height' does not fill width.
    assert.deepEqual(spansOf(items, 3), { a: 1 });
  });

  void it('lets a full-width widget take its own row', () => {
    const items: GridItem[] = [
      { key: 'a' },
      { key: 'b', defaultSize: 'full', fill: 'both' },
      { key: 'c', fill: 'width' },
    ];
    assert.deepEqual(spansOf(items, 4), { b: 4, c: 4 });
  });

  void it('handles a single column and bad column counts', () => {
    const items: GridItem[] = [{ key: 'a', fill: 'width' }, { key: 'b' }];
    assert.deepEqual(spansOf(items, 1), { a: 1 });
    assert.deepEqual(spansOf(items, 0), { a: 1 });
    assert.deepEqual(spansOf([], 4), {});
  });

  void it('honours a narrower large span', () => {
    const items: GridItem[] = [
      { key: 'a', defaultSize: 'large' },
      { key: 'b', fill: 'width' },
    ];
    // largeSpan 1 (narrow viewport), 2 columns: a b -> no leftover.
    assert.deepEqual(spansOf(items, 2, 1), { b: 1 });
  });
});
