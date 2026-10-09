# GETTING STARTED

## Prerequisites

- Node.js 18+ or Bun 1.3+ (or any modern browser bundler).
- React 18 or later, only if you use `/react`.
- TypeScript is optional; type declarations are included.

## Installation

```bash
bun add @richardmcquiston01/dashboard-widgets-toolkit
# or
npm install @richardmcquiston01/dashboard-widgets-toolkit
```

Both `import` and `require` work, for every entry:

```js
const {
  resolveWidgets,
} = require('@richardmcquiston01/dashboard-widgets-toolkit/core');
```

## Working on the package

Contributing to the toolkit itself (not using it)? The scripts and
conventions are in [CLAUDE.md](./CLAUDE.md).

## Usage

### Core: define widgets, register providers, resolve

Each provider gets
your context and returns a payload (or throws). One failing provider never
breaks the dashboard: it comes back as an `error` widget with the reason.

```ts
import {
  defineWidget,
  emptyWidget,
  resolveWidgets,
  type WidgetContext,
  type WidgetProviders,
} from '@richardmcquiston01/dashboard-widgets-toolkit';

interface ShopContext extends WidgetContext {
  shopId: string;
}

const widgets = [
  defineWidget({
    key: 'revenue',
    title: 'Revenue',
    kind: 'KPI',
    sortOrder: 10,
  }),
  defineWidget({
    key: 'low-stock',
    title: 'Low stock',
    kind: 'ALERT_LIST',
    sortOrder: 20,
  }),
  defineWidget({
    key: 'monthly',
    title: 'Revenue by month',
    kind: 'GRAPH',
    sortOrder: 30,
    defaultSize: 'large',
  }),
  defineWidget({
    key: 'audit',
    title: 'Audit log',
    kind: 'TABLE',
    roles: ['admin'],
  }),
];

const providers: WidgetProviders<ShopContext> = {
  revenue: async ({ shopId }) => {
    const { current, previous } = await loadRevenue(shopId); // your code
    return {
      kind: 'KPI',
      value: current,
      previous,
      format: 'currency',
      label: 'Revenue',
    };
  },
  'low-stock': async ({ shopId }) => {
    const rows = await loadLowStock(shopId); // your code
    return {
      kind: 'ALERT_LIST',
      items: rows.slice(0, 5).map((row) => ({
        title: row.title,
        href: row.url,
        thumbnailUrl: row.thumbnailUrl,
        valueLabel: `${row.quantity} left`,
      })),
      total: rows.length,
      emptyText: 'Nothing low on stock.',
    };
  },
  monthly: async ({ shopId }) => {
    const months = await loadMonthly(shopId); // your code
    if (months.length === 0) return emptyWidget('No orders synced yet.');
    return {
      kind: 'GRAPH',
      chartType: 'bar',
      valueFormat: 'currency',
      xLabel: 'Month',
      series: [
        {
          name: 'Revenue',
          points: months.map((m) => ({ label: m.label, value: m.revenue })),
        },
      ],
    };
  },
};

const resolved = await resolveWidgets(widgets, providers, {
  shopId: 'shop-1',
  roles: ['owner'], // "audit" is skipped: it needs "admin"
});
// [{ definition, status: 'ok', data }, { definition, status: 'empty', emptyText }, ...]
```

Payloads are validated by default (turn it off with `{ validate: false }`
for trusted, typed providers). In a client, check JSON from your API the same
way:

```ts
import {
  resolvePayload,
  validateWidgetData,
} from '@richardmcquiston01/dashboard-widgets-toolkit';

const result = validateWidgetData(json, {
  widgetKey: 'revenue',
  expectedKind: 'KPI',
});
if (!result.ok) console.warn(result.error);
// 'Widget "revenue" (KPI): previous must be a finite number, got string.'

const widget = resolvePayload(definition, json); // ok, empty, or error with that message
```

### React: render a dashboard with the viewer's layout

