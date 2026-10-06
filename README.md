# Dashboard Widgets Toolkit

- Author:  Richard McQuiston
- Website:  https://richardmcquiston.com/

## Overview

`@richardmcquiston01/dashboard-widgets-toolkit` is a framework-agnostic
dashboard widget toolkit: typed widget definitions and data payloads (KPI,
gauge, table, bar list, alert list, chart), user layout (order, hide,
minimise), and React renderers. Bring your own data providers.

It has three parts:

| Import path                                             | What it is                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@richardmcquiston01/dashboard-widgets-toolkit` (or `/core`) | Runtime-neutral core (Node, Bun, browsers): definitions, payload types, validators, `resolveWidgets`, layout, formatting. No DOM, no network, no storage.     |
| `@richardmcquiston01/dashboard-widgets-toolkit/react`   | React (18+) renderers: `WidgetCard`, one renderer per kind, `WidgetGrid`, a layout-aware `Dashboard`, and accessible inline-SVG charts with a "View as table" twin. |
| `@richardmcquiston01/dashboard-widgets-toolkit/styles.css` | Optional stylesheet. Components are unstyled by default and carry stable `dwt-*` class names.                                                                 |

The package never fetches or stores anything. You register a provider per
widget key (a database query, an HTTP call, a computed value), and you
persist each viewer's layout wherever you like. Payloads are plain JSON, so a
server can resolve widgets and a client can validate and render them.

The widget kinds:

| Kind         | Payload fields                                                                                           | Typical use                                |
| ------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `TEXT`       | `value: string`, `label`                                                                                 | A count or status as text                  |
| `KPI`        | `value: number`, `previous?: number \| null`, `format`, `currency?`, `label`, `hint?`, `higherIsBetter?` | Stat tile with a change vs previous period |
| `GAUGE`      | `value`, `max`, `label`                                                                                  | A meter (unread of total, quota used)      |
| `TABLE`      | `columns: {label, numeric?}[]`, `rows: {text, href?}[][]`, `footer?`                                     | Small data tables                          |
| `BAR_LIST`   | `items: {label, value, display?}[]`, `total?`                                                            | Ratings breakdown, purchases by country    |
| `ALERT_LIST` | `items: {title, href?, thumbnailUrl?, valueLabel, detail?}[]`, `total`, `emptyText`                      | Low stock, stale listings, expiring soon   |
| `GRAPH`      | `series: {name, points: {label, value}[]}[]`, `chartType: 'bar' \| 'line'`, `valueFormat`, `currency?`, `xLabel?` | Revenue by month, views per day |

`format` and `valueFormat` are `'number' | 'currency' | 'percent'`. Money is
in major units (12.5 is $12.50) and percents are fractions (0.25 is 25%). Any
widget may instead return an empty state, `{ empty: true, text: 'No orders
synced yet.' }`.

## Getting Started

### Prerequisites

- Node.js 18+ or Bun 1.3+ (or any modern browser bundler).
- React 18 or later, only if you use `/react`.
- TypeScript is optional; type declarations are included.

### Installation

```bash
bun add @richardmcquiston01/dashboard-widgets-toolkit
# or
npm install @richardmcquiston01/dashboard-widgets-toolkit
```

Both `import` and `require` work, for every entry:

```js
const { resolveWidgets } = require('@richardmcquiston01/dashboard-widgets-toolkit/core');
```

### Usage

**Core: define widgets, register providers, resolve.** Each provider gets
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
  defineWidget({ key: 'revenue', title: 'Revenue', kind: 'KPI', sortOrder: 10 }),
  defineWidget({ key: 'low-stock', title: 'Low stock', kind: 'ALERT_LIST', sortOrder: 20 }),
  defineWidget({
    key: 'monthly',
    title: 'Revenue by month',
    kind: 'GRAPH',
    sortOrder: 30,
    defaultSize: 'large',
  }),
  defineWidget({ key: 'audit', title: 'Audit log', kind: 'TABLE', roles: ['admin'] }),
];

