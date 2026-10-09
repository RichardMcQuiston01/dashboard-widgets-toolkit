import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fitCount, placeRows, type GridItem } from '../../src/core/grid.js';
import {
  EMPTY_LAYOUT,
  enforceLocks,
  parseLayout,
  pruneLayout,
  serializeLayout,
  type DashboardLayout,
} from '../../src/core/layout.js';
import {
  addPage,
  assignPages,
  DEFAULT_PAGE_KEY,
  hasPages,
  movePage,
  moveWidgetToPage,
  normalizeLayout,
  pageLayout,
  pageList,
  pageOf,
  pageRoom,
  pageWidgets,
  removePage,
  renamePage,
  resolvePageKey,
  withPageLayout,
  type PageItem,
} from '../../src/core/pages.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';

const widget = (
  key: string,
  width: number,
  extra: Partial<PageItem> = {}
): PageItem => ({ key, title: key.toUpperCase(), width, ...extra });
const keys = (items: readonly { readonly key: string }[]): string[] =>
  items.map((i) => i.key);
const page = (
  key: string,
  title: string,
  order: string[] = [],
  extra: Record<string, unknown> = {}
) => ({ key, title, order, hidden: [], minimized: [], ...extra });
const paged = (...pages: ReturnType<typeof page>[]): DashboardLayout => ({
  order: [],
  hidden: [],
  minimized: [],
  pages,
});

void describe('placeRows and fitCount', () => {
  void it('starts a new row for a widget that does not fit, whole', () => {
    const items: GridItem[] = [
      { key: 'a', width: 8 },
      { key: 'b', width: 6 },
      { key: 'c', width: 4 },
    ];
    const rows = placeRows(items);
    assert.deepEqual(
      rows.map((r) => r.keys),
      [['a'], ['b', 'c']]
    );
  });

  void it('needs seven rows for seven 7-wide widgets', () => {
    const items: GridItem[] = Array.from({ length: 7 }, (_, i) => ({
      key: `w${i}`,
      width: 7,
    }));
    assert.equal(placeRows(items).length, 7);
  });

  void it('lets flexible widgets grow without adding a row', () => {
    const items: GridItem[] = [
      { key: 'a', width: 5, fill: 'width' },
      { key: 'b', width: 4 },
      { key: 'c', width: 6 },
    ];
    const rows = placeRows(items);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0]?.spans, [8, 4]);
    assert.deepEqual(rows[1]?.spans, [6]);
  });

  void it('counts how many leading items fit in the rows', () => {
    const items: GridItem[] = [
      { key: 'a', width: 12 },
      { key: 'b', width: 12 },
      { key: 'c', width: 6 },
      { key: 'd', width: 6 },
      { key: 'e', width: 12 },
    ];
    assert.equal(fitCount(items, 2), 2);
    assert.equal(fitCount(items, 3), 4);
    assert.equal(fitCount(items, 9), 5);
    assert.equal(fitCount([], 4), 0);
  });
});

void describe('parseLayout and serializeLayout with pages', () => {
  void it('keeps the bytes of an unpaged layout', () => {
    const layout: DashboardLayout = {
      order: ['a'],
      hidden: ['b'],
      minimized: [],
    };
    assert.equal(
      serializeLayout(layout),
      '{"order":["a"],"hidden":["b"],"minimized":[]}'
    );
    assert.equal(hasPages(parseLayout(serializeLayout(layout))), false);
  });

  void it('round-trips pages', () => {
    const layout = paged(
      page('p1', 'Sales', ['a', 'b']),
      page('p2', 'Stock', ['c'], { maxRows: 2 })
    );
    assert.deepEqual(parseLayout(serializeLayout(layout)), layout);
  });

  void it('leaves the top-level lists empty and drops bad pages', () => {
    const parsed = parseLayout({
      order: ['x'],
      pages: [
        page('p1', '  Sales  ', ['a', 'b']),
        { key: 'p1', title: 'Duplicate key' },
        page('p2', '', ['b', 'c'], { maxRows: 99 }),
        'nonsense',
        { title: 'No key' },
      ],
    });
    assert.deepEqual(parsed.order, []);
    assert.deepEqual(
      parsed.pages?.map((p) => [p.key, p.title, p.order, p.maxRows]),
      [
        ['p1', 'Sales', ['a', 'b'], undefined],
        ['p2', 'Page 2', ['c'], undefined],
      ]
    );
  });

  void it('cuts long titles and keeps a widget on the first page that has it', () => {
    const parsed = parseLayout({
      pages: [
        page('p1', 'x'.repeat(50), ['a']),
        { key: 'p2', title: 'Two', order: ['a', 'b'], hidden: ['a'] },
      ],
    });
    assert.equal(parsed.pages?.[0]?.title.length, 30);
    assert.deepEqual(parsed.pages?.[1]?.order, ['b']);
    assert.deepEqual(parsed.pages?.[1]?.hidden, []);
  });

  void it('ignores pages that are not a list', () => {
    assert.equal(hasPages(parseLayout({ pages: 'x', order: ['a'] })), false);
    assert.equal(hasPages(parseLayout({ pages: [] })), false);
  });
});