```tsx
import { useEffect, useState } from 'react';
import {
  EMPTY_LAYOUT,
  parseLayout,
  serializeLayout,
  type DashboardLayout,
  type ResolvedWidget,
} from '@richardmcquiston01/dashboard-widgets-toolkit';
import { Dashboard } from '@richardmcquiston01/dashboard-widgets-toolkit/react';
import '@richardmcquiston01/dashboard-widgets-toolkit/styles.css'; // optional

export function ShopDashboard({ widgets }: { widgets: ResolvedWidget[] }) {
  // Read storage after mount, so the same code also works when rendered on
  // the server (there is no `localStorage` there).
  const [layout, setLayout] = useState<DashboardLayout>(EMPTY_LAYOUT);
  useEffect(() => {
    setLayout(parseLayout(localStorage.getItem('layout')));
  }, []);
  return (
    <Dashboard
      widgets={widgets}
      layout={layout}
      onLayoutChange={(next) => {
        setLayout(next);
        localStorage.setItem('layout', serializeLayout(next));
      }}
      locale="en-US"
      linkTarget="_blank"
      onRetry={(key) => refetch(key)} // your code: reload that widget
    />
  );
}
```

`Dashboard` orders widgets by the saved layout (saved order first, new widgets
appended by `sortOrder`, hidden ones removed), and gives each card move
earlier/later, hide and minimize buttons, plus a "Hidden:" bar to bring
widgets back. A minimized widget leaves the grid (so it stops taking space)
and waits in a "Minimized:" bar until the viewer expands it. Without
`onLayoutChange` it is read-only. Use `loadingWidgets` for placeholders while
data loads, and `WidgetGrid` for a plain grid with no layout controls.

Links open in the same tab unless you set `linkTarget` (for example
`"_blank"`); links that open a new tab get a small external-link icon and
"(opens in a new tab)" for screen readers (label `opensInNewTab`).

## Examples

### Layout functions on their own

Pure; the input is never mutated:

```ts
import {
  EMPTY_LAYOUT,
  hideWidget,
  moveWidgetUp,
  toggleMinimized,
  visibleWidgets,
} from '@richardmcquiston01/dashboard-widgets-toolkit';

const definitions = [
  { key: 'revenue', sortOrder: 10 },
  { key: 'low-stock', sortOrder: 20 },
  { key: 'monthly', sortOrder: 30 },
];
let layout = moveWidgetUp(definitions, EMPTY_LAYOUT, 'monthly');
layout = hideWidget(layout, 'low-stock');
layout = toggleMinimized(layout, 'revenue');
visibleWidgets(definitions, layout).map((d) => d.key); // ['revenue', 'monthly']
```

### KPI deltas and formatting

With an explicit locale:

```ts
import {
  formatValue,
  kpiDelta,
} from '@richardmcquiston01/dashboard-widgets-toolkit';

formatValue(1234.5, 'currency', { locale: 'en-GB', currency: 'GBP' }); // "£1,234.50"
kpiDelta(120, 100, { locale: 'en-US' });
// { percent: 20, direction: 'up', sentiment: 'good', text: '+20%', description: '+20% vs previous period' }
kpiDelta(120, 100, { higherIsBetter: false })?.sentiment; // 'bad' (e.g. refunds)
```

### Styling with Tailwind (or any classes)

Components keep their `dwt-*`
classes and append yours per slot. Skip `styles.css` entirely, or keep it and
override its custom properties:

```tsx
<Dashboard
  widgets={widgets}
  classNames={{
    card: 'rounded-lg shadow-sm',
    cardTitle: 'text-sm font-semibold',
  }}
/>
```

```css
.dwt-dashboard {
  --dwt-series-1: #567d62; /* your brand color for single-series charts */
  --dwt-radius: 4px;
}
```

Dark mode follows the OS setting unless the page sets `data-theme="light"`;
`data-theme="dark"` or a `dark` class on `<html>` forces it.

### Widget width

Give a widget a `width` to say how much of the row it
takes, in twelfths (like a 12-column grid): an integer from 2 to 12. A table
with many columns might want half the row:

```ts
defineWidget({
  key: 'top-products',
  title: 'Most popular products',
  kind: 'TABLE',
  width: 8,
});
defineWidget({
  key: 'ratings',
  title: 'Rating breakdown',
  kind: 'BAR_LIST',
  width: 4,
});
```

