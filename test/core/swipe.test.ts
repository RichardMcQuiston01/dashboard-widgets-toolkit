import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SWIPE_MAX_DURATION_MS,
  SWIPE_MIN_DISTANCE_PX,
  adjacentPageKey,
  swipeDirection,
} from '../../src/core/swipe.js';

void describe('swipeDirection', () => {
  void it('swiping left shows the next page, right the previous', () => {
    assert.equal(swipeDirection({ dx: -120, dy: 4, durationMs: 200 }), 'next');
    assert.equal(
      swipeDirection({ dx: 120, dy: -4, durationMs: 200 }),
      'previous'
    );
  });

  void it('flips for right-to-left layouts', () => {
    assert.equal(
      swipeDirection({ dx: 120, dy: 0, durationMs: 200 }, { rtl: true }),
      'next'
    );
    assert.equal(
      swipeDirection({ dx: -120, dy: 0, durationMs: 200 }, { rtl: true }),
      'previous'
    );
  });

  void it('ignores a short movement, with the boundary counted', () => {
    assert.equal(
      swipeDirection({
        dx: -(SWIPE_MIN_DISTANCE_PX - 1),
        dy: 0,
        durationMs: 100,
      }),
      undefined
    );
    assert.equal(
      swipeDirection({ dx: -SWIPE_MIN_DISTANCE_PX, dy: 0, durationMs: 100 }),
      'next'
    );
  });

  void it('ignores a mostly vertical gesture (a scroll)', () => {
    assert.equal(
      swipeDirection({ dx: -80, dy: 70, durationMs: 200 }),
      undefined
    );
    assert.equal(swipeDirection({ dx: -90, dy: 40, durationMs: 200 }), 'next');
  });

  void it('ignores a press held too long', () => {
    assert.equal(
      swipeDirection({
        dx: -200,
        dy: 0,
        durationMs: SWIPE_MAX_DURATION_MS + 1,
      }),
      undefined
    );
  });

  void it('ignores numbers that are not finite', () => {
    assert.equal(
      swipeDirection({ dx: Number.NaN, dy: 0, durationMs: 100 }),
      undefined
    );
  });
});

void describe('adjacentPageKey', () => {
  const pages = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

  void it('moves one page in either direction', () => {
    assert.equal(adjacentPageKey(pages, 'b', 'next'), 'c');
    assert.equal(adjacentPageKey(pages, 'b', 'previous'), 'a');
  });

  void it('does not wrap past the ends', () => {
    assert.equal(adjacentPageKey(pages, 'c', 'next'), undefined);
    assert.equal(adjacentPageKey(pages, 'a', 'previous'), undefined);
  });

  void it('lands nowhere from an unknown page', () => {
    assert.equal(adjacentPageKey(pages, 'zzz', 'next'), undefined);
  });
});
