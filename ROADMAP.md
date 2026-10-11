# ROADMAP

[Back to README](./README.md)

| [Shipped](#shipped) | [Short term](#short-term) | [Next](#next) | [Never](#never) |

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
- Locked widgets: `locked`, pinned slots, `enforceLocks` and `overrideLocks`
  (0.8.0).
- Edit mode: `editMode="toggle"` with a Customize/Done toolbar, Reset layout,
  Revert changes and a lock icon on locked cards (0.9.0).
- Pages of widgets: per-page layouts with a capacity of about 4 rows, `placeRows`
  and `normalizeLayout` (0.10.0), then the page bar, Move to page and page
  management in `Dashboard` (0.10.0 to 0.11.2).
- Storage adapters: the adapter contract, `createLayoutPersistence`, wrappers
  and the `useStoredLayout` hook (0.11.0).
- Declared widget options with defaults (`choice`, `number`, `boolean`, `text`,
  `dateRange`, `color`, `sort`, `columns`), passed to the provider, with
  option-aware cache keys and client-side sort and columns (0.11.0).
- One Arrange menu per card (0.12.0).
- Theming: `createTheme` and a documented `--dwt-*` token reference (0.13.0).
- Options dialog and viewer settings: title, width, Grow to fill and the
  declared options, stored in the layout as `layout.settings`, with
  `minWidth`/`maxWidth` limits and `locked.options` (0.14.0).
- Alternate views: a table as a bar list or chart and other conversions, a View
  field in the Options dialog (0.15.0).
- Clones: Duplicate and Delete, `layout.clones`, `locked.clone` (0.16.0).
- Views supplied by the provider (`views` without `convert`, `options.view`,
  `viewValues`, `setView`) (0.17.0).

[Back to Top](#roadmap)

## Short term

- **Detail view, the rest.** URL deep links (the query helpers exist; the
  dialog does not read or write the URL yet), page-size choice and column
  visibility, server-mode detail caching by query, and a detail view for each
  provider-supplied view. Server mode itself is built. See
  [docs/design/detail-view.md](./docs/design/detail-view.md).
- **Theming, the rest.** A `WidgetTheme` React wrapper, contrast and
  color-vision checks (`checkTheme`) and presets. See
  [docs/design/theming.md](./docs/design/theming.md).
- **Storage, the rest.** The stored active page and backup history (`backup` and
  `onBackup`), and a `data-dwt-default-title` attribute for reverting renames. See
  [docs/design/storage-adapters.md](./docs/design/storage-adapters.md) and
  [docs/design/widget-options-views-clones.md](./docs/design/widget-options-views-clones.md).

[Back to Top](#roadmap)

## Next

- **Pages, the rest.** Swipe between pages, drag a widget onto a page tab (the
  `draggable` reordering works within a page), and
  payload release (`retain`/`release`) for far-away pages. See
  [docs/design/widget-pages.md](./docs/design/widget-pages.md).
- **Field types** for table cells: `email`, `url`, `image`, `color` and `custom`
  formatters.
- **Widget Builder**, headless functions in a `./builder` subpath that create and
  edit a definition as JSON, with data-source descriptions; viewer-created widgets
  come after. See
  [docs/design/widget-options-views-clones.md](./docs/design/widget-options-views-clones.md).
- **Vue renderers** (`./vue`) for Maker Toolkit's Shop Dashboard and other
  Vue 3 apps, over the same core and `styles.css` class names.
- **Data sources and adapters**: payload builders and push (live) sources. See
  [docs/design/widget-extensions.md](./docs/design/widget-extensions.md).
- **Sparkline kind** (`SPARKLINE`), and an optional sparkline on `KPI` tiles
  (12 points, current period in the accent).
- **More chart forms**: stacked bars for part-to-whole, and area charts.
- **Texture fill** for bars (45°/135°) under `forced-colors`, print or an
  accessibility setting, as a second channel after color.

[Back to Top](#roadmap)

## Never

- Data fetching, storage or database code in the package. Consumers supply
  providers and persist layouts themselves.

[Back to Top](#roadmap)

---

[Back to README](./README.md)