When any widget in a grid sets `width`, the grid becomes 12 columns
(`dwt-grid--twelve`) and each card spans `--dwt-width` columns. Widgets
without a `width` use one from their `defaultSize` (small 3, medium 4, large
6, full 12). Narrow grids give widgets more room: under 900px a widget gets
twice its width, under 560px it takes the whole row. `fill: 'width'` still
works, sharing the twelfths left over in a row (the core helper for custom
layouts is `fillWidthSpans(items)`). The validator rejects anything but an
integer from 2 to 12.

### Detail view

Set `detail: true` (or `{ title, pageSize }`) on a definition and `Dashboard`
adds a "View" eye button to the card (the title is clickable too). It opens a
modal dialog with search, per-column filters, sortable headers and paging.
Where the data comes from:

```tsx
// fetchAllRows is your code: it returns a DetailData (columns and rows).
<Dashboard
  widgets={widgets}
  loadDetail={(definition, { signal }) => fetchAllRows(definition.key, signal)}
/>
```

- `loadDetail` (close over your own context; the package never fetches)
  returns a `DetailData` table: columns with a `key`, rows of cells with
  `text` and an optional `value` used for sorting and filtering. It is called
  for every widget that sets `detail`, so branch on `definition.key`.
- Return `undefined` for a widget you have no extra data for. A TABLE with no
  `footer` and a BAR_LIST then show their own card data; for any other widget
  (or a TABLE with a footer, whose card holds only some of the rows) the
  dialog reports that there is no detail data.
- Without `loadDetail`, a TABLE with no `footer` and a BAR_LIST show their own
  card data and other widgets get no View button.
- `onOpenDetail={(key) => navigate(...)}` replaces the built-in dialog so you
  can open your own page.
- The pieces are exported for your own layout: `WidgetDetail` (controlled by
  a `DetailQuery`), `WidgetDetailDialog` and `useDetailData`. In the core,
  `queryRows` does the filtering, sorting and paging (case- and
  accent-insensitive, numeric-aware), `serializeDetailQuery` /
  `parseDetailQuery` keep the query in a URL, and `validateDetailData` checks
  what your loader returns.

Only client mode exists today: `loadDetail` returns every row and the toolkit
sorts, filters and pages them in memory. The `mode: 'server'` option,
server-side paging and URL deep links are planned, not built; see
[docs/design/detail-view.md](./docs/design/detail-view.md).

### Searchable, sortable tables in the card

Set `tableControls: true` on a `TABLE` definition to put a search box and
sortable column headers in the card itself, so a small table needs no dialog.
Use `{ search: false }` or `{ sort: false }` to keep only one. They work on
the rows the card holds: with a `footer` ("and 12 more") rows were left out,
so pair it with `detail` to search the full list. Matching and sorting are the
detail view's (`queryRows`): case- and accent-insensitive, numeric-aware. The
validator rejects `tableControls` on any other kind.

### Declared options

Give a widget `options` and each one has a default that providers receive. There
is no UI for choosing yet; you (or a stored viewer choice) supply the values.

```ts
const topSellers = defineWidget({
  key: 'top-sellers',
  title: 'Top sellers',
  kind: 'TABLE',
  options: [
    {
      key: 'limit',
      type: 'number',
      label: 'Rows',
      min: 5,
      max: 50,
      default: 10,
    },
    {
      key: 'period',
      type: 'dateRange',
      label: 'Period',
      default: 'last30',
    },
    {
      key: 'order',
      type: 'sort',
      label: 'Order',
      columns: [
        { key: 'c0', label: 'Name' },
        { key: 'c1', label: 'Sold' },
      ],
      default: 'c1:desc',
      apply: 'client',
    },
  ],
});

const providers = {
  'top-sellers': async (context, definition, { signal, options }) => {
    // options.limit === 10, options.period === 'YYYY-MM-DD/YYYY-MM-DD'
    return loadTopSellers(options.limit, options.period, signal);
  },
};
```

- Resolved values are in `ProviderOptions.options` (always present, `{}` when
  the widget declares none) and on the resolved widget as `widget.options`.
  Invalid or unknown chosen values are ignored in favor of the default.
