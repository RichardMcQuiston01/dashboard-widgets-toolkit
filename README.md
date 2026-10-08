# Dashboard Widgets Toolkit

- Author:   Richard McQuiston
- Website:  https://richardmcquiston.com/
- Demo:     https://dashboard-widgets-toolkit-demo.vercel.app/

## Overview

`@richardmcquiston01/dashboard-widgets-toolkit` is a framework-agnostic
dashboard widget toolkit: typed widget definitions and data payloads (KPI,
gauge, table, bar list, alert list, chart), user layout (order, hide,
minimize), and React renderers. Bring your own data providers.

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
| `TABLE`      | `columns: {label, numeric?}[]`, `rows: {text, href?, value?}[][]`, `footer?`                             | Small data tables                          |
| `BAR_LIST`   | `items: {label, value, display?}[]`, `total?`                                                            | Ratings breakdown, purchases by country    |
| `ALERT_LIST` | `items: {title, href?, thumbnailUrl?, valueLabel, detail?}[]`, `total`, `emptyText`                      | Low stock, stale listings, expiring soon   |
| `GRAPH`      | `series: {name, points: {label, value}[]}[]`, `chartType: 'bar' \| 'line'`, `valueFormat`, `currency?`, `xLabel?` | Revenue by month, views per day |

`format` and `valueFormat` are `'number' | 'currency' | 'percent'`. Money is
in major units (12.5 is $12.50) and percents are fractions (0.25 is 25%). Any
widget may instead return an empty state, `{ empty: true, text: 'No orders
synced yet.' }`.

A `TABLE` cell's optional `value` (a string or number) is what the card's
table controls (`tableControls` on the definition) and the detail view sort
and search on, when `text` is formatted for reading: a timestamp behind
"3 days ago", a rating behind stars, an amount behind "$1,234.00".

## Getting Started

See [GETTING_STARTED.md](./GETTING_STARTED.md)

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[**Donate via Stripe**](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800), or scan:

[![Donate via Stripe](./donate.svg)](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800)

## License

Apache 2

## Copyright

(c)2026 Richard McQuiston.  All rights reserved.