const providers: WidgetProviders<ShopContext> = {
  revenue: async ({ shopId }) => {
    const { current, previous } = await loadRevenue(shopId); // your code
    return { kind: 'KPI', value: current, previous, format: 'currency', label: 'Revenue' };
  },
  'low-stock': async ({ shopId }) => {
    const rows = await loadLowStock(shopId);
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
    const months = await loadMonthly(shopId);
    if (months.length === 0) return emptyWidget('No orders synced yet.');
    return {
      kind: 'GRAPH',
      chartType: 'bar',
      valueFormat: 'currency',
      xLabel: 'Month',
      series: [{ name: 'Revenue', points: months.map((m) => ({ label: m.label, value: m.revenue })) }],
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
import { resolvePayload, validateWidgetData } from '@richardmcquiston01/dashboard-widgets-toolkit';

const result = validateWidgetData(json, { widgetKey: 'revenue', expectedKind: 'KPI' });
if (!result.ok) console.warn(result.error);
// 'Widget "revenue" (KPI): previous must be a finite number, got string.'

const widget = resolvePayload(definition, json); // ok, empty, or error with that message
```

**React: render a dashboard with the viewer's layout.**

```tsx
import { useState } from 'react';
import {
  parseLayout,
  serializeLayout,
  type ResolvedWidget,
} from '@richardmcquiston01/dashboard-widgets-toolkit';
import { Dashboard } from '@richardmcquiston01/dashboard-widgets-toolkit/react';
import '@richardmcquiston01/dashboard-widgets-toolkit/styles.css'; // optional

export function ShopDashboard({ widgets }: { widgets: ResolvedWidget[] }) {
  const [layout, setLayout] = useState(() => parseLayout(localStorage.getItem('layout')));
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
      onRetry={(key) => refetch(key)}
    />
  );
}
```

`Dashboard` orders widgets by the saved layout (saved order first, new widgets
appended by `sortOrder`, hidden ones removed), and gives each card move
earlier/later, hide and minimise buttons, plus a "Hidden:" bar to bring
widgets back. Without `onLayoutChange` it is read-only. Use `loadingWidgets`
for placeholders while data loads, and `WidgetGrid` for a plain grid with no
layout controls.

### Examples

**Layout functions on their own** (pure; the input is never mutated):

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

**KPI deltas and formatting** with an explicit locale:

```ts
import { formatValue, kpiDelta } from '@richardmcquiston01/dashboard-widgets-toolkit';

formatValue(1234.5, 'currency', { locale: 'en-GB', currency: 'GBP' }); // "£1,234.50"
kpiDelta(120, 100, { locale: 'en-US' });
// { percent: 20, direction: 'up', sentiment: 'good', text: '+20%', description: '+20% vs previous period' }
kpiDelta(120, 100, { higherIsBetter: false })?.sentiment; // 'bad' (e.g. refunds)
```

**Styling with Tailwind (or any classes).** Components keep their `dwt-*`
classes and append yours per slot. Skip `styles.css` entirely, or keep it and
override its custom properties:

```tsx
<Dashboard
  widgets={widgets}
  classNames={{ card: 'rounded-lg shadow-sm', cardTitle: 'text-sm font-semibold' }}
/>
```

```css
.dwt-dashboard {
  --dwt-series-1: #567d62; /* your brand colour for single-series charts */
  --dwt-radius: 4px;
}
```

Dark mode follows the OS setting unless the page sets `data-theme="light"`;
`data-theme="dark"` or a `dark` class on `<html>` forces it.

**Charts.** `GRAPH` widgets render as inline SVG with `role="img"`, a
`<title>` and a `<desc>` summarising the series (latest, high and low), a
legend when there are two or more series, a hover and keyboard (arrow keys)
tooltip, and a collapsible "View as table" with every value. Colours are CSS
custom properties (`--dwt-series-1` … `--dwt-series-8`) with built-in
defaults from a palette checked for colour-vision deficiency in light and
dark modes; a graph may have at most eight series.

## Maker Toolkit compatibility

The kind names are upper case, as in Maker Toolkit's `WidgetViewType`, and
the definition mirrors its `widget` table:

| Maker Toolkit (`widget` table / API) | This package                   |
| ------------------------------------ | ------------------------------ |
| `widget_key` / `widgetKey`           | `key`                          |
| `title`, `description`               | `title`, `description`         |
| `view_type` / `viewType`             | `kind`                         |
| `sort_order` / `sortOrder`           | `sortOrder`                    |
| `roles` (empty = everyone)           | `roles` (absent/empty = everyone) |
| `active`                             | `active`                       |
| providers keyed by `widget_key`      | `WidgetProviders` keyed by `key` |

- `TEXT` and `GAUGE` payloads are unchanged.
- `TABLE` columns and cells became objects (`{label, numeric?}`,
  `{text, href?}`), and `GRAPH` became multi-series with a chart type and
  value format. `upgradeLegacyWidgetData()` converts the older
  `{columns: string[], rows: string[][]}` and `{points}` shapes, and
  `fromLegacyDefinition()` maps a served definition.
- `KPI`, `BAR_LIST` and `ALERT_LIST` are new kinds. Add them to the
  `WidgetViewType` enum before seeding widgets that use them.
- The desktop app's `dashboard-layout.ts` (order, hidden, minimised) is
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

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run build      # dist/: ESM (.js), CommonJS (.cjs), .d.ts/.d.cts, styles.css
```

Branches: `dev` is the integration branch. Branch features off `dev` and open
pull requests into `dev`; `dev` is merged to `main` for a release. Add a
changeset (`bun run changeset`) with each user-facing change.

Releases are published to npm by GitHub Actions when a `vX.Y.Z` tag matching
`package.json` is pushed to `main`. **The `NPM_TOKEN` repository secret (an
npm automation token) must be added under Settings → Secrets and variables →
Actions** before the first release. See [CLAUDE.md](./CLAUDE.md) for the
full flow.

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[**Donate via Stripe**](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800), or scan:

[![Donate via Stripe](./donate.svg)](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800)

## License

Apache 2

## Copyright

(c)2026 Richard McQuiston.  All rights reserved.