- `dateRange` accepts a preset (`today`, `yesterday`, `last7`, `last30`,
  `last90`, `thisMonth`, `lastMonth`, `thisYear`, `lastYear`) or an ISO
  interval and arrives as an interval; pass `timeZone` and `now` in the resolve
  options to control "today".
- `sort` and `columns` apply to `TABLE` (keys `c0`, `c1`, ...) and `BAR_LIST`
  (`label`, `value`). With `apply: 'client'` the toolkit sorts or trims the
  payload it got and the choice is not part of the cache key; otherwise your
  provider receives the value (a truncated table needs that).
- Cache keys gain `?name=value` for non-default provider-facing values, so
  different choices never share a cached answer.
- With `useWidgets`, pass `optionValues` (by widget key) or call `setOptions`;
  only widgets whose resolved values changed reload, and the old data shows as
  `stale` meanwhile. `createWidgetLoader` has `setOptions(key, chosen)` and an
  `optionValues` starting point.
- A `sort` option also sets the table card's header sort and the detail view's
  starting sort.

### Locked widgets

Set `locked: true` on a definition when viewers must not rearrange it (a
compliance notice, a system status tile). It can't be moved, hidden or
minimized, and `Dashboard` leaves out those controls. Use an object to lock only
some: `locked: { move: true }` pins the widget but still lets viewers hide or
minimize it.

A widget locked against moving is **pinned**: its place comes from the
definitions (its `sortOrder` among the visible widgets), never from the saved
layout, and the other widgets rearrange around it. Hiding widgets above a pinned
one shifts it up with them, so the arrangement never has gaps.

A lock is what the UI offers, not security. Run `enforceLocks` where you save a
layout:

```ts
const layout = enforceLocks(definitions, parseLayout(request.body.layout));
await saveLayout(userId, serializeLayout(layout));
```

For administrators, either build their definitions without `locked`, give them a
separate admin view, or pass `overrideLocks` to `Dashboard` for the roles you
trust (and `enforceLocks(..., { overrideLocks: true })` on the server only for
those users). `overrideLocks` never changes the locks themselves.

### Edit mode: Customize and Done

By default `Dashboard` shows move, hide and minimize controls on every card
whenever you pass `onLayoutChange`. Set `editMode="toggle"` to show them only
after the viewer presses **Customize**, so a stray click can't rearrange the
page:

```tsx
<Dashboard
  widgets={widgets}
  layout={layout}
  onLayoutChange={saveLayout}
  editMode="toggle"
  defaultLayout={organizationDefault} // what Reset layout restores
/>
```

While editing, the toolbar offers **Done**, **Reset layout** and **Revert
changes**; cards get a dashed outline, a "Hidden:" bar for restoring widgets,
and a lock icon on locked ones. Reset puts the order, hidden and minimized lists
back to `defaultLayout` (default: `sortOrder`), and Revert restores the layout
as it was when Customize was pressed. Both ask first with an inline "✓" / "X"
confirmation (focus starts on "X", Escape means no). Minimizing, and the
"Minimized:" bar, work outside edit mode too, unless a widget locks it.

To use your own button, control it with `editing` and `onEditingChange` and
hide the built-in toolbar with `toolbar={false}`. The text is overridable
(`labels.customize`, `done`, `reset`, `revertChanges`, `confirmReset`,
`confirmRevert`, `locked`, and more), and the toolbar takes the `toolbar`
class slot. With `overrideLocks`, locked cards show "locked for viewers"
instead.

### Storing the layout

The package never reads or writes storage itself. You write a small **adapter**
for where layouts live; the toolkit supplies everything around it.