void describe('pageList, pageLayout and withPageLayout', () => {
  void it('treats an unpaged layout as one implicit page', () => {
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, order: ['a'] };
    assert.equal(pageList(layout)[0]?.key, DEFAULT_PAGE_KEY);
    assert.equal(pageLayout(layout, DEFAULT_PAGE_KEY), layout);
    assert.equal(pageLayout(layout, 'other'), undefined);
    const next = { ...layout, order: ['b'] };
    assert.deepEqual(withPageLayout(layout, DEFAULT_PAGE_KEY, next).order, [
      'b',
    ]);
    assert.equal(withPageLayout(layout, DEFAULT_PAGE_KEY, layout), layout);
  });

  void it('reads and writes one page of a paged layout', () => {
    const layout = paged(page('p1', 'A', ['a']), page('p2', 'B', ['b']));
    const view = pageLayout(layout, 'p2');
    assert.deepEqual(view?.order, ['b']);
    assert.equal(view?.pages, undefined);
    const changed = withPageLayout(layout, 'p2', {
      ...(view as DashboardLayout),
      hidden: ['b'],
    });
    assert.deepEqual(changed.pages?.[1]?.hidden, ['b']);
    assert.deepEqual(changed.pages?.[0], layout.pages?.[0]);
    assert.equal(withPageLayout(layout, 'p2', view as DashboardLayout), layout);
    assert.equal(
      withPageLayout(layout, 'zzz', view as DashboardLayout),
      layout
    );
  });
});

void describe('assignPages', () => {
  const defs: PageItem[] = [
    widget('a', 6, { sortOrder: 1 }),
    widget('b', 6, { sortOrder: 2, page: 'Stock' }),
    widget('c', 6, { sortOrder: 3 }),
    widget('pin', 6, { sortOrder: 4, page: 'p2', locked: { move: true } }),
  ];
  const layout = paged(page('p1', 'Sales', ['c']), page('p2', 'Stock', []));

  void it('uses the listing page, then the home page, then the first', () => {
    const assigned = assignPages(defs, layout);
    assert.deepEqual(keys(assigned.get('p1') ?? []), ['a', 'c']);
    assert.deepEqual(keys(assigned.get('p2') ?? []), ['b', 'pin']);
    assert.equal(pageOf(defs, layout, 'b'), 'p2');
    assert.equal(pageOf(defs, layout, 'nope'), undefined);
  });

  void it('keeps a widget locked against moving on its home page', () => {
    const moved = paged(page('p1', 'Sales', ['pin']), page('p2', 'Stock'));
    assert.equal(pageOf(defs, moved, 'pin'), 'p2');
  });

  void it('resolves page references by key or title, ignoring case', () => {
    assert.equal(resolvePageKey(layout, 'p2'), 'p2');
    assert.equal(resolvePageKey(layout, ' stock '), 'p2');
    assert.equal(resolvePageKey(layout, 'Nope'), undefined);
  });

  void it('puts everything on the implicit page of an unpaged layout', () => {
    const assigned = assignPages(defs, EMPTY_LAYOUT);
    assert.deepEqual(keys(assigned.get(DEFAULT_PAGE_KEY) ?? []), keys(defs));
  });
});

