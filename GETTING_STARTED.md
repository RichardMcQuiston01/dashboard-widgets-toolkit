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