```ts
import {
  createLayoutPersistence,
  type StorageAdapter,
} from '@richardmcquiston01/dashboard-widgets-toolkit/core';

// Consumer code, so localStorage is fine here.
const localStorageAdapter: StorageAdapter = {
  async get(key) {
    try {
      const value = window.localStorage.getItem(key);
      return { ok: true, value: value === null ? null : { value } };
    } catch (cause) {
      return {
        ok: false,
        code: 'unavailable',
        error: `Could not read "${key}": ${String(cause)}`,
      };
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { ok: true, value: { value } };
    } catch (cause) {
      const full =
        cause instanceof DOMException && cause.name === 'QuotaExceededError';
      return {
        ok: false,
        code: full ? 'quota' : 'unavailable',
        error: `Could not write "${key}": ${String(cause)}`,
      };
    }
  },
  remove: async (key) => {
    window.localStorage.removeItem(key);
    return { ok: true, value: null };
  },
  // Other tabs, via the storage event.
  subscribe(key, onChange) {
    const listener = (event: StorageEvent): void => {
      if (event.key === key) {
        onChange(event.newValue === null ? null : { value: event.newValue });
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },
};

const persistence = createLayoutPersistence(localStorageAdapter);
```

An adapter has `get`, `set` and optionally `remove` and `subscribe`. It never
throws for expected failures: it returns `{ ok: false, code, error }` with a
code (`unavailable`, `quota`, `forbidden`, `conflict`, `invalid`, `corrupt`) and
a message that names the key. Return a `revision` (an ETag, a row version) from
`get` and `set` and honor `ifRevision` in `set` to get conflict detection.

In React, `useStoredLayout` joins it to `Dashboard`:

```tsx
const stored = useStoredLayout({
  persistence,
  scope: { dashboardKey: 'sales', userKey: user.id },
  definitions,
  defaultLayout, // shown until loaded and when nothing is stored
});

<Dashboard
  widgets={widgets}
  layout={stored.layout}
  onLayoutChange={stored.setLayout}
/>;
```

- The dashboard never waits on storage. A failed load or save keeps the
  in-memory layout working and sets `stored.error` (and `status: 'error'`).
- Saves are debounced (`saveDelayMs`, default 500) and flushed when the page is
  hidden.
- `load` repairs what it reads with `normalizeLayout`, so a stored layout never
  shows widgets that no longer exist; a bare layout from `serializeLayout` is
  read as is. Layouts over `maxBytes` (default 64 KB) are refused with a message
  that names the size.
- When the adapter has revisions, a conflicting save follows `onConflict`:
  `'ask'` (default: `status: 'conflict'`, then `stored.resolveConflict('mine' |
'theirs')`), `'overwrite'`, `'keep-theirs'`, or a function
  `(mine, theirs) => layout` to merge.
- A change from another tab or device is applied at once when there are no
  unsaved edits; otherwise it is offered as `stored.remoteLayout`, which you
  accept or ignore with `stored.resolveRemote('use' | 'ignore')`.
- `stored.backup` / `stored.setBackup` keep a pre-edit snapshot under its own key.

