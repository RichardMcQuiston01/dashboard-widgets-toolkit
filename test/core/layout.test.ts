import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_LAYOUT,
  hiddenWidgets,
  hideWidget,
  minimizeWidget,
  moveWidget,
  moveWidgetDown,
  moveWidgetUp,
  parseLayout,
  pruneLayout,
  restoreWidget,
  serializeLayout,
  showWidget,
  toggleHidden,
  toggleMinimized,
  visibleWidgets,
  type DashboardLayout,
  type LayoutItem,
} from '../../src/core/layout.js';

const definitions: LayoutItem[] = [
  { key: 'a', sortOrder: 10 },
  { key: 'b', sortOrder: 20 },
  { key: 'c', sortOrder: 30 },
];
const keys = (items: readonly LayoutItem[]): string[] =>
  items.map((d) => d.key);

void describe('parseLayout', () => {
  void it('returns the empty layout for missing or corrupt input', () => {
    assert.equal(parseLayout(null), EMPTY_LAYOUT);
    assert.equal(parseLayout(undefined), EMPTY_LAYOUT);
    assert.equal(parseLayout('not json'), EMPTY_LAYOUT);
    assert.equal(parseLayout('[1,2]'), EMPTY_LAYOUT);
    assert.equal(parseLayout('42'), EMPTY_LAYOUT);
    assert.equal(parseLayout('{"order": "wrong"}'), EMPTY_LAYOUT);
  });

  void it('parses a stored layout string or object', () => {
    const expected = { order: ['b'], hidden: ['c'], minimized: [] };
    assert.deepEqual(
      parseLayout('{"order":["b"],"hidden":["c"],"minimized":[]}'),
      expected
    );
    assert.deepEqual(parseLayout({ order: ['b'], hidden: ['c'] }), expected);
  });

  void it('drops non-string, empty and duplicate keys, keeps the good fields', () => {
    assert.deepEqual(
      parseLayout({
        order: ['a', 3, 'a', '', null, 'b'],
        hidden: 'x',
        minimized: ['c'],
      }),
      { order: ['a', 'b'], hidden: [], minimized: ['c'] }
    );
  });

  void it('round-trips through serializeLayout', () => {
    const layout: DashboardLayout = {
      order: ['c', 'a'],
      hidden: ['b'],
      minimized: ['a'],
    };
    assert.deepEqual(parseLayout(serializeLayout(layout)), layout);
  });
});

