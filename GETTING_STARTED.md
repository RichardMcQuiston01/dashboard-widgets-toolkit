# GETTING STARTED

[Back to README](./README.md)

| [Prerequisites](#prerequisites) | [Installation](#installation) | [Working on the package](#working-on-the-package) | [Usage](#usage) | [Examples](#examples) | [Maker Toolkit compatibility](#maker-toolkit-compatibility) |

## Prerequisites

- Node.js 18+ or Bun 1.3+ (or any modern browser bundler).
- React 18 or later, only if you use `/react`.
- TypeScript is optional; type declarations are included.

[Back to Top](#getting-started)

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

[Back to Top](#getting-started)

## Working on the package

Contributing to the toolkit itself (not using it)? The scripts and
conventions are in [CLAUDE.md](./CLAUDE.md).

[Back to Top](#getting-started)

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

[Back to Top](#getting-started)

## Examples

| [Layout functions on their own](#layout-functions-on-their-own) | [KPI deltas and formatting](#kpi-deltas-and-formatting) | [Styling with Tailwind (or any classes)](#styling-with-tailwind-or-any-classes) | [Widget width](#widget-width) | [Detail view](#detail-view) | [Searchable, sortable tables in the card](#searchable-sortable-tables-in-the-card) | [Declared options](#declared-options) | [Viewer settings: the Options dialog](#viewer-settings-the-options-dialog) | [Alternate views](#alternate-views) | [Clones](#clones) | [Locked widgets](#locked-widgets) | [Edit mode: Customize and Done](#edit-mode-customize-and-done) | [Storing the layout](#storing-the-layout) | [Pages of widgets (core)](#pages-of-widgets-core) | [Filling space](#filling-space) | [Loading data after the page renders](#loading-data-after-the-page-renders) | [Theming](#theming) | [Changing the text](#changing-the-text) | [Charts](#charts) |

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

By default (client mode) `loadDetail` returns every row and the toolkit sorts,
filters and pages them in memory, which suits a few thousand rows.

**Server mode** is for data too big for that. Set
`detail: { mode: 'server', pageSize: 25 }` and your loader gets the viewer's
query and returns just that page plus `totalRows` (the rows matching the
search and filters across all pages):

```tsx
// A Prisma loader for an `order` table. The query is already validated by
// you; the toolkit only passes it on.
const loadDetail: DetailLoader = async (definition, { query, signal }) => {
  const where = query.search
    ? { customer_name: { contains: query.search, mode: 'insensitive' } }
    : {};
  const [rows, totalRows] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: query.sort
        ? { [query.sort.column]: query.sort.direction }
        : { created_at: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    columns: [
      { key: 'customer_name', label: 'Customer' },
      { key: 'total', label: 'Total', numeric: true },
    ],
    rows: rows.map((row) => [
      { text: row.customer_name },
      { text: formatMoney(row.total), value: row.total },
    ]),
    totalRows,
  };
};
```

- Every search, sort, filter or page change calls the loader again with the new
  `query` and aborts the request before it. The old page stays on screen
  (marked `aria-busy`) until the new one arrives. Typing waits 300 ms after the
  last key (`SERVER_INPUT_DEBOUNCE_MS`).
- The loader must honor `query.page` and `query.pageSize`. The result is
  checked (`validateDetailData(data, subject, { mode: 'server', pageSize })`):
  `totalRows` is required, and more rows than a page is an error. Column keys
  are yours to map to database fields; only allow keys you listed in `columns`.
- If the viewer is on a page that no longer exists (rows were deleted), the
  dialog asks again for the last page (`clampServerQuery`).
- The card's own data is never a fallback in server mode: a loader that
  returns `undefined` shows an error.
- Building your own page? `useDetailData(definition, load, true, undefined,
options, { query })` does the loading and `WidgetDetail mode="server"` shows
  it. `serverPage` is the core function behind it.

**Deep links.** The package never reads or writes `location`; you keep the
open detail view in the URL with a controlled prop and a few pure helpers. The
URL looks like `?widget=top-products&sort=sold:desc&page=2` (with `q=` for the
search and `f.<column>=` for column filters; the page size is the widget's).

```tsx
const [detail, setDetail] = useState(() => readUrl());
function readUrl(): DetailLink | null {
  const parsed = parseDetailLink(location.search, definitions);
  return parsed.ok ? (parsed.value ?? null) : null; // or log parsed.error
}
useEffect(() => {
  const onPop = () => setDetail(readUrl());
  addEventListener('popstate', onPop);
  return () => removeEventListener('popstate', onPop);
}, []);

<Dashboard
  widgets={widgets}
  detail={detail}
  onDetailChange={(next, reason) => {
    setDetail(next);
    const url = `?${withDetailLink(location.search, next)}`;
    // Opening and closing are history entries (Back closes the dialog);
    // typing, sorting and paging replace the current one.
    if (reason === 'query') history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }}
/>;
```

- `detail` is `{ key, query }` or `null` (closed); leave it out and `Dashboard`
  keeps the state itself (`defaultDetail` sets the initial one).
  `onDetailChange(next, reason)` has `reason` `'open'`, `'query'` or `'close'`.
- `parseDetailLink(queryString, definitions)` is ok with `undefined` when there
  is no `widget` parameter, and fails with a message naming the widget or
  parameter for an unknown widget, one without `detail`, or a malformed value.
  A link to a widget the viewer cannot see opens nothing.
- `serializeDetailLink(link)` writes the parameters; `withDetailLink(query,
link)` puts them into a query string that has your own parameters (`tab=...`),
  replacing old detail ones, and removes them for `null`.
- A filter or sort in the URL that names a column the loaded data does not
  have is dropped (`sanitizeDetailQuery`), so a stale link opens the table
  instead of an error. With Next.js use `useSearchParams` and `router.push` /
  `router.replace` the same way.
- In server mode a deep link loads the right page on open; client mode sorts,
  filters and pages the loaded rows to match.

Page-size choice and column visibility are planned; see
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

### Viewer settings: the Options dialog

While editing (`editMode="toggle"`), each card's Arrange menu has an **Options…**
item. It opens a dialog where the viewer can change the widget's **title**, its
**width** (2 to 12 twelfths of the row, inside the definition's `minWidth` and
`maxWidth`), whether it may **grow to fill** empty space in its row, and every
option the widget declares. Apply, Discard, Reset to defaults and Revert to
before editing each ask first, with an inline ✓ / ✕. Nothing is saved until
Apply.

The choices are stored in the layout as `layout.settings`, so whatever persists
the layout (`useStoredLayout`, `serializeLayout`) saves them too. Layouts without
settings are byte-identical to before.

```tsx
import { optionValuesFromLayout } from '@richardmcquiston01/dashboard-widgets-toolkit/core';

const stored = useStoredLayout({/* ... */});
// Feed the chosen option values to the provider; Reset sends the defaults back.
const optionValues = useMemo(
  () => optionValuesFromLayout(definitions, stored.layout),
  [stored.layout]
);
const { widgets } = useWidgets(definitions, providers, context, {
  optionValues,
});

<Dashboard
  widgets={widgets}
  layout={stored.layout}
  onLayoutChange={stored.setLayout}
  editMode="toggle"
/>;
```

`Dashboard` applies the viewer's title, width and Flexible choice itself; only the
option values need the wiring above.

- **Limits.** `minWidth` and `maxWidth` on a definition keep a table from being
  squeezed or a KPI tile from being stretched; the width list in the dialog stops
  at them. Titles are plain text, at most 80 characters, and can't repeat another
  widget's title (compared trimmed and case-insensitively).
- **Locks.** `locked: { options: true }` (included in `locked: true`) hides
  Options for that widget and makes the layout ignore any settings saved for it.
  `overrideLocks` lifts it for an administrator.
- **Reset layout** restores the arrangement only; titles, widths and option
  values stay. **Revert changes** restores everything from before editing.
- **Server side.** `normalizeLayout(definitions, layout)` also cleans settings:
  it drops unknown widgets and locked widgets, clamps widths, trims titles, drops
  options a definition didn't declare or whose values are invalid, and makes
  titles unique by appending "(#2)". Run it where the layout is saved. Option
  values still reach your provider as untrusted input: validate them there too.
- **Without the UI.** `setWidgetSettings`, `clearWidgetSettings`,
  `applySettings`, `effectiveDefinitions` and `isTitleInUse` are plain functions
  if you want your own settings screen. `WidgetOptionsDialog` is exported to use
  the dialog on its own.
- **Labels and styling.** New `DashboardLabels` entries (`menuOptions`,
  `optionsFor`, `apply`, `resetToDefaults`, ...) and a `dialog` class slot;
  classes are `dwt-options-dialog`, `dwt-options`, `dwt-options-field`.

### Alternate views

A widget can offer other ways to show its data. Declare `views`; each is built
from the widget's own payload by a named conversion (plain data, so definitions
stay JSON). The widget's own `kind` is always available as the view `base`.

```ts
defineWidget({
  key: 'top-products',
  title: 'Top products',
  kind: 'TABLE',
  baseViewLabel: 'Table', // default: the kind's name
  defaultView: 'bars', // 'base' (default) or a view key
  views: [
    {
      key: 'bars',
      label: 'Bars',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 1 },
    },
    {
      key: 'chart',
      label: 'Chart',
      kind: 'GRAPH',
      convert: {
        type: 'tableToGraph',
        label: 0,
        values: [1, 2],
        chartType: 'bar',
      },
    },
  ],
});
```

Conversions: `tableToBarList`, `tableToGraph` (1 to 8 series columns),
`barListToTable`, `graphToTable` and `barListToGraph`. A table's numbers come
from `TableCell.value`, not the text ("$1,234.00"); a cell without one makes the
widget show an error that names the widget, view, row and column. Column
indexes refer to the table as the provider returns it after any `columns`
option is applied. Conversions are lossy (a bar list has no other columns) and
a table with a `footer` converts only the rows it holds. Switching is instant:
there is no second load.

- **The viewer's choice.** When a definition declares `views`, the Options dialog
  shows a **View** field and the choice is stored as `layout.settings[key].view`.
  `locked.options` also locks the view; the widget then shows its `defaultView`.
- **Without the UI.** `applyView(widget, viewKey)`, `convertView`,
  `viewChoices`, `effectiveViewKey` and `viewNote` are plain functions.
  `validateWidgetDefinition` checks keys, kinds, column indexes and `defaultView`.

#### Views your provider supplies

Some views can't be built from the widget's own payload: a trend behind a KPI,
a table behind an alert list. Declare the view **without `convert`** and your
provider supplies it. It is called with `options.view` set to that view's key
(`'base'` for the widget's own kind) and returns a payload of the view's `kind`:

```ts
defineWidget({
  key: 'revenue',
  title: 'Revenue',
  kind: 'KPI',
  views: [{ key: 'trend', label: 'Trend', kind: 'GRAPH' }],
});

const providers = {
  revenue: async (context, definition, { view, signal }) =>
    view === 'trend'
      ? await loadRevenueTrend(context, signal)
      : await loadRevenueKpi(context, signal),
};

const viewValues = useMemo(
  () => viewValuesFromLayout(definitions, stored.layout),
  [stored.layout]
);
const { widgets } = useWidgets(definitions, providers, context, {
  optionValues,
  viewValues,
});
```

- **One load per view.** Only the view being shown loads; the card shows
  loading until it arrives. Each provider view is cached apart
  (`revenue?view=trend`), so switching back is instant when you pass a `cache`.
  Converted views and `base` all load the base payload, so switching among them
  reloads nothing.
- **Wiring.** `viewValuesFromLayout(definitions, layout)` lists the widgets that
  have a provider view (an empty string means "no choice", so a Reset reaches the
  loader). `useWidgets` also returns `setView(key, view)`, and
  `createWidgetLoader` has `setView` and a `viewValues` starting point.
- **Validation.** The payload is checked against the view's `kind` (an error names
  the widget and what was expected). Options you declare reach the provider for
  every view; `sort` and `columns` options with `apply: 'client'` only apply to
  the base payload, since they name its columns.
- **Mixing.** A widget can have both: converted views for a quick look and a
  provider view for the data a conversion can't build. A clone's provider view
  loads through the original's provider like any other load.
- **Without the hook.** `resolveWidgets(..., { viewValues })` and `resolvePayload`
  take the same map, and `loadViewKey` / `loadViewKind` say what will be asked.
  A provider written before this release ignores `options.view` and always
  returns the base payload; a widget with a provider view needs it to branch.

### Clones

A viewer can **Duplicate** a widget from its Arrange menu to keep it twice with
different settings: another view, width, title or option values. The clone is
stored as `{ key, from }` in `layout.clones` (key `orders#1`, `orders#2`, ...),
its settings under its own key in `layout.settings`, and it loads through the
original's provider. Its Options dialog opens straight away; picking another
view suggests a title such as "Recent Orders Chart", otherwise the title is
"Recent Orders (#1)". Clones have a **Delete this widget** button in the
dialog (with the usual ✓ / ✕ confirmation); originals can only be hidden.

Clones are widgets as far as loading is concerned, so give `useWidgets` the
definitions with the clones added:

```tsx
import {
  normalizeLayout,
  optionValuesFromLayout,
  withClones,
} from '@richardmcquiston01/dashboard-widgets-toolkit/core';

const all = useMemo(
  () => withClones(definitions, stored.layout),
  [stored.layout.clones]
);
const optionValues = useMemo(
  () => optionValuesFromLayout(all, stored.layout),
  [all, stored.layout]
);
const { widgets } = useWidgets(all, providers, context, { optionValues });

<Dashboard
  widgets={widgets}
  layout={stored.layout}
  onLayoutChange={stored.setLayout}
  editMode="toggle"
/>;
```

- **Providers.** A clone's definition has `sourceKey` (the original's key), so
  the loader calls `providers[sourceKey]`. A provider that switches on
  `definition.key` should use `definition.sourceKey ?? definition.key`. The
  cache key also uses the original's key plus the option values, so a clone
  with the same option values reuses the original's cached payload.
- **Adding or deleting a clone** changes the definitions. `useWidgets` updates
  its running loader in place: cards already loaded keep their data, and only
  the new clone loads.
- **Rules.** A clone of a clone is a clone of the original. Clones never inherit
  locks, so the viewer can always move, hide and delete them. A clone exists
  only while its original does; `normalizeLayout` drops the rest, along with
  their settings. A clone key that matches a real widget key is ignored.
- **Locks.** `locked: { clone: true }` (included in `locked: true`) hides Duplicate
  for that widget and makes `normalizeLayout` drop clones of it. `overrideLocks`
  lifts it for an administrator.
- **Room.** In a paged layout Duplicate is disabled, with the reason in its
  accessible name, when the page can't hold the clone's width (about 4 rows by
  default). A layout without pages has no limit.
- **Reset layout** keeps clones (and their settings); **Revert changes** restores
  the pre-edit layout, clones included.
- **Without the UI.** `duplicateWidget(definitions, layout, key)` returns the new
  layout and the clone's key (or an error saying why not), `deleteClone(layout,
key)`, `canDuplicate`, `withClones`, `cleanClones`, `nextCloneKey` and
  `suggestedViewTitle` are plain functions. Labels: `menuDuplicate`, `duplicate`,
  `duplicateBlocked`, `duplicated`, `optionsDelete`, `confirmDelete`, `deleted`
  and `suggestedViewTitle`.

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

By default `Dashboard` shows an **Arrange** icon (four arrows) and a minimize
button on every card whenever you pass `onLayoutChange`. Arrange opens a small
floating menu with Move earlier, Move later, the pages the widget can move to
(with a paged layout) and Hide; items a lock covers are left out, and Move
earlier or later is disabled at the ends. Set `editMode="toggle"` to show the
controls only after the viewer presses **Customize**, so a stray click can't
rearrange the page:

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

### Drag and drop

Add `draggable` to `Dashboard` and each card shows a grip button (labelled
"Reorder Revenue") next to the Arrange menu, wherever the layout controls
show (always, or only while Customize is on):

```tsx
<Dashboard widgets={widgets} layout={layout} onLayoutChange={save} draggable />
```

- **Pointer, touch and pen.** Press the grip and move: the card follows the
  pointer, the card it would land on gets an indicator (the page behind scrolls
  near the top and bottom edge), and releasing there moves it into that
  slot. Escape or a cancelled touch aborts. Only the grip drags, so text
  selection and links inside cards keep working.
- **Keyboard.** On the grip, Space or Enter picks the card up, the arrow keys
  move it (one position per press, stepping over pinned widgets), Space or
  Enter drops it and Escape cancels. Moving focus away also cancels. Each step
  is announced in a live region (`labels.pickedUp`, `movedTo`, `dropped`,
  `dragCancelled`).
- **One save per move.** `onLayoutChange` is called once, on drop (a keyboard
  drag does not save each arrow press). The commit is the same `moveWidget` as
  the move buttons, so pinned widgets have no grip and cannot be dropped
  onto, and hidden widgets are skipped.
- **The move buttons stay** in the Arrange menu: they are the single-pointer
  alternative that WCAG 2.5.7 asks for.
- **Styling.** `.dwt-drag-handle`, `.dwt-card--dragging`, `.dwt-card--grabbed`,
  `.dwt-card--drop-before` / `-after`. The indicator color is
  `--dwt-drop-indicator` (default: `--dwt-focus`).
- **Your own handles.** The decisions are pure core functions: `dropTargetKey`
  (hit-testing on card rectangles), `dropPlacement`, `reorderOnto`,
  `listPosition` and `autoScrollStep`; `usePointerReorder` is the React hook.
  To use a drag library instead, call `moveWidget` or `reorderOnto` in its
  drop handler.

Dragging between pages and onto a page tab are not built; use "Move to page".

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
  page asks for a name first, and Escape or ✕ drops the new page again. The
  card's Arrange menu lists the other pages with their free rows and a
  "New page…" choice. Moves, restores and deletes that would overflow a page are
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

### Theming

Every color, the font and the main spacing come from `--dwt-*` custom
properties. The optional `styles.css` sets them on `.dwt-dashboard` and
`.dwt-card` (light, and dark by `prefers-color-scheme`, `data-theme="dark"` or a
`dark` class on `<html>`). Override any of them in your own CSS, or generate the
CSS with `createTheme`.

| `createTheme` key                       | Variable                                                         | Light                                                             | Dark                                                              |
| --------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `surface`                               | `--dwt-surface`                                                  | `#fcfcfb`                                                         | `#1a1a19`                                                         |
| `page`                                  | `--dwt-page`                                                     | `#f9f9f7`                                                         | `#0d0d0d`                                                         |
| `text`                                  | `--dwt-text`                                                     | `#0b0b0b`                                                         | `#ffffff`                                                         |
| `textSecondary`                         | `--dwt-text-secondary`                                           | `#52514e`                                                         | `#c3c2b7`                                                         |
| `textMuted`                             | `--dwt-text-muted`                                               | `#6b6a66`                                                         | `#a3a29b`                                                         |
| `border`                                | `--dwt-border`                                                   | `rgba(11, 11, 11, 0.1)`                                           | `rgba(255, 255, 255, 0.1)`                                        |
| `grid`                                  | `--dwt-grid`                                                     | `#e1e0d9`                                                         | `#2c2c2a`                                                         |
| `baseline`                              | `--dwt-baseline`                                                 | `#c3c2b7`                                                         | `#383835`                                                         |
| `crosshair`                             | `--dwt-crosshair`                                                | `#898781`                                                         | `#898781`                                                         |
| `link`                                  | `--dwt-link`                                                     | `#1c5cab`                                                         | `#86b6ef`                                                         |
| `focus`                                 | `--dwt-focus`                                                    | `#2a78d6`                                                         | `#3987e5`                                                         |
| `good`                                  | `--dwt-good`                                                     | `#006300`                                                         | `#0ca30c`                                                         |
| `bad`                                   | `--dwt-bad`                                                      | `#d03b3b`                                                         | `#e66767`                                                         |
| `meterTrack`                            | `--dwt-meter-track`                                              | `#cde2fb`                                                         | `#104281`                                                         |
| `barTrack`                              | `--dwt-bar-track`                                                | `#f0efec`                                                         | `#383835`                                                         |
| `buttonHover`                           | `--dwt-button-hover`                                             | `rgba(11, 11, 11, 0.06)`                                          | `rgba(255, 255, 255, 0.08)`                                       |
| `series` (1 to 8)                       | `--dwt-series-1` to `-8`                                         | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948` | `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767` |
| `font`                                  | `--dwt-font`                                                     | `system-ui, -apple-system, 'Segoe UI', sans-serif`                | same                                                              |
| `radius`, `gap`, `padding`, `minColumn` | `--dwt-radius`, `--dwt-gap`, `--dwt-padding`, `--dwt-min-column` | `8px`, `16px`, `16px`, `280px`                                    | same                                                              |

The defaults are declared on the dashboard element itself, so a variable set on
`:root` or on a wrapper `<div>` is shadowed and does nothing. Target
`.dwt-dashboard` and `.dwt-card`, or let `createTheme` write the selectors:

```ts
import { createTheme } from '@richardmcquiston01/dashboard-widgets-toolkit/core';

const result = createTheme({
  name: 'brand',
  base: { link: '#0a7d5a', radius: '12px' },
  dark: { surface: '#10161a', series: ['#4cc2a1', '#f2a65a'] },
});
if (!result.ok) {
  throw new Error(result.error); // names the mode, token and value
}
// Put result.value.css in a <style> element (or your SSR <head>), then add
// data-dwt-theme="brand" to any ancestor of the dashboard.
```

`base` applies in both modes, `light` and `dark` only in theirs and win over
`base`. A token you leave out keeps its built-in value, so a theme can change just
the accent. Colors accept `#hex`, `rgb()`, `hsl()`, `oklch()` and similar,
`var(--name)` and keywords; lengths need a unit. Anything that could end the
declaration (`;`, braces, `url(`, comments) is rejected with an error. Pass
`scope` to use your own ancestor selector instead of the `data-dwt-theme`
attribute. See `docs/design/theming.md` for what comes next (a React wrapper,
contrast checks, presets).

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

[Back to Top](#getting-started)

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

[Back to Top](#getting-started)

---

[Back to README](./README.md)