Wrappers turn one adapter into another: `withPrefix`, `withFallback(primary,
secondary)` (a server first, localStorage when it's down), `withReadCache`,
`readOnly`, `withRetry` (you pass `sleep`, so the core has no timers),
`withEncoding` (compression or your own encryption) and `withLogging` (keys and
codes, never values). `memoryAdapter()` is for tests and server rendering.

On the server, treat a posted layout as untrusted: run
`normalizeLayout(definitions, parseLayout(body))` before saving, take the user
from the session (never from the request), and enforce the size limit.

### Pages of widgets (core)

A dashboard can be split into pages, like the home screens of a phone. A layout
without `pages` is one implicit page, so nothing changes for existing layouts.
Each page has its own `order`, `hidden` and `minimized` lists, a title, and a
capacity of `maxRows` rows of 12 columns (default 4, per page or per call).
Widgets are never split: a widget that doesn't fit in the rest of a row starts
the next row whole, and a page that needs more rows than it allows overflows to
another page.

```ts
import {
  addPage,
  moveWidgetToPage,
  normalizeLayout,
  pageRoom,
  pageWidgets,
} from '@richardmcquiston01/dashboard-widgets-toolkit';

const added = addPage(layout, { title: 'Inventory' }); // Result<DashboardLayout>
if (!added.ok) throw new Error(added.error);
const moved = moveWidgetToPage(definitions, added.value, 'low-stock', 'page-1');
if (!moved.ok) showMessage(moved.error); // e.g. 'Page "Inventory" has no room for ...'

pageRoom(definitions, layout, 'page-1'); // { maxRows, rowsUsed, rowsFree }
pageWidgets(definitions, layout, 'page-1'); // visible widgets, in order
```

- `definition.page` names a widget's home page (a page key or title): widgets no
  page lists yet show there, and a widget locked against moving always does.
- `pageLayout` and `withPageLayout` give one page as an ordinary layout, so the
  move, hide and minimize functions work on a page unchanged.
- Rows are counted the way the grid draws them (`placeRows`), and widgets
  marked `fill: 'width'` grow into the leftover columns without adding a row.
- Run `normalizeLayout(definitions, parseLayout(input), { maxRows })` where you
  save a layout. It drops unknown widgets, enforces locks, keeps each widget on
  one page, fixes titles, and moves overflow, in order, to the next page with
  room or a new page. Nothing is hidden to make room.

#### Pages in `Dashboard`

Pass a layout with `pages` and `Dashboard` shows a tab list and renders only the
page in view. With one page (or none) there is no page bar.

```tsx
<Dashboard
  widgets={widgets}
  layout={layout} // has pages
  onLayoutChange={saveLayout}
  maxRows={4} // rows a page holds; a page's own maxRows wins
  activePage={pageKey} // optional: controlled
  onActivePageChange={setPageKey}
/>
```

- **Tabs and dots.** Tabs are a real `tablist` (arrow keys, Home and End move and
  select; names read "Page 2 of 3: Sales"). Under 640px they collapse to dots
  with Previous and Next buttons. Page changes are announced.
- **Lazy loading by page.** Only the page in view is rendered, so with
  `useWidgets(..., { loadWhen: 'visible' })` (and `gridRef` around the
  dashboard) widgets on other pages load the first time their page is shown, and
  keep their data when the viewer comes back.
- **Editing.** With `onLayoutChange`, editing shows **Add page**, Rename, Move
  left/right and Delete (a trash icon; it asks first) for the page in view. Add
  page asks for a name first, and Escape or ✕ drops the new page again. Each
  card gets a **Move to page** icon that opens a small floating menu of the
  other pages with their free rows and a "New page…" choice. Moves, restores and deletes that would overflow a page are
  refused with a message ("Page "Stock" has no room for "Alpha": it would need
  row 3, and the page allows 2."). `maxPages` caps how many pages can be added.
- Labels are overridable (`pageBar`, `pageTabName`, `addPage`, `moveToPage`,
  `pageFull`, `emptyPage`, and more); messages from the core functions are
  English text from `pages.ts`.

### Filling space

By default each card is only as big as its content, so a
short card beside a tall one leaves a gap. Set `fill` on a widget definition
to have it use the free space in its grid row:

```ts
defineWidget({
  key: 'countries',
  title: 'Orders by country',
  kind: 'BAR_LIST',
  fill: 'height',
});
defineWidget({ key: 'notes', title: 'Notes', kind: 'TEXT', fill: 'width' });
defineWidget({
  key: 'trend',
  title: 'Trend',
  kind: 'GRAPH',
  defaultSize: 'large',
  fill: 'both',
});
```

| `fill`   | Effect                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| `height` | Stretches the card to the height of its row (`dwt-card--fill-height`).             |
| `width`  | Widens the card to take the columns left over in its row (`dwt-card--fill-width`). |
| `both`   | Both.                                                                              |

`Dashboard` and `WidgetGrid` work out the spans from the rendered grid (so it
follows your CSS and the container width) and set `grid-column: span N` on
width-filling cards; on the server, and before the first measurement, the
grid simply lays out normally. The same helper is exported from the core as
`fillColumnSpans(items, columns)` for custom layouts, and `WidgetCard` takes
`fill` and `columnSpan` props.

### Loading data after the page renders

Render the dashboard first and let
each widget's data arrive on its own. `useWidgets` returns placeholders
immediately (so first paint and server rendering never wait), starts every
provider after mount, and replaces each card as its own data arrives:

```tsx
import {
  Dashboard,
  useWidgets,
} from '@richardmcquiston01/dashboard-widgets-toolkit/react';

const { widgets, refresh } = useWidgets(definitions, providers, context, {
  timeoutMs: 8000, // a provider that takes longer becomes an error card
  refreshMs: 60_000, // optional polling; skips widgets still loading
});

return <Dashboard widgets={widgets} onRetry={(key) => refresh(key)} />;
```

Providers receive an `AbortSignal` as a third argument (`(context, definition,
{ signal })`); pass it to `fetch` so a timeout, a refresh or leaving the page
stops the request. Existing two-argument providers keep working.

- `loadWhen: 'visible'` also waits until a card is near the viewport. Attach
  the returned `gridRef` to an element around the dashboard.
- `cache` (your own `{ get, set }` storage: memory, `localStorage`, ...) shows
  the last payload instantly as `stale` while a fresh load runs. Cached
  payloads are validated again, and a failing cache never fails a widget.
- Keep `definitions`, `providers`, `context` and `cache` referentially stable
  (module constants or `useMemo`); a changed value restarts loading.
- Not using React? `createWidgetLoader` (core) is the same logic with
  `subscribe`/`getSnapshot`, `load`, `refresh` and `dispose`; `resolveWidget`
  and `resolveWidgets` accept `timeoutMs`, `signal` and `cache` too.

### Changing the text

Every piece of interface text (buttons, the "Hidden:" and "Minimized:" bars,
the detail view, loading and empty messages) comes from `labels`, so you can
translate or reword it. Pass only what you change; the rest keeps its default
(`DEFAULT_LABELS` lists them all). Labels that name a widget are functions:

```tsx
<Dashboard
  widgets={widgets}
  labels={{
    hide: (title) => `Ocultar ${title}`,
    hiddenWidgets: 'Ocultos:',
    retry: 'Reintentar',
  }}
/>
```

`WidgetSettingsProvider` takes the same `locale`, `linkTarget`, `classNames`
and `labels` once for everything inside it.

### Charts

`GRAPH` widgets render as inline SVG with `role="img"`, a
`<title>` and a `<desc>` summarizing the series (latest, high and low), a
legend when there are two or more series, a hover and keyboard (arrow keys)
tooltip, and a collapsible "View as table" with every value. Colors are CSS
custom properties (`--dwt-series-1` … `--dwt-series-8`) with built-in
defaults from a palette checked for color-vision deficiency in light and
dark modes; a graph may have at most eight series.

## Maker Toolkit compatibility

The kind names are upper case, as in Maker Toolkit's `WidgetViewType`, and
the definition mirrors its `widget` table:

| Maker Toolkit (`widget` table / API) | This package                      |
| ------------------------------------ | --------------------------------- |
| `widget_key` / `widgetKey`           | `key`                             |
| `title`, `description`               | `title`, `description`            |
| `view_type` / `viewType`             | `kind`                            |
| `sort_order` / `sortOrder`           | `sortOrder`                       |
| `roles` (empty = everyone)           | `roles` (absent/empty = everyone) |
| `active`                             | `active`                          |
| providers keyed by `widget_key`      | `WidgetProviders` keyed by `key`  |

- `TEXT` and `GAUGE` payloads are unchanged.
- `TABLE` columns and cells became objects (`{label, numeric?}`,
  `{text, href?}`), and `GRAPH` became multi-series with a chart type and
  value format. `upgradeLegacyWidgetData()` converts the older
  `{columns: string[], rows: string[][]}` and `{points}` shapes, and
  `fromLegacyDefinition()` maps a served definition.
- `KPI`, `BAR_LIST` and `ALERT_LIST` are new kinds. Add them to the
  `WidgetViewType` enum before seeding widgets that use them.
- The desktop app's `dashboard-layout.ts` (order, hidden, minimized) is
  `layout.ts` here, with the same JSON shape, so saved layouts carry over.
  It now appends new widgets by `sortOrder` and tolerates corrupt values per
  field.

```ts
import {
  fromLegacyDefinition,
  upgradeLegacyWidgetData,
  validateWidgetData,
} from '@richardmcquiston01/dashboard-widgets-toolkit';

const result = validateWidgetData(upgradeLegacyWidgetData(apiPayload));
```

[Return to README.md](./README.md)