void describe('page room', () => {
  const defs = [widget('a', 12), widget('b', 12), widget('c', 12)];

  void it('reports rows used and free, including minimized widgets', () => {
    const layout: DashboardLayout = paged(page('p1', 'A', ['a', 'b', 'c']));
    assert.deepEqual(pageRoom(defs, layout, 'p1'), {
      maxRows: 4,
      rowsUsed: 3,
      rowsFree: 1,
    });
    const minimized: DashboardLayout = paged(
      page('p1', 'A', ['a', 'b', 'c'], { minimized: ['a'] })
    );
    assert.equal(pageRoom(defs, minimized, 'p1')?.rowsUsed, 3);
  });

  void it('does not count hidden widgets and honors a page maxRows', () => {
    const layout: DashboardLayout = paged(
      page('p1', 'A', ['a', 'b'], { hidden: ['c'], maxRows: 2 })
    );
    assert.deepEqual(pageRoom(defs, layout, 'p1'), {
      maxRows: 2,
      rowsUsed: 2,
      rowsFree: 0,
    });
    assert.equal(pageRoom(defs, layout, 'zzz'), undefined);
  });
});

void describe('addPage, renamePage and movePage', () => {
  void it('turns an unpaged layout into pages, keeping what it had', () => {
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, order: ['a'] };
    const result = addPage(layout);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.value.order, []);
    assert.deepEqual(
      result.value.pages?.map((p) => [p.key, p.title, p.order]),
      [
        [DEFAULT_PAGE_KEY, 'Page 1', ['a']],
        ['page-1', 'Page 2', []],
      ]
    );
  });

  void it('picks free keys and titles, and checks given ones', () => {
    const base = paged(page('page-1', 'Page 2'), page('p', 'Page 3'));
    const added = addPage(base);
    assert.ok(added.ok);
    if (added.ok) {
      assert.equal(added.value.pages?.[2]?.key, 'page-2');
      assert.equal(added.value.pages?.[2]?.title, 'Page 4');
    }
    const clash = addPage(base, { title: 'page 2' });
    assert.equal(clash.ok, false);
    if (!clash.ok) assert.match(clash.error, /already called "Page 2"/);
    assert.equal(addPage(base, { key: 'p' }).ok, false);
    assert.equal(addPage(base, { title: '   ' }).ok, false);
    const long = addPage(base, { title: 'x'.repeat(31) });
    assert.equal(long.ok, false);
    if (!long.ok) assert.match(long.error, /31 characters; the most is 30/);
  });

  void it('renames a page, refusing duplicates and unknown pages', () => {
    const base = paged(page('p1', 'Sales'), page('p2', 'Stock'));
    const renamed = renamePage(base, 'p2', '  Inventory ');
    assert.ok(renamed.ok);
    if (renamed.ok) assert.equal(renamed.value.pages?.[1]?.title, 'Inventory');
    const same = renamePage(base, 'p2', 'Stock');
    assert.ok(same.ok);
    if (same.ok) assert.equal(same.value, base);
    assert.equal(renamePage(base, 'p2', 'sales').ok, false);
    const missing = renamePage(base, 'zzz', 'X');
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /Page "zzz" doesn't exist/);
  });

  void it('names the implicit page by turning it into an explicit one', () => {
    const result = renamePage(EMPTY_LAYOUT, DEFAULT_PAGE_KEY, 'Overview');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.value.pages?.[0]?.title, 'Overview');
  });

  void it('moves pages and clamps at the ends', () => {
    const base = paged(page('a', 'A'), page('b', 'B'), page('c', 'C'));
    const order = (l: DashboardLayout) => keys(l.pages ?? []);
    assert.deepEqual(order(movePage(base, 'c', -1)), ['a', 'c', 'b']);
    assert.deepEqual(order(movePage(base, 'a', 9)), ['b', 'c', 'a']);
    assert.equal(movePage(base, 'a', -1), base);
    assert.equal(movePage(base, 'zzz', 1), base);
  });
});