void describe('visibleWidgets', () => {
  void it('uses sort order when no layout is saved', () => {
    assert.deepEqual(keys(visibleWidgets(definitions, EMPTY_LAYOUT)), [
      'a',
      'b',
      'c',
    ]);
    const shuffled = [definitions[2]!, definitions[0]!, definitions[1]!];
    assert.deepEqual(keys(visibleWidgets(shuffled, EMPTY_LAYOUT)), [
      'a',
      'b',
      'c',
    ]);
  });

  void it('applies saved order and appends new widgets by sort order', () => {
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, order: ['c', 'gone'] };
    const withNew = [...definitions, { key: 'd', sortOrder: 5 }];
    assert.deepEqual(keys(visibleWidgets(withNew, layout)), [
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  void it('keeps definition order for equal or missing sort orders', () => {
    const items: LayoutItem[] = [
      { key: 'x' },
      { key: 'y' },
      { key: 'z', sortOrder: 0 },
    ];
    assert.deepEqual(keys(visibleWidgets(items, EMPTY_LAYOUT)), [
      'x',
      'y',
      'z',
    ]);
  });

  void it('excludes hidden widgets and lists them separately', () => {
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, hidden: ['b'] };
    assert.deepEqual(keys(visibleWidgets(definitions, layout)), ['a', 'c']);
    assert.deepEqual(keys(hiddenWidgets(definitions, layout)), ['b']);
  });
});

void describe('moveWidget', () => {
  void it('moves a widget to a new position', () => {
    assert.deepEqual(moveWidget(definitions, EMPTY_LAYOUT, 'c', 0).order, [
      'c',
      'a',
      'b',
    ]);
  });

  void it('returns the same layout for out-of-range or unknown targets', () => {
    assert.equal(moveWidget(definitions, EMPTY_LAYOUT, 'a', 5), EMPTY_LAYOUT);
    assert.equal(moveWidget(definitions, EMPTY_LAYOUT, 'a', -1), EMPTY_LAYOUT);
    assert.equal(moveWidget(definitions, EMPTY_LAYOUT, 'a', 1.5), EMPTY_LAYOUT);
    assert.equal(
      moveWidget(definitions, EMPTY_LAYOUT, 'missing', 0),
      EMPTY_LAYOUT
    );
    assert.equal(moveWidget(definitions, EMPTY_LAYOUT, 'a', 0), EMPTY_LAYOUT);
  });

  void it('moves within the visible order only', () => {
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, hidden: ['a'] };
    assert.equal(moveWidget(definitions, layout, 'a', 0), layout);
    assert.deepEqual(moveWidget(definitions, layout, 'c', 0).order, ['c', 'b']);
  });

  void it('moves up and down one place, clamped at the ends', () => {
    assert.deepEqual(moveWidgetUp(definitions, EMPTY_LAYOUT, 'b').order, [
      'b',
      'a',
      'c',
    ]);
    assert.deepEqual(moveWidgetDown(definitions, EMPTY_LAYOUT, 'b').order, [
      'a',
      'c',
      'b',
    ]);
    assert.equal(moveWidgetUp(definitions, EMPTY_LAYOUT, 'a'), EMPTY_LAYOUT);
    assert.equal(moveWidgetDown(definitions, EMPTY_LAYOUT, 'c'), EMPTY_LAYOUT);
  });
});

void describe('hide, show, minimize, restore', () => {
  void it('hides and restores a widget', () => {
    const hidden = toggleHidden(EMPTY_LAYOUT, 'a');
    assert.deepEqual(hidden.hidden, ['a']);
    assert.deepEqual(toggleHidden(hidden, 'a').hidden, []);
    assert.equal(hideWidget(hidden, 'a'), hidden);
    assert.equal(showWidget(EMPTY_LAYOUT, 'a'), EMPTY_LAYOUT);
  });

  void it('showing a hidden widget clears its minimized state', () => {
    const layout = toggleHidden(
      { ...EMPTY_LAYOUT, minimized: ['a'], hidden: ['a'] },
      'a'
    );
    assert.deepEqual(layout.minimized, []);
  });

  void it('toggles minimized state', () => {
    const minimized = toggleMinimized(EMPTY_LAYOUT, 'b');
    assert.deepEqual(minimized.minimized, ['b']);
    assert.deepEqual(toggleMinimized(minimized, 'b').minimized, []);
    assert.equal(minimizeWidget(minimized, 'b'), minimized);
    assert.equal(restoreWidget(EMPTY_LAYOUT, 'b'), EMPTY_LAYOUT);
  });

  void it('never mutates the input layout', () => {
    const layout: DashboardLayout = { order: ['a'], hidden: [], minimized: [] };
    const snapshot = JSON.stringify(layout);
    hideWidget(layout, 'b');
    minimizeWidget(layout, 'a');
    moveWidget(definitions, layout, 'c', 0);
    assert.equal(JSON.stringify(layout), snapshot);
  });
});

void describe('pruneLayout', () => {
  void it('drops keys for widgets that no longer exist', () => {
    const layout: DashboardLayout = {
      order: ['a', 'x'],
      hidden: ['y'],
      minimized: ['b'],
    };
    assert.deepEqual(pruneLayout(definitions, layout), {
      order: ['a'],
      hidden: [],
      minimized: ['b'],
    });
  });

  void it('returns the same object when nothing is stale', () => {
    const layout: DashboardLayout = {
      order: ['a'],
      hidden: ['b'],
      minimized: [],
    };
    assert.equal(pruneLayout(definitions, layout), layout);
  });
});
