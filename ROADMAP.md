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
- Theming: `createTheme` and a documented `--dwt-*` token reference (0.13.0), then `WidgetTheme` and the `Dashboard` `theme` prop, `checkTheme` (contrast and color-vision checks) and `themePresets` (0.20.0).
- Options dialog and viewer settings: title, width, Grow to fill and the
  declared options, stored in the layout as `layout.settings`, with
  `minWidth`/`maxWidth` limits and `locked.options` (0.14.0).
- Alternate views: a table as a bar list or chart and other conversions, a View
  field in the Options dialog (0.15.0).
- Clones: Duplicate and Delete, `layout.clones`, `locked.clone` (0.16.0).
- Views supplied by the provider (`views` without `convert`, `options.view`,
  `viewValues`, `setView`) (0.17.0).
- Detail view in server mode, drag-and-drop reordering (`draggable`) and the
  clone-reload fix (0.18.0).
- Detail view deep links: `detail` / `onDetailChange` and `parseDetailLink` (0.19.0).
- Field types for table columns: `email`, `url`, `image`, `color` and `custom`
  formatters (0.22.0).
- Click and drill-down events: `onSelect` reports a picked table row, bar, alert
  item or chart position, from `Dashboard`, `WidgetGrid` and the renderers
  (0.23.0).
- Storage extracted into `@richardmcquiston01/storage-adapters`, the toolkit's
  one runtime dependency; the adapter helpers are re-exported and layouts keep
  loading (0.24.0).
- Dashboard-level filters: a filter bar (`filters`, `filterValues`,
  `onFilterChange`) whose values reach every provider as `options.filters`, with
  filter-aware cache keys and reloads only for the widgets that use a changed
  filter (0.25.0).
- Export: CSV for table, bar list and chart cards and for the detail view
  (`exportFormats`, `widgetToCsv`, `queryToCsv`, `onExportDetail`), SVG and PNG
  download for charts (`chartToSvg`, `svgToPng`) and a print stylesheet
  (0.26.0).
- Freshness: "Updated 2 minutes ago" on each card, a refresh button, and the
  last good data kept with a badge when a refresh fails (`freshness`,
  `onRefresh`, `OkWidget.refreshError`, `formatAge`) (0.27.0).
- Detail view, the rest: a page-size choice (`detail.pageSizes`) and column
  visibility (`detail.columnVisibility`), a detail view that follows provider
  views (`options.view`) with a derived table for charts, and a server-mode page
  cache by query (0.28.0).
- Pages, the rest: swipe between pages on touch screens (`usePageSwipe`), drag a
  widget onto a page tab, and `release` of far-away pages' payloads
  (`loader.release`, `farPageWidgetKeys`) (0.29.0).
- Widget Builder, headless: the `./builder` subpath (`defineSource`, `newWidget`,
  `updateWidget`, `exposeOption`, `availableViews` / `addView`, `validatePatch`,
  `parseDefinitions`, `mergeDefinitions`) and `WidgetDefinition.source` with
  `providerKeyOf` (0.30.0).
- Widget Builder, React building blocks: `useWidgetDraft`, `WidgetOptionsForm`,
  `WidgetViewsForm`, `WidgetPreview` and the headless `previewWidget`,
  `updateOption` and draft functions (0.31.0).
- Widget Builder, viewer-created widgets: `BuilderPolicy` (allowed sources, a
  widget quota, a key prefix, editable fields, limits), `validateViewerSave`,
  `parseViewerDefinitions` and the draft hook's `policy` option (0.32.0).
- Pages, adjacent prefetch: `nearPageWidgetKeys`, `loader.prefetch` and the
  `prefetch` option of `useWidgets` load the neighbouring pages once the page in
  view has finished (0.33.0).
- Vue renderers, the read-only dashboard: the `./vue` subpath (cards, one
  renderer per kind, the chart, freshness, exports, `WidgetSettingsProvider`,
  `WidgetTheme`, `useWidgets`), with the chart model, labels and palette moved
  into the core (0.33.0).
- Vue renderers, layout controls: the `Dashboard` and `WidgetGrid` for `./vue`
  (hide, show, minimize, move, locks, Customize/Done/Reset/Revert, pages) and the
  `useStoredLayout` composable (0.34.0).
- Vue renderers, the Options dialog and clones: `WidgetOptionsDialog` and
  `OptionField` for `./vue`, Options and Duplicate in the Arrange menu, and the
  dialog's draft helpers moved into the core (`optionsPatchFrom` and friends)
  (0.35.0).
- Storage, the rest: the stored active page, `backup` / `onBackup` on `Dashboard`
  and `data-dwt-default-title` on cards (0.21.0).

[Back to Top](#roadmap)

## Short term

Nothing is queued here right now: the planned work is under [Next](#next).

[Back to Top](#roadmap)

## Next

- **Vue renderers, the rest** (`./vue`): the read-only dashboard, `Dashboard`
  with the layout controls and pages, `useStoredLayout`, the Options dialog and
  clones are built; still planned are the filter bar and the detail view
  (phase 3b) and drag and drop with swipe (phase 4). See
  [docs/design/vue-renderers.md](./docs/design/vue-renderers.md).
- **Data sources and adapters**: payload builders and push (live) sources. See
  [docs/design/widget-extensions.md](./docs/design/widget-extensions.md).
- **Sparkline kind** (`SPARKLINE`), and an optional sparkline on `KPI` tiles
  (12 points, current period in the accent).
- **More chart forms**: stacked bars for part-to-whole, and area charts.
- **Texture fill** for bars (45°/135°) under `forced-colors`, print or an
  accessibility setting, as a second channel after color.
- **More widget kinds**: a donut for part-to-whole, a funnel, progress toward a
  goal, and a heat or calendar map. Each keeps the chart rules (one scale,
  `<title>`/`<desc>`, a "View as table" twin).
- **Conditional formatting and thresholds**: color bands on `GAUGE` and `KPI`,
  goal or reference lines on charts, and table cell rules (for example, red under
  5), as typed fields so definitions stay JSON.
- **Layout depth**: drag-to-resize widths, a layout per breakpoint (a phone
  layout can differ from a desktop one), named saved views ("Monday review"), and
  layout migrations so stored layouts survive changes to definitions.
- **Ready-made translations** for `labels` (`es`, `fr`, `de`), with right-to-left
  checked.
- **Next.js App Router and SSR**: an `initialWidgets` option on `useWidgets` and
  a documented recipe (fetch on the server, pass serialized widgets to
  `Dashboard`), and a web-component wrapper for frameworks beyond React and Vue.
- **Bundle size and large tables**: per-kind lazy loading (charts are the heavy
  part) and virtualized rows in big detail views.
- **A component gallery**: Storybook (or similar) for every kind, state and
  theme, doubling as visual-regression coverage; the demo stays the integrated
  showcase.

[Back to Top](#roadmap)

## Never

- Data fetching, storage or database code in the package. Consumers supply
  providers and persist layouts themselves.

[Back to Top](#roadmap)

---

[Back to README](./README.md)