void describe('moveWidgetToPage', () => {
  const defs = [
    widget('a', 12),
    widget('b', 12),
    widget('c', 6),
    widget('pin', 6, { locked: { move: true } }),
  ];
  const base = paged(
    page('p1', 'Sales', ['a', 'b']),
    page('p2', 'Stock', ['c'], { maxRows: 2 })
  );

  void it('moves a widget to the end of another page', () => {
    const result = moveWidgetToPage(defs, base, 'b', 'p2');
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.value.pages?.[0]?.order, ['a']);
    assert.deepEqual(result.value.pages?.[1]?.order, ['c', 'b']);
    assert.equal(pageOf(defs, result.value, 'b'), 'p2');
  });

  void it('keeps hidden and minimized state', () => {
    const layout = paged(
      page('p1', 'Sales', ['a'], { hidden: ['b'], minimized: ['a'] }),
      page('p2', 'Stock')
    );
    const hidden = moveWidgetToPage(defs, layout, 'b', 'p2');
    assert.ok(hidden.ok);
    if (hidden.ok) {
      assert.deepEqual(hidden.value.pages?.[1]?.hidden, ['b']);
      assert.deepEqual(hidden.value.pages?.[1]?.order, []);
    }
    const minimized = moveWidgetToPage(defs, layout, 'a', 'p2');
    assert.ok(minimized.ok);
    if (minimized.ok) {
      assert.deepEqual(minimized.value.pages?.[1]?.minimized, ['a']);
      assert.deepEqual(minimized.value.pages?.[0]?.minimized, []);
    }
  });

  void it('returns the same layout for the same page', () => {
    const result = moveWidgetToPage(defs, base, 'a', 'p1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.value, base);
  });

  void it('refuses when the page has no room, naming the rows', () => {
    const full = paged(
      page('p1', 'Sales', ['a']),
      page('p2', 'Stock', ['b', 'c'], { maxRows: 2 })
    );
    const result = moveWidgetToPage(defs, full, 'a', 'p2');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.error,
        'Page "Stock" has no room for "A": it would need row 3, and the page allows 2.'
      );
    }
  });

  void it('does not count a hidden widget against the room', () => {
    const full = paged(
      page('p1', 'Sales', [], { hidden: ['a'] }),
      page('p2', 'Stock', ['b', 'c'], { maxRows: 2 })
    );
    assert.ok(moveWidgetToPage(defs, full, 'a', 'p2').ok);
  });

  void it('refuses a widget locked against moving', () => {
    const result = moveWidgetToPage(defs, base, 'pin', 'p2');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /"PIN" is locked against moving/);
    }
  });

  void it('names unknown widgets and pages', () => {
    const widgetResult = moveWidgetToPage(defs, base, 'zzz', 'p2');
    assert.equal(widgetResult.ok, false);
    if (!widgetResult.ok) assert.match(widgetResult.error, /"zzz"/);
    const pageResult = moveWidgetToPage(defs, base, 'a', 'zzz');
    assert.equal(pageResult.ok, false);
    if (!pageResult.ok) assert.match(pageResult.error, /Page "zzz"/);
  });

  void it('can move out of an unpaged layout once the target exists', () => {
    const two = addPage({ ...EMPTY_LAYOUT, order: ['a'] });
    assert.ok(two.ok);
    if (!two.ok) return;
    const result = moveWidgetToPage(defs, two.value, 'a', 'page-1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(pageOf(defs, result.value, 'a'), 'page-1');
  });
});

