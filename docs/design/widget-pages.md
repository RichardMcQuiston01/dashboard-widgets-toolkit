# Design: widget pages

- **Status:** Draft for review. Decisions 1 to 6 of section 12 come from the
  maintainer; the rest are proposals.
- **Date:** 2026-10-09
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.7.x
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

A dashboard can grow past one screen. Instead of an endless scroll, widgets are
split across **pages**, like the home screens of a phone: each page has its own
widgets, a widget can be moved to another page, and a small control moves between
pages. A dashboard with one page looks exactly as it does today and shows no page
control.

Three ideas carry the design:

1. **A page is a small layout.** Each page holds the same `order`, `hidden` and
   `minimized` lists the layout has now, so every existing function (move, hide,
   minimize, lock) works on a page unchanged.
2. **A page has a capacity**: `maxRows` rows of 12 columns (about 4, so a page
   rarely scrolls). The widths of the widgets on it must fit.
3. **Only the page in view loads.** Pages scale because widgets on other pages
   don't load until they are visited.

Everything stays optional and JSON. A layout saved today is a one-page dashboard.

### Non-goals

- Per-widget placement at pixel level (free-form canvas). Pages hold the
  existing 12-column flow.
- Server-side page storage. The consumer persists the layout (see
  `storage-adapters.md`).
- Different widgets per user role. Roles already filter definitions; pages only
  arrange what the viewer can see.

## 2. Today

`Dashboard` renders one list: `visibleWidgets(definitions, layout)` in `order`,
with `hidden` and `minimized` lists. `useWidgets` loads every widget it is given.
Nothing groups widgets, so a long dashboard is a long scroll and every widget
loads on mount.

## 3. The model

```ts
interface DashboardLayout {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
  readonly minimized: readonly string[];
  readonly settings?: Readonly<Record<string, WidgetSettings>>; // options design
  readonly clones?: readonly WidgetClone[]; // options design
  /** Present only when the dashboard has more than the default page. */
  readonly pages?: readonly LayoutPage[];
}

interface LayoutPage {
  readonly key: string; // a UUID; stable when the page is renamed or moved
  readonly title: string; // "Sales", at most 30 characters
  readonly order: readonly string[];
  readonly hidden: readonly string[];
  readonly minimized: readonly string[];
}
```

- **Without `pages`, nothing changes.** The top-level lists are the one and only
  page, `serializeLayout` writes the same bytes as today, and `parseLayout` reads
  old JSON as a one-page layout.
- **With `pages`, the pages own placement.** The top-level `order`, `hidden` and
  `minimized` are left empty. A widget key appears on exactly one page.
  `settings` and `clones` stay at the top level, keyed by widget key, so a widget
  keeps its settings when it moves.
