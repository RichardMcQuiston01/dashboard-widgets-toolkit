# ROADMAP

## Shipped

- Core: widget definitions, seven payload kinds plus an empty state,
  validators, provider resolution, layout, formatting and axis maths (0.1.0).
- React renderers, `Dashboard`/`WidgetGrid`, SVG charts with table twins, and
  the optional `styles.css` (0.1.0).
- `fill` setting for widgets that stretch to the row height or width (0.2.0).
- Async loading: `useWidgets`, `createWidgetLoader`, per-widget `timeoutMs`,
  `cache` and abortable providers (0.3.0).
- Per-widget `width` on a 12-column grid (0.4.0).
- Card polish: square icon buttons, a "Minimized" bar instead of empty boxes,
  an icon on links that open a new tab, and American English labels (0.4.0).
- Detail view, client mode: a "View" button and clickable title open a dialog
  with search, column filters, sortable headers and paging (0.4.0, 0.5.0).
- Searchable, sortable tables in the cards: `tableControls` on a `TABLE`
  definition (0.6.0).
- Sort values on `TABLE` cells (`value`), so formatted columns sort and search
  correctly (0.7.0).

## Short term

- **Detail view, server mode.** `mode: 'server'` with `totalRows` so large
  datasets are filtered, sorted and paged by the consumer's provider, plus URL
  deep links, page-size choice and column visibility. See
  [docs/design/detail-view.md](./docs/design/detail-view.md).
- **Edit mode** (built, unreleased). `editMode="toggle"` with a Customize/Done
  toolbar, Reset layout, Revert changes and a lock icon on locked cards.
  Designed in
  [docs/design/lock-and-edit-mode.md](./docs/design/lock-and-edit-mode.md);
  drag and drop builds on it.

## Next

- **Vue renderers** (`./vue`) for Maker Toolkit's Shop Dashboard and other
  Vue 3 apps, over the same core and `styles.css` class names.
- **Drag-and-drop reordering** in `Dashboard`, on top of `moveWidget`, with
  the move buttons kept as the keyboard-accessible path.
- **Widget options, alternate views and clones.** Consumer-declared options
  with defaults (default sort, columns, top N) passed to the provider, then a
  gear button in edit mode that opens an Options dialog (title, width and those
  options), then alternate views (a table as a bar list or chart) and clones.
  Defaults are definition data so a Widget Builder can bake them in later. Replaces "widget sizes in the layout". Designed in
  [docs/design/widget-options-views-clones.md](./docs/design/widget-options-views-clones.md);
  builds on the lock and edit mode design.
- **Widget pages.** Phone-style pages of widgets (about 4 rows each), move
  widgets between pages, a page bar that appears only with two or more pages,
  and loading only the page in view. Designed in
  [docs/design/widget-pages.md](./docs/design/widget-pages.md).
- **Storage adapters.** A small adapter contract, I/O-free persistence helpers
  and a `useStoredLayout` hook, so layouts and backups can live in
  localStorage, a database or a server without the package storing anything.
  Designed in
  [docs/design/storage-adapters.md](./docs/design/storage-adapters.md).
- **Sparkline kind** (`SPARKLINE`), and an optional sparkline on `KPI` tiles
  (12 points, current period in the accent).
- **More chart forms**: stacked bars for part-to-whole, and area charts.
- **Texture fill** for bars (45°/135°) under `forced-colors`, print or an
  accessibility setting, as a second channel after color.

See [docs/design/widget-extensions.md](./docs/design/widget-extensions.md) for
the design of drag-and-drop, lazy loading, data sources and adapters.

## Never

- Data fetching, storage or database code in the package. Consumers supply
  providers and persist layouts themselves.