void describe('removePage', () => {
  const defs = [widget('a', 12), widget('b', 12), widget('c', 12)];

  void it('moves the widgets to the previous page', () => {
    const base = paged(
      page('p1', 'A', ['a']),
      page('p2', 'B', ['b'], { hidden: ['c'] })
    );
    const result = removePage(defs, base, 'p2');
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(keys(result.value.pages ?? []), ['p1']);
    assert.deepEqual(result.value.pages?.[0]?.order, ['a', 'b']);
    assert.deepEqual(result.value.pages?.[0]?.hidden, ['c']);
  });

  void it('moves the first page to the next one, ahead of its widgets', () => {
    const base = paged(page('p1', 'A', ['a']), page('p2', 'B', ['b']));
    const result = removePage(defs, base, 'p1');
    assert.ok(result.ok);
    if (result.ok) assert.deepEqual(result.value.pages?.[0]?.order, ['a', 'b']);
  });

  void it('refuses the only page, an unknown page and a full target', () => {
    const only = removePage(defs, paged(page('p1', 'A')), 'p1');
    assert.equal(only.ok, false);
    if (!only.ok) assert.match(only.error, /only page/);
    assert.equal(removePage(defs, paged(page('p1', 'A')), 'zzz').ok, false);
    const full = removePage(
      defs,
      paged(page('p1', 'A', ['a'], { maxRows: 1 }), page('p2', 'B', ['b'])),
      'p2'
    );
    assert.equal(full.ok, false);
    if (!full.ok) {
      assert.match(full.error, /Page "B" has widgets that don't fit/);
    }
  });
});

void describe('normalizeLayout with pages', () => {
  const defs = [
    widget('a', 12, { sortOrder: 1 }),
    widget('b', 12, { sortOrder: 2 }),
    widget('c', 12, { sortOrder: 3 }),
    widget('d', 12, { sortOrder: 4 }),
    widget('e', 12, { sortOrder: 5 }),
  ];

  void it('passes an unpaged layout through (and drops unknown widgets)', () => {
    assert.equal(normalizeLayout(defs, EMPTY_LAYOUT), EMPTY_LAYOUT);
    const layout: DashboardLayout = { ...EMPTY_LAYOUT, order: ['a', 'gone'] };
    assert.deepEqual(normalizeLayout(defs, layout).order, ['a']);
  });

  void it('places widgets no page lists on the first page', () => {
    const result = normalizeLayout(
      defs,
      paged(page('p1', 'A', ['c']), page('p2', 'B')),
      { maxRows: 9 }
    );
    assert.deepEqual(result.pages?.[0]?.order, ['c', 'a', 'b', 'd', 'e']);
  });

  void it('moves overflow, in order, to a new page', () => {
    const result = normalizeLayout(
      defs,
      paged(page('p1', 'A', ['a', 'b', 'c', 'd', 'e']))
    );
    assert.deepEqual(
      result.pages?.map((p) => [p.key, p.title, p.order]),
      [
        ['p1', 'A', ['a', 'b', 'c', 'd']],
        ['page-1', 'Page 2', ['e']],
      ]
    );
  });

  void it('moves overflow to the next page that has room', () => {
    const result = normalizeLayout(
      defs,
      paged(
        page('p1', 'A', ['a', 'b', 'c'], { maxRows: 2 }),
        page('p2', 'B', ['d', 'e'], { maxRows: 2 }),
        page('p3', 'C', [], { maxRows: 2 })
      )
    );
    assert.deepEqual(
      result.pages?.map((p) => p.order),
      [['a', 'b'], ['d', 'e'], ['c']]
    );
  });

  void it('puts overflow ahead of the next page when it fits', () => {
    const four = defs.slice(0, 4);
    const result = normalizeLayout(
      four,
      paged(
        page('p1', 'A', ['a', 'b', 'c'], { maxRows: 2 }),
        page('p2', 'B', ['d'], { maxRows: 2 })
      )
    );
    assert.deepEqual(
      result.pages?.map((p) => p.order),
      [
        ['a', 'b'],
        ['c', 'd'],
      ]
    );
  });

  void it('keeps splitting until every page fits its rows', () => {
    const result = normalizeLayout(
      defs,
      paged(page('p1', 'A', ['a', 'b', 'c', 'd', 'e'])),
      { maxRows: 1 }
    );
    assert.deepEqual(
      result.pages?.map((p) => p.order),
      [['a'], ['b'], ['c'], ['d'], ['e']]
    );
  });

  void it('gives a new overflow page the default rows, not the old limit', () => {
    const result = normalizeLayout(
      defs,
      paged(page('p1', 'A', ['a', 'b', 'c', 'd', 'e'], { maxRows: 1 }))
    );
    assert.deepEqual(
      result.pages?.map((p) => p.order),
      [['a'], ['b', 'c', 'd', 'e']]
    );
  });

  void it('carries the minimized state of moved widgets', () => {
    const result = normalizeLayout(
      defs,
      paged(page('p1', 'A', ['a', 'b', 'c', 'd', 'e'], { minimized: ['e'] }))
    );
    assert.deepEqual(result.pages?.[0]?.minimized, []);
    assert.deepEqual(result.pages?.[1]?.minimized, ['e']);
  });

  void it('keeps one widget on one page and titles unique and short', () => {
    const result = normalizeLayout(
      defs,
      {
        ...EMPTY_LAYOUT,
        pages: [
          page('p1', 'Same', ['a']),
          page('p2', ' same ', ['a', 'b']),
          page('p3', 'x'.repeat(40), []),
          page('p1', 'Duplicate key', []),
        ],
      },
      { maxRows: 9 }
    );
    assert.deepEqual(keys(result.pages ?? []), ['p1', 'p2', 'p3']);
    assert.deepEqual(result.pages?.[1]?.order, ['b']);
    assert.equal(result.pages?.[1]?.title, 'same (#1)');
    assert.equal(result.pages?.[2]?.title.length, 30);
  });

  void it('is idempotent and returns the same object when nothing changes', () => {
    const once = normalizeLayout(
      defs,
      paged(page('p1', 'A', ['a', 'b', 'c', 'd', 'e']))
    );
    assert.equal(normalizeLayout(defs, once), once);
    const messy = normalizeLayout(
      defs,
      paged(page('p1', 'Same', ['a']), page('p2', 'same', ['a']))
    );
    assert.equal(normalizeLayout(defs, messy), messy);
  });

  void it('enforces locks on every page', () => {
    const locked = [
      widget('a', 12, { locked: { hide: true, minimize: true } }),
      widget('b', 12),
    ];
    const result = normalizeLayout(
      locked,
      paged(page('p1', 'A', ['a'], { hidden: ['b'], minimized: ['a'] }))
    );
    assert.deepEqual(result.pages?.[0]?.minimized, []);
    assert.equal(
      normalizeLayout(
        locked,
        paged(page('p1', 'A', ['a'], { minimized: ['a'] })),
        { overrideLocks: true }
      ).pages?.[0]?.minimized[0],
      'a'
    );
  });

  void it('keeps a widget locked against moving on its home page', () => {
    const pinned = [
      widget('a', 12),
      widget('pin', 12, { page: 'B', locked: { move: true } }),
    ];
    const result = normalizeLayout(
      pinned,
      paged(
        page('p1', 'A', ['a', 'pin'], { hidden: [], minimized: ['pin'] }),
        page('p2', 'B', [])
      )
    );
    assert.deepEqual(result.pages?.[0]?.order, ['a']);
    assert.deepEqual(result.pages?.[0]?.minimized, []);
    assert.deepEqual(result.pages?.[1]?.minimized, ['pin']);
    assert.equal(pageOf(pinned, result, 'pin'), 'p2');
  });

  void it('does not move a pinned widget out when a page overflows', () => {
    const pinned = [
      widget('a', 12, { sortOrder: 1 }),
      widget('pin', 12, { sortOrder: 2, locked: { move: true } }),
      widget('b', 12, { sortOrder: 3 }),
    ];
    const result = normalizeLayout(
      pinned,
      paged(page('p1', 'A', ['a', 'b'], { maxRows: 2 }))
    );
    assert.equal(pageOf(pinned, result, 'pin'), 'p1');
    assert.deepEqual(
      pageWidgets(pinned, result, 'p1').map((d) => d.key),
      ['a', 'pin']
    );
  });
});

void describe('pruneLayout and enforceLocks with pages', () => {
  void it('prune drops unknown widgets from every page', () => {
    const layout = paged(
      page('p1', 'A', ['a', 'gone'], { hidden: ['gone'] }),
      page('p2', 'B', ['b'])
    );
    const pruned = pruneLayout([widget('a', 6), widget('b', 6)], layout);
    assert.deepEqual(pruned.pages?.[0]?.order, ['a']);
    assert.deepEqual(pruned.pages?.[0]?.hidden, []);
    assert.equal(pruneLayout([widget('a', 6), widget('b', 6)], pruned), pruned);
  });

  void it('enforceLocks removes locked keys from page lists', () => {
    const layout = paged(
      page('p1', 'A', ['a', 'b'], { hidden: ['b'], minimized: ['b'] })
    );
    const result = enforceLocks([widget('b', 6, { locked: true })], layout);
    assert.deepEqual(result.pages?.[0]?.order, ['a']);
    assert.deepEqual(result.pages?.[0]?.hidden, []);
    assert.deepEqual(result.pages?.[0]?.minimized, []);
  });
});

void describe('validateWidgetDefinition page', () => {
  const base = { key: 'x', title: 'X', kind: 'TEXT' } as const;

  void it('accepts a page reference and rejects a bad one', () => {
    assert.ok(validateWidgetDefinition({ ...base, page: 'Sales' }).ok);
    const bad = validateWidgetDefinition({ ...base, page: 3 });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.match(bad.error, /page must be a non-empty page key or title/);
    }
    assert.equal(validateWidgetDefinition({ ...base, page: ' ' }).ok, false);
  });
});