- **Unplaced widgets** (new definitions the viewer hasn't seen) go to the first
  page, ordered by `sortOrder`, as unlisted keys do today. A definition can name
  a home page with `page?: string` (a page `key` or title in the default layout).
- **Page views.** Two pure helpers let all the existing code stay as it is:
  `pageLayout(layout, pageKey): DashboardLayout` returns one page as an ordinary
  layout, and `withPageLayout(layout, pageKey, next)` writes it back, returning
  the same object when nothing changed.

### Pure functions (in `layout.ts`)

`addPage`, `renamePage`, `removePage`, `movePage` (reorder), `moveWidgetToPage`,
`pageOf(layout, key)`, `pageLayout`, `withPageLayout`. Each returns a `Result` or
the same layout when nothing changes, like the existing updaters, and each
refusal names the page and widget: `Page "Sales" has no room for "Orders" (it would need a fifth row; the page allows 4).`

## 4. Capacity

A page holds `maxRows` rows (default 4) of 12 columns. **Widgets are never split
or squeezed to make them fit.** A table or chart is one piece: it sits whole in a
row or it doesn't sit there. If a widget would need more than `maxRows` rows, it
and the widgets after it overflow onto another page.

Rows are worked out by the code that already places cards, `placeAndFill` in
`core/grid.ts`: widgets go left to right in order, and a widget that doesn't fit
in the rest of the row starts the next row whole. A new pure function reports
that placement, so the check and the rendering can never disagree:

```ts
interface PlacedRow {
  readonly keys: readonly string[];
  readonly spans: readonly number[]; // final spans, after flexible widgets grow
}

/** The rows the widgets occupy, exactly as the grid will draw them. */
function placeRows(items: readonly GridItem[]): readonly PlacedRow[];
/** How many of `items`, in order, fit in `maxRows` rows. */
function fitCount(items: readonly GridItem[], maxRows?: number): number;
```

A page **fits** when `placeRows(visibleWidgets).length <= maxRows`. The
back-of-envelope reading, "widths add up to at most 48", is only a hint: seven
widgets 7 wide leave a 5-column gap in every row, so they need 7 rows although
they add up to 49 or less in the right mix. Counting real rows is the honest test,
and the page bar's room indicator says "2 rows free", not columns.

### Overflow goes to another page

- When a change makes a page too full (a wider width, a restored widget, a move
  in), it is **refused** with a message that offers a way out: "Page 'Sales' is
  full. Move it to another page, or choose a narrower width."
- When a layout arrives already too full (saved earlier, or an administrator
  shrank `maxRows`), `normalizeLayout` moves the overflow to the **next page that
  has room, or a new page appended after it**. The first widget that doesn't fit
  and everything after it move together, in order, so nothing is reordered or
  hidden.

### Flexible widgets

A width is a minimum share (the existing 2 to 12 setting). A viewer or author can
also mark a widget **Flexible**, which is today's `fill: 'width'` made visible: it
may **grow slightly to take the columns left over in its row** rather than leave
empty columns (see the options design). Growth never changes the count of rows:

- Rows are decided by the base widths first. Growing only uses leftover columns
  in a row that already exists, so Flexible can't push a widget to another row or
  page, and a page that fits stays fitting.
- Several Flexible widgets in one row share the leftover evenly; earlier ones get
  the remainder. A row with none keeps its gap.
- Growth stops at the widget's `maxWidth`.

### Details

- **What counts:** visible widgets, including minimized ones (a minimized card
  still holds its place in the row). Hidden widgets don't count, so hiding frees
  room.
- **Widths** are the effective base widths: the viewer's `settings.width`, else
  the definition's, else the size default. The check runs on the wide layout; the
  responsive rules (double width under 900px) don't change what is allowed.
- **Heights** are not counted. A tall table makes a page longer even within four
  rows. Row height classes could be counted later (open question 13).
- **Override:** `maxRows` is a `Dashboard` prop and also part of a page's data
  (`LayoutPage.maxRows?`) so an administrator can give a page more room.

## 5. Moving between pages

- **Move to page…** is a select in each card's edit-mode controls and in the
  Options dialog ("Page"). It lists pages with their free rows ("Sales, 2 rows
  free") and "New page…" at the end. The widget goes to the end of the
  target page. This is the single-pointer, keyboard-friendly way and is always
  available.
- **Drag onto a page tab** is added when drag and drop ships; the select remains
  as the WCAG 2.5.7 alternative.
- **Locks.** `locked.move` also keeps a widget on its page (a pinned slot stays
  pinned on its page). Cross-page moves of a locked widget are refused with the
  existing message style.
- **Hidden widgets** belong to the page they were hidden on; restoring returns
  them there (if there is room, else the restore asks which page).
- **Clones** are created on the original's page, right after it, and can then be
  moved like any widget.

## 6. Moving between pages: the control

A **page bar** appears under the toolbar when there are two or more pages.
With one page, **no page control is shown** (decided).

- It is a tab list (`role="tablist"`): a button per page with the page's title,
  `aria-selected` on the active one, a panel (`role="tabpanel"`) holding the
  grid. Arrow keys move between tabs, Home and End jump, and the tab for the
  active page is the only one in the tab order.
- On narrow screens the titles collapse to **dots**, like a phone's home screen,
  each with an accessible name ("Page 2 of 3: Sales"). Previous and next buttons
  flank them.
- Page changes are announced ("Page 2 of 3: Sales") in a live region, and focus
  stays on the control the viewer used. Motion between pages respects
  `prefers-reduced-motion`.
- **Swipe** on touch screens is an enhancement for later; the buttons and tabs
  are the baseline, so nothing depends on a gesture.
- The active page is state of the view, not of the layout: `Dashboard` takes
  `activePage` and `onActivePageChange` (controlled), or manages it itself
  (uncontrolled, starting on the first page). A consumer who wants to reopen the
  last page, or put it in the URL, uses the callback.

### Managing pages (edit mode)

The toolbar gains, while editing: **Add page** (a "New page" with the next free
"Page n" title, opened for renaming), and on the page bar **Rename**, **Move
left/right** and **Delete** for the active page.

- **Delete** asks inline (the "✓" / "X" pattern from the options design). Its
  widgets move to the previous page if they fit; if not, deletion is refused:
  "Page 'Sales' has widgets that don't fit elsewhere. Move or hide them first."
  The last page can't be deleted.
- Titles are unique, trimmed, at most 30 characters.
- A one-page dashboard in edit mode shows only **Add page**; the page bar appears
  once a second page exists.
- Optional `maxPages` on `Dashboard`, no default limit beyond `parseLayout`'s
  safety ceiling (open question 14).

## 7. Loading: why this scales

`useWidgets` takes the widgets to load. `Dashboard` passes only the active page's
visible widgets (`loadPages: 'active'`, the default). Options:

- `'active'`: load the page in view; others load when first visited.
- `'adjacent'`: also prefetch the next and previous pages after the active page
  has finished.
- `'all'`: today's behavior, for small dashboards.

Pages already visited keep their payloads under the loader's existing cache and
refresh rules, so going back is instant and stale data is refreshed per the
widget's `refresh` setting. Widgets on pages never visited cost nothing. The
loader gains `retain(keys)`/`release(keys)` so a long-lived dashboard can drop
the payloads of pages the viewer left far behind (open question 15).

## 8. Layers and defaults

Placement follows the same three layers as settings:

1. The definition's `page` (a home page for the widget).
2. The organization's `defaultLayout`, which can define pages ("Sales",
   "Inventory") and assign widgets to them.
3. The viewer's saved layout, which can add, rename and rearrange pages.

Resetting the layout (lock design) restores the default pages and placement;
Revert changes restores the pre-edit snapshot including pages. Whether an
administrator's pages can be locked against renaming or deleting is open question 12.

## 9. Enforcement

`normalizeLayout` gains page rules, so a layout from storage is repaired, never
trusted: a widget on two pages stays on the first; unknown keys are pruned; at
least one page exists; titles are made unique and trimmed; a page that overflows
its capacity has its last widgets moved to the next page with room, or to a new
page appended after it. **Nothing is silently hidden or dropped to make room.**
It stays idempotent.

## 10. Labels and styling

New `DashboardLabels`: `pageBar` ("Pages"), `pageOf(index, count, title)`,
`addPage`, `renamePage`, `deletePage`, `movePageLeft`, `movePageRight`,
`moveToPage`, `newPage`, `pageFull(widthNeeded, free)`, `pageTitleInUse`,
`pagesDeleteBlocked`, `previousPage`, `nextPage`. Classes: `dwt-pages`,
`dwt-page-tab`, `dwt-page-dots`, `dwt-page-panel`. `styles.css` stays optional.

## 11. Phasing and testing

Indicative; after edit mode (0.9.0) and the options dialog (0.11.0), before clones
(which need capacity checks):

| Phase | Version | Scope                                                                                                                                              |
| ----- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 0.12.0  | Core: `pages` in the layout, helpers, `placeRows`/`fitCount`, page rules in `normalizeLayout`, definition `page`                                   |
| 2     | 0.12.0  | React: page bar (tabs and dots, hidden for one page), `activePage`, lazy loading by page, Move to page select, edit-mode Add/Rename/Reorder/Delete |
| 3     | later   | Swipe, drag onto a page tab, adjacent prefetch tuning, `retain`/`release`                                                                          |

Tests (`test/core`): round trips with and without `pages` and byte-identical old
JSON; `pageLayout`/`withPageLayout`; `placeRows` including the 7-wide example and flexible growth that never adds a row;
every refusal message; `normalizeLayout` repairs and idempotence. (`test/react`):
no page bar for one page; tabs and dots markup with accessible names; the select
lists free columns; only the active page's widgets are in the markup; unchanged
output when `pages` is absent. Real browser (demo): add a page, move a widget,
reload, confirm the layout and active page persist, and that the other page's
data loads only on first visit.

## 12. Decisions and open questions

### Decided (2026-10-09)

1. **Pages work like phone home screens**: each page has its own widgets.
2. **Widgets can move between pages**, and there is a control to move between
   pages.
3. **One page means no page control.**
4. **Capacity is rows per page**, about 4 rows of 12 columns (48 column units).
5. **Pagination scales**: only the page in view needs to load.
6. **Settings and clones belong to the widget**, so they travel with it.

### Decided (2026-10-09, later)

7. **Widgets are whole.** Nothing splits across rows; a widget that overflows
   the page's rows goes to another page.
8. **Flexible widgets** may grow slightly into leftover columns of their row.

### Still open (proposals above)

9. **Overflow order.** The first widget that doesn't fit and everything after it
   move to the next page, keeping order (proposed). The alternative, filling gaps
   with later smaller widgets, reorders what the viewer arranged.
10. **What counts.** Visible widgets including minimized ones; hidden don't
    (proposed).
11. **Default `maxRows`.** 4, overridable per page.
12. **Dots versus titles.** Titles on wide screens and dots on narrow ones
    (proposed).
13. **Locking pages.** Should an administrator be able to lock page structure so
    viewers can't rename or delete the pages they defined?
14. **Heights.** Count row heights as well as widths later?
15. **`maxPages`.** No default limit (proposed), optional prop.
16. **Memory.** Drop payloads of pages left far behind with `retain`/`release`,
    or keep everything visited?
