# CHANGELOG

## 0.35.0

### Minor Changes

- dbc53f9: `/vue`: the Options dialog and clones. `WidgetOptionsDialog` and `OptionField` edit a widget's title, width, Flexible, view and every declared option type (choice, number, boolean, text, color, date range, sort, columns), with Apply, Cancel, Reset to defaults and Revert to before editing asking first, a refused duplicate title, and a clone's Delete and suggested view title. The `Dashboard` Arrange menu gains Options and Duplicate, applies the dialog's patch to `layout.settings`, and opens the dialog on a new clone, with the same props, labels and markup as the React `Dashboard` (the parity tests compare them). The draft helpers behind the dialog moved into the core (`optionsDraftFrom`, `optionsPatchFrom`, `optionsPatchKey`, `EMPTY_SETTINGS_PATCH`, `storedOptionDefault`, `DATE_RANGE_PRESET_LABELS`), so other renderers can share them; `/react` is unchanged. The filter bar, the detail view, drag and drop and swipe are not in `/vue` yet.

## 0.34.0

### Minor Changes

- ea6b904: `/vue`: the layout-aware `Dashboard` and `WidgetGrid`, with `useStoredLayout`. `Dashboard` orders widgets by the viewer's layout and, with `onLayoutChange`, adds hide and show, minimize and its bar, move earlier or later and the Arrange menu (`WidgetEditMenu`), locks (`overrideLocks`), the Customize/Done/Reset/Revert toolbar (`editMode="toggle"`, `backup` / `onBackup`) and pages (tab bar, add, rename, move, delete, Move to page, `maxRows`, `maxPages`), with the same props, labels, classes and markup as the React `Dashboard` (a parity test compares them). `useStoredLayout` joins a `LayoutPersistence` to it with refs for the layout, backup, active page, status, error, conflict and remote changes, and loads nothing while rendering on the server. The Options dialog, clones, the detail view, dashboard filters, drag and drop and swipe are not in `/vue` yet.

## 0.33.0

### Minor Changes

- 1a86ce4: Prefetch the neighbouring pages of a paged dashboard. `nearPageWidgetKeys(definitions, layout, activeKey, reach)` names the widgets on the pages next to the one in view, `useWidgets` takes them as `prefetch` (with `prefetchDelayMs`), and `loader.prefetch(keys)` queues them to load once nothing else is loading, so a swipe lands on data and the cards in view are never held up.
- 54bcf4f: Add `/vue`, Vue 3.3+ renderers over the same core and `styles.css` class names as `/react`: `WidgetCard` (with `actions` and `footer` slots), `ResolvedWidgetCard`, one renderer per kind (TEXT, KPI, GAUGE, TABLE with search and sort, BAR_LIST, ALERT_LIST, GRAPH with its "View as table" twin), field types and custom cell formatters, selection, CSV/SVG/PNG export buttons, freshness and refresh, `WidgetSettingsProvider`, `WidgetTheme` and the `useWidgets` composable (`loadWhen: 'visible'`, `prefetch`, polling, options, views and filters). Vue is an optional peer dependency. The layout controls (`Dashboard`, pages, drag and drop) and the dialogs are not in `/vue` yet.

### Patch Changes

- 792e9e8: Move the framework-free parts of the React layer into the core so other renderers can share them: the chart model and geometry (`buildChartModel`, `describeChart`, `barPath`, `chartX`, `chartY`, ...), the default labels and class slots (`DEFAULT_LABELS`, `joinClassNames`) and the chart palette (`seriesColor`, `CHART_COLORS`). `./react` still exports everything it did; nothing changes for existing users.

## 0.32.0

### Minor Changes

- 513fd8f: Widget Builder, viewer-created widgets: a policy for what a viewer may build, and one server-side check for every save.
  
  `BuilderPolicy` (checked by `defineBuilderPolicy`) is plain data a server builds for the signed-in user: the `sources` they may build on (an allow-list, empty allows none), `maxWidgets`, a required `keyPrefix` derived from their id, the plain fields they may set (`editable`, default `title`, `description`, `width`, `defaultView`; `roles`, `locked`, `active`, `page`, `filters`, `detail` and sizes are opt-in), and per-widget `maxOptions`, `maxViews` and `maxSize`. `validateViewerSave({ policy, sources, submitted, previous, owned })` returns the definition to store, or an error naming the widget and the rule: a source outside the policy, a key without the prefix or one that changes, a new widget past the quota or reusing a key, too many options or views, too large a widget, or any field outside `editable` that differs from the stored widget (or from what `newWidget` makes), so a viewer cannot send `roles` or `locked` and a value an administrator set survives their edits. It is pure, so the quota needs a transaction around count and insert. `viewerSources`, `viewerWidgetKey` and `parseViewerDefinitions` (rows a tightened policy no longer allows come back in `skipped` with the reason, never deleted) round it out, with `optionsLeft`, `viewsLeft` and `validateBuilderPolicy`.
  
  React: `useWidgetDraft(source, definition, { policy })` adds `draft.editable` and `draft.limits`, flags an edit to a field the policy does not allow, refuses it on `commit()`, and refuses an option or view past a limit; `WidgetOptionsForm` and `WidgetViewsForm` hide "Add" at a limit and say why (`optionsLimitReached`, `viewsLimitReached` in the labels). The browser's checks are for the form; the server runs `validateViewerSave` with a policy it built itself.

## 0.31.0

### Minor Changes

- 1e37230: Widget Builder, React building blocks: `useWidgetDraft`, `WidgetOptionsForm`, `WidgetViewsForm` and `WidgetPreview` in `./react`, over new headless pieces in `./builder`.
  
  `useWidgetDraft(source, definition)` keeps an admin form's state: plain fields (`title`, `width`, `roles`, ...) are edited as a pending patch, so an empty title never becomes a definition, with `problems` by field, a `candidate` definition to preview and `commit()` returning a `Result`; options and views change the definition at once through `exposeOption`, `updateOption`, `hideOption`, `addView` and `removeView`, so `draft.definition` is always valid for its source. `WidgetOptionsForm` edits the label and default of each exposed option (reusing the Options dialog's field renderers) and lists the source's other options to add; `WidgetViewsForm` removes views and adds the ones the source can serve; both show a refused change's reason beside it. `WidgetPreview` draws the widget with the real renderers from the source's `sample`, with no provider call, and says why when it can't (no sample, or a view only the provider builds). Words come from a `labels` prop (`DEFAULT_BUILDER_LABELS`), classes are `dwt-builder-*`, and the stylesheet defines the tokens for them outside a dashboard.
  
  Headless, in `./builder`: `updateOption`, `previewWidget(source, definition, { view, optionValues })` and the draft functions the hook wraps (`newDraft`, `setDraftField`, `draftProblems`, `draftCandidate`, `commitDraft`), so another framework can build the same screen.

### Patch Changes

- 7a8c2b7: Add a `funding` entry to package.json, so `npm fund` and the package's npm page show the donate link. No code changes.

## 0.30.0

### Minor Changes

- 7291e22: Widget Builder, headless: a `./builder` subpath that creates and edits a widget definition as JSON.
  
  A developer describes a registered provider once with `defineSource` (its `kind`, table `columns`, the `options` it understands as templates, the views it supplies, whether it has a detail view, the filters it uses). An administrator's screen then calls pure functions: `newWidget`, `updateWidget` (plain fields), `exposeOption` / `hideOption`, `availableViews` / `addView` / `removeView`, and `validatePatch` for form errors by field. Every function returns a definition that `validateWidgetDefinition` and `checkAgainstSource` accept, or an error naming the widget, the field and the rule: a widget cannot change its source's kind, widen an option's bounds or choices, name a column or view the source does not have, or ask for a detail view or a filter the source does not offer. `serializeDefinition(s)` writes stable JSON in a `{ version, definitions }` envelope; `parseDefinition(s)` checks it against the registered sources and, for a list, returns the valid rows plus the skipped ones with reasons; `mergeDefinitions` keeps code definitions over stored ones with the same key.
  
  Core: `WidgetDefinition.source` names the provider that feeds a widget, and `providerKeyOf(definition)` (`source`, else `sourceKey`, else `key`) is what the loader, `resolveWidgets` and the cache key now use, so a clone of a builder widget keeps loading from its source. Definitions without `source` behave as before. `validateWidgetDefinition` rejects an empty or non-string `source`.

## 0.29.0

### Minor Changes

- 690c121: Swipe between pages on touch screens.
  
  On a paged `Dashboard`, swiping left or right on the page shows the next or previous page (right-to-left layouts flip). It never starts on a button, link, field, drag handle or a table that scrolls sideways, does not wrap past the ends, and treats a mostly vertical movement as a scroll; the page bar is unchanged. New exports: `swipeDirection`, `adjacentPageKey` and the swipe constants (core), and `usePageSwipe` (React) for your own page container.
- 9b80885: Release the payloads of far-away pages.
  
  A page keeps its data after the viewer leaves it, so a long-lived dashboard with many pages only grows. `release(keys)` on `useWidgets` (and `loader.release(keys)` on the core loader) now drops the payloads of the widgets you name: a load in flight is aborted and its late result ignored, the card goes back to `loading`, option and view choices are kept, and it loads again the next time its card appears, from your `cache` first when you pass one. `farPageWidgetKeys(definitions, layout, activeKey, keep = 1)` names the widgets on pages more than `keep` pages from the page in view. With `loadWhen: 'mount'`, `useWidgets().release` does nothing, and a widget whose card is on screen is never released. Nothing is released automatically.
- 9b295e3: Drag a widget onto a page tab.
  
  With `draggable` on a paged `Dashboard`, dragging a card over another page's tab (or dot) outlines it, solid when the page can take the card and dashed when the drop would be refused, and releasing moves the card there: the same move, and the same refusal message, as the Arrange menu's "Move to page". A lone widget on a paged dashboard now gets a drag handle too, so a page can be emptied this way. New exports: `tabAtPoint` and `TAB_DROP_SLOP_PX` (core), and the `tabsRef`, `tabFor` and `onDropOnTab` options of `usePointerReorder` (React) for your own page bar.

## 0.28.0

### Minor Changes

- d764c43: Detail view: a page-size choice and column visibility.
  
  - `detail.pageSizes` (for example `[10, 25, 100]`) adds a "Rows per page" select; `detail.columnVisibility` adds a "Columns" menu. Both are off by default.
  - `DetailQuery.hidden` lists the hidden column keys. It is display only: search, filters and sort still cover every column, a server-mode provider is not sent it (`providerQuery`), and CSV exports leave the hidden columns out.
  - Deep links carry `size` and `hide`; `serializeDetailLink` writes `size` only when it differs from `DetailLink.defaultPageSize`, which `parseDetailLink` fills in. `parseDetailQuery` takes an `allowed` argument to refuse sizes a widget does not offer.
  - New helpers `hideColumns`, `visibleColumnIndexes` and `providerQuery`; new labels `rowsPerPage` and `columnsMenu`.
- 0c7f363: Server-mode detail view remembers the pages it has loaded.
  
  Going back to an earlier page, sort or search shows its rows at once (marked busy) while the loader is asked again, instead of keeping the wrong page on screen until the answer arrives. The cache is per open detail view, in memory, and starts over when the dashboard filters, options, view or a retry change. New core helpers: `detailQuerySignature` and `createDetailPageCache`.
- 2df0553: Detail view for widgets with views.
  
  - `loadDetail` and detail providers now receive `options.view`: the view the card loads (`base`, or the key of a view the provider supplies), so a widget with several views can return the rows behind the one on screen. `useDetailData` takes it as a new last argument.
  - A chart (`GRAPH`) now has a derived detail view, the same table as "View as table" with search, sorting and paging (`deriveDetailData`). A provider view of kind `GRAPH`, `TABLE` or `BAR_LIST` needs no detail loader when its payload is complete.
  - Fixed: the detail view reloaded on every keystroke or page change for a widget with views or viewer settings, because the card's definition was rebuilt on each render.

## 0.27.0

### Minor Changes

- c57496c: Freshness. `Dashboard` and `WidgetGrid` take `freshness` ("Updated 2 minutes ago"
  under each loaded card, kept current by one timer that fires only when the words
  change) and `onRefresh` (a refresh button on each loaded card; pass
  `useWidgets`'s `refresh`). A failed `refresh()` (the button, `refreshMs` polling)
  now keeps the card's last good data instead of replacing it with an error card:
  the widget carries the new `OkWidget.refreshError` and, with `freshness`, shows
  "Couldn't refresh. Showing data from 5 minutes ago". `refresh()` also marks the
  widget `stale` while it reloads. The core adds `formatAge`, `ageOf` and
  `msUntilAgeChanges`. New labels `updatedAgo`, `justNow`, `refreshFailed`,
  `refreshFailedHint`, `refreshWidget`, `refreshing` and class slot `freshness`.
  Also fills a gap in the 0.26.0 docs: the README and GETTING_STARTED now describe
  Export (CSV, SVG, PNG, print).

## 0.26.0

### Minor Changes

- b09b3df: CSV export from the detail view. `exportFormats={['csv']}` now also adds a
  Download CSV button to the detail dialog and `WidgetDetail`: client mode exports
  every row the search, filters and sort select (new core `queryToCsv`), and
  server mode asks the host through the new `onExportDetail` (on `Dashboard`) or
  `onExportAll` (on `WidgetDetail`), then builds the file from the `DetailData` it
  returns. New types `DetailExportRequest`.
- 38425a2: Print stylesheet. `styles.css` now has an `@media print` block: card buttons,
  the toolbar, page tabs, drag handles and the filter reset are hidden, cards stay
  whole on a sheet, bar and line colors print, charts print with their table twin
  open (Chromium 131+) and an open detail view prints in full.
- 24ebf30: CSV export. `Dashboard` and `WidgetGrid` take `exportFormats={['csv']}` to add a
  Download button to loaded table, bar list and chart cards, with `onExport` and
  `onExportError` to handle the file yourself. The core adds `widgetToCsv`,
  `detailToCsv` and `exportFileName` (RFC 4180 quoting, `cells: 'value'`, custom
  delimiter, byte order mark, and a leading quote on text a spreadsheet would run
  as a formula). New label `downloadCsv`.
- b9d214b: Chart download. `exportFormats` accepts `'svg'` and `'png'`, adding buttons to
  chart cards that save a standalone picture with its legend, title and
  description, painted as on screen (dark themes export dark). The PNG is drawn at
  2x. `chartToSvg` and `svgToPng` are exported for custom buttons, `ExportFile`
  becomes `TextExportFile` (csv, svg) or `BinaryExportFile` (png), and there are
  new labels `downloadSvg` and `downloadPng`.

## 0.25.0

### Minor Changes

- d936c23: Dashboard-level filters. Declare `filters` (`choice`, `number`, `boolean`, `text` and `dateRange`, with defaults, checked by `validateDashboardFilters`) and pass them with the chosen `filterValues` to `useWidgets` and `Dashboard`. Every provider receives the resolved values as `options.filters` (a date range as an ISO interval), cached payloads for different choices are kept apart (`filter.name=value` in the cache key), and changing a filter reloads only the widgets that use it, keeping their data on screen as `stale` meanwhile. A widget uses every filter unless its definition sets `filters: ['store']` (some) or `filters: []` (none); a loaded widget carries the values as `widget.filters`, and detail loaders receive them too. `Dashboard` shows a `FilterBar` above the cards when it has `filters` and `onFilterChange`; `useDashboardFilters` keeps the choices in state, and they are not saved in the layout. Core: `DashboardFilter`, `resolveFilterValues`, `filterValuesFor`, `usesFilter`, `filterCacheParts`, `validateDashboardFilters`, `filterValuesOf`, `loader.setFilterValues`, and `filters` / `filterValues` in the resolve options. React: `FilterBar`, `useDashboardFilters`, the `useDetailData` `filterValues` argument, the `filters` class slot, the `filters` and `filtersReset` labels, and `.dwt-filters` styles.

## 0.24.0

### Minor Changes

- bc69d10: The storage adapter contract and wrappers (`StorageAdapter`, `memoryAdapter`, `withPrefix`, `withFallback`, `withReadCache`, `readOnly`, `withRetry`, `withEncoding`, `withLogging`, `utf8Length`) now come from the new `@richardmcquiston01/storage-adapters` package, which is now the toolkit's one runtime dependency. The toolkit re-exports them, so imports and behaviour do not change. `createLayoutPersistence` is now built on that package's `createPersistence` and stores the same envelope, so saved layouts keep loading. The only visible difference is the wording of the "newer version" error.

## 0.23.0

### Minor Changes

- 328ece2: Click and drill-down events. `Dashboard` and `WidgetGrid` take `onSelect`, which makes table rows, bar-list items, alert-list items and chart positions selectable and reports the pick as a `WidgetSelection` (`widgetKey`, `kind` and a `target`: `{ type: 'row', index, cells }`, `{ type: 'bar' | 'alert', index, item }` or `{ type: 'point', index, label, values }`). A row's `index` is its place in the payload even when the viewer sorted or searched the table. Rows, bars and alert items put a real `<button>` on their label (the first non-link cell in a table) and also select on a click anywhere on the row, never when a link or control inside it is clicked; a chart selects its highlighted position with Enter or Space or a click, and its description says so (`labels.chartSelectHint`). Items and cells with their own `href` stay links. `WidgetContent`, `TableWidget`, `BarListWidget`, `AlertListWidget`, `GraphWidget` and `ResolvedWidgetCard` take `onSelect` too. Core: the `WidgetSelection`, `SelectionTarget` and `PointSelection` types. Styles: `.dwt-selectable`, `.dwt-select` and `.dwt-chart--selectable`.

## 0.22.0

### Minor Changes

- 193389b: Field types for table columns. A `TABLE` column can set `type` to `email` (a `mailto:` link; display names, lists and `?cc=` style parameters are refused), `url` (an absolute http(s) link that opens in a new tab with `rel="noopener noreferrer"`), `image` (an `<img>` with the cell text as alt text, through `isSafeImageUrl`), `color` (a swatch beside the text, `#rgb` or `#rrggbb`) or `custom`. A cell reads the address, URL or color from a string `value`, else its `text`; a value the type can't use shows the text. `custom` columns name a `formatter` you register with `WidgetSettingsProvider`'s `formatters` (`CellFormatter`), with `onFormatterError` for a missing or failing one, and the cell's text stays as visually hidden text. Types carry over to the detail view and work with search and sort, which keep using `text` and `value`. Core: `cellField`, `isSafeEmail`, `isSafeWebUrl`, `isSafeCellColor`, `validateFormatters` and the field checks in `validateWidgetData` and `validateDetailData`. React: `CellContent`, `NewTabIndicator` (the new-tab icon, now shared with `WidgetLink`), and an optional `widgetKey` on `WidgetContent`, `TableWidget` and `WidgetDetail`.

## 0.21.0

### Minor Changes

- 58050cb: Storage, the rest. `useStoredLayout` returns `activePage` and `setActivePage`, which `LayoutPersistence` keeps under its own `:page` key (`loadActivePage`, `saveActivePage`), so a reload returns to the same page and page changes never conflict with the layout. `Dashboard` takes `backup` and `onBackup`: it reports the pre-edit snapshot when an edit session starts and `null` when it ends, and an edit session that starts while a `backup` is given resumes from it, so Revert survives a reload mid-edit. `LayoutPersistence` gains `clearBackup` (and `reset` also removes the stored page); `stored.setBackup(null)` now removes the stored backup too, which needs an adapter with `remove`. Cards carry the author's title as `data-dwt-default-title`, so styles and tests can find a card the viewer renamed.

## 0.20.0

### Minor Changes

- e8cd7f7: Theming, the rest. React: `WidgetTheme` renders a theme's `<style>` and a scope wrapper (only the `<style>` for a custom `scope`; `nonce` supported), and `Dashboard` takes a `theme` prop that does the same. Core: `checkTheme` returns contrast and color-vision warnings for a theme (text 4.5:1; focus, good and bad 3:1; chart marks 2:1; neighbouring series distinct in OKLab and under simulated protanopia, deuteranopia and tritanopia), with `info` entries for values it cannot read; the color helpers `parseColor`, `contrastRatio`, `colorDistance`, `simulateVision`, `composite` and `relativeLuminance` are exported; `THEME_DEFAULTS` holds the built-in token values (a test keeps it equal to `styles.css`); `themePresets` has `highContrast`, `compact` and `mono`.

## 0.19.0

### Minor Changes

- 2f57539: URL deep links for the detail view. `Dashboard` takes `detail` (controlled: `{ key, query }` or `null`), `defaultDetail` and `onDetailChange(next, reason)` with reason `open`, `query` or `close`, so you can keep the open detail view in the URL (push on open and close, replace on query changes). New core helpers: `parseDetailLink` (reads `?widget=orders&sort=total:desc&page=2`, fails with a message naming the widget or parameter), `serializeDetailLink`, `withDetailLink` (keeps your other parameters) and `sanitizeDetailQuery` (a filter or sort from the URL that names a column the data lacks is dropped instead of showing an error). The package still never reads or writes `location`.

## 0.18.0

### Minor Changes

- 4664108: Drag-and-drop reordering. Add `draggable` to `Dashboard` and each unlocked card gets a drag handle: press and move with a mouse, finger or pen (the dragged card follows the pointer, the target shows an indicator, the window auto-scrolls near its edges, Escape cancels), or use the keyboard (Space or Enter picks up, arrows move, Space or Enter drops, Escape cancels) with live-region announcements. `onLayoutChange` is called once per drop and commits through `moveWidget`, so pinned widgets and hidden widgets behave as with the move buttons, which stay. New core helpers `dropTargetKey`, `dropPlacement`, `reorderOnto`, `listPosition`, `autoScrollStep`; React `usePointerReorder`; new labels `dragHandle`, `pickedUp`, `movedTo`, `dropped`, `dragCancelled`; `WidgetCard` accepts `style`.
- 751fc70: Detail view server mode. With `detail: { mode: 'server' }` the loader receives the viewer's `query` (search, filters, sort, page, page size) and returns one page plus `totalRows`; every change asks again, aborting the previous request and keeping the old page on screen (`aria-busy`). Search and filter inputs wait 300 ms after the last key. New: core `serverPage`, `clampServerQuery` and `validateDetailData(data, subject, { mode, pageSize })`; React `WidgetDetail` props `mode` and `busy`, `useDetailData(..., { query })`, `DetailLoadState.refreshing`, `SERVER_INPUT_DEBOUNCE_MS`.
- 919997d: Adding or deleting a clone (or any change to `definitions`) no longer reloads every card. `WidgetLoader` gains `setDefinitions(definitions)`: widgets whose key is still present keep their data and any load in flight, new keys appear as `loading`, removed keys are aborted. `useWidgets` uses it, so only `providers`, `context` and the other options recreate the loader.

## 0.17.0

### Minor Changes

- 91a4937: Add views your provider supplies. A `views` entry without `convert` is loaded by
  the provider: it is called with `options.view` (new on `ProviderOptions`: `'base'`
  or the view's key) and returns a payload of the view's `kind`, so a KPI can show a
  trend or an alert list a table. Only the view being shown loads, each provider
  view is cached apart (`key?view=...`), and converted views still share the base
  load. New: `viewValuesFromLayout`, `useWidgets({ viewValues })` and its `setView`,
  `createWidgetLoader({ viewValues })` and `loader.setView`,
  `ResolveOptions.viewValues`, `loadViewKey`, `loadViewKind`, `isProviderView`, and
  `view` on loaded widgets. `WidgetView.convert` is now optional. Providers written
  before this ignore `options.view` and keep working for widgets without provider
  views; `sort` and `columns` client options apply to the base payload only.

## 0.16.0

### Minor Changes

- b7cf6fc: Add clones. While editing, a card's Arrange menu has **Duplicate**, which makes a
  copy of the widget (stored as `layout.clones`, with its own settings under its own
  key) that shares the original's provider but can have its own view, width, title
  and option values. The Options dialog opens for the new clone and offers **Delete
  this widget**; picking another view suggests a title such as "Recent Orders
  Chart". New core exports: `withClones`, `cleanClones`, `parseClones`,
  `duplicateWidget`, `deleteClone`, `canDuplicate`, `nextCloneKey`,
  `suggestedViewTitle`. `WidgetDefinition.sourceKey` marks a clone, and loaders and
  `resolveWidgets` call the original's provider. `locked.clone` (included in
  `locked: true`) forbids cloning. `normalizeLayout` drops clones that can't exist.
  Layouts without clones are byte-identical. New labels: `menuDuplicate`,
  `duplicate`, `duplicateBlocked`, `duplicated`, `optionsDelete`, `confirmDelete`,
  `deleted`, `suggestedViewTitle`.

## 0.15.0

### Minor Changes

- a02d481: Add alternate views. A widget can declare `views` (and `defaultView`,
  `baseViewLabel`): a table shown as a bar list or chart, a bar list as a table or
  chart, a chart as a table. Each view is built from the widget's own payload by a
  named conversion, so switching never reloads. The Options dialog gets a View
  field (stored as `layout.settings[key].view`), and `Dashboard` applies it. New
  core exports: `applyView`, `convertView`, `viewChoices`, `effectiveViewKey`,
  `viewNote`, `BASE_VIEW_KEY` and the view types. `validateWidgetDefinition` checks
  views. New labels `optionsViewField` and `viewDefault`.

## 0.14.0

### Minor Changes

- 6798ab5: Options dialog and viewer settings. While editing, each card's Arrange menu has an Options… item that opens a dialog for the widget's title, width (within the new `minWidth` / `maxWidth` limits), Grow to fill, and every declared option, with confirmations on Apply, Discard, Reset to defaults and Revert to before editing. The choices are stored in the layout as `layout.settings` (layouts without them are unchanged). New core functions: `applySettings`, `effectiveDefinitions`, `setWidgetSettings`, `clearWidgetSettings`, `widgetOptionValues`, `optionValuesFromLayout`, `isTitleInUse`, `normalizeSettings`; `normalizeLayout` now also cleans settings and counts chosen widths toward page capacity. `locked.options` (included in `locked: true`) hides Options for a widget. Reset layout keeps settings. `WidgetOptionsDialog` is exported.

## 0.13.0

### Minor Changes

- fdcf22a: Theming. New `createTheme` in the core turns typed tokens (`base`, `light`, `dark`; colors, chart series, font, radius, gap, padding) into scoped CSS for the `--dwt-*` custom properties, with specific errors for invalid values and anything that could break out of a declaration. GETTING_STARTED now documents every token with its light and dark default, and explains why variables set on `:root` or a wrapper are shadowed.

## 0.12.0

### Minor Changes

- addc695: One Arrange menu per card. The card's edit controls (move up, move down, move to page, hide) used to be separate buttons and wrapped onto a second row in narrow cards; they are now a single four-arrow icon that opens a small floating menu with Move earlier, Move later, the pages the widget can move to (with free rows and "New page…") and Hide. Locked items are left out, Move earlier and later are disabled at the ends, and the menu has arrow-key navigation, Escape and outside-click to close. Minimize stays its own button. Because the buttons are gone, code or tests that looked for the "Move X earlier", "Move X later" or "Hide X" buttons (or the Move to page icon) now find them inside the menu, once opened, under the same accessible names. New labels: `arrangeWidget`, `menuMoveEarlier`, `menuMoveLater`, `menuHide`.

## 0.11.2

### Patch Changes

- aa42db0: Page editing controls, tidied. "Move to page" is now a compact icon that opens a small floating menu of the other pages (it was a wide select that covered the card title in narrow cards). The card header also wraps, so edit controls move below the title when they don't fit. Delete page uses a trash icon instead of a ×. Pressing Escape (or ✕) in the name field after Add page now removes the page you just added instead of keeping it.

## 0.11.1

### Patch Changes

- f1f5826: Fix a table card's header sort not following its `sort` option: after the viewer (or `optionValues`) chose a different sort, the card kept the header sort it started with. The header now takes the new sort option value.

## 0.11.0

### Minor Changes

- 47dd8b3: Add storage adapters: the `StorageAdapter` contract, `createLayoutPersistence` (versioned envelope, repair against definitions, size limit, serialized saves, conflict policies, backups, other-tab `watch`), adapter wrappers (`memoryAdapter`, `withPrefix`, `withFallback`, `withReadCache`, `readOnly`, `withRetry`, `withEncoding`, `withLogging`) and the `useStoredLayout` React hook. The package still does no I/O; concrete adapters live in your code.
- 83ae29e: Add declared widget options with defaults: `WidgetDefinition.options` (`choice`, `number`, `boolean`, `text`, `dateRange`, `color`, `sort`, `columns`), `ProviderOptions.options` for providers, per-widget reload through `loader.setOptions` and `useWidgets({ optionValues })`, option-aware cache keys, client-side sort and columns, and seeding of table headers and the detail view from a sort option.

## 0.10.0

### Minor Changes

- 850787d: Pages of widgets, the core. A layout can have `pages` (each with its own order, hidden and minimized lists, a title and an optional `maxRows`); layouts without `pages` behave as before and serialize to the same JSON. New pure functions: `pageList`, `pageLayout`, `withPageLayout`, `assignPages`, `pageWidgets`, `pageOf`, `pageRoom`, `addPage`, `renamePage`, `movePage`, `removePage` and `moveWidgetToPage`, which refuse with specific messages (a page that is full, a widget locked against moving). Capacity is counted in rows as the grid draws them with the new `placeRows` and `fitCount`; widgets are never split, and a page that needs more rows than it allows overflows to another page. `normalizeLayout` repairs a layout for saving. Definitions can name a home `page`. `pruneLayout` and `enforceLocks` now cover pages. The React page bar comes later.
- e7d3cfd: Pages in `Dashboard`. A layout with `pages` shows a tab list (a real `tablist` with arrow-key, Home and End navigation, collapsing to dots with Previous and Next buttons under 640px) and renders only the page in view; with one page there is no page bar. New props `activePage`, `defaultActivePage`, `onActivePageChange`, `maxRows` and `maxPages`. While editing there are Add page, Rename, Move left/right and Delete (with the inline confirmation) for the page in view, and a Move to page select on each card that lists free rows and offers "New page…". Moves, restores and deletes that would overflow a page are refused with a specific message. New labels (`pageBar`, `pageTabName`, `addPage`, `moveToPage`, `pageFull`, `emptyPage` and more) and a `pageBar` class slot. Because only the page in view renders, `useWidgets` with `loadWhen: 'visible'` loads each page's widgets the first time the page is shown; `useWidgets` now also picks up cards that appear after the first render, so a widget restored from the Hidden bar loads too.

## 0.9.0

### Minor Changes

- 82b2e5c: Edit mode for `Dashboard`. `editMode="toggle"` shows the move and hide controls only after the viewer presses Customize, with a toolbar (Done, Reset layout, Revert changes), a dashed outline on cards while editing, and a lock icon on locked cards. Reset restores `defaultLayout` and Revert restores the layout from when Customize was pressed; both ask first with an inline "✓" / "X" confirmation. Control it with `editing`, `defaultEditing` and `onEditingChange`, hide the built-in toolbar with `toolbar={false}`, and override the text through `labels`. The default `editMode="always"` is unchanged. With `overrideLocks`, locked cards show a "locked for viewers" icon.

## 0.8.0

### Minor Changes

- 14a6e94: Locked widgets. Set `locked: true` on a definition so viewers can't move, hide or minimize it, or use `{ move, hide, minimize }` to lock only some. A widget locked against moving is pinned: it keeps its place and the others rearrange around it. New `resolveWidgetLock` and `enforceLocks` (for save endpoints), lock-aware `visibleWidgets`, `moveWidget` and `moveWidgetBy`, validation of `locked`, and `Dashboard` withholds the controls a lock covers and enforces locks on the layout it shows. An opt-in `overrideLocks` prop lets administrators arrange locked widgets.

## 0.7.0

### Minor Changes

- b3e8e0f: `TABLE` cells take an optional `value` (a string or finite number) that the card's table controls and the detail view sort and search on instead of the formatted `text`, so columns like "3 days ago", star ratings or "$1,234.00" sort correctly. `validateWidgetData` checks it.

## 0.6.0

### Minor Changes

- cea6e72: Searchable, sortable tables in the card. A `TABLE` definition can set
  `tableControls: true` (or `{ search, sort }`) to get a search box and sortable
  column headers (`aria-sort`) in the card itself, using the detail view's
  `queryRows`. The core adds `resolveTableControls`, `tableDetailData` and the
  `WidgetTableControls` types; `WidgetContent` and `TableWidget` take the
  resolved `tableControls`. `validateWidgetDefinition` checks the setting and
  rejects it on non-TABLE kinds.

## 0.5.0

### Minor Changes

- a1cdd2a: `loadDetail` may now return `undefined` for a widget it has no extra data for;
  a TABLE without a footer or a BAR_LIST then shows its own card data instead of
  needing the loader to rebuild it (`DetailLoader` and `useDetailData` gain the
  `undefined` result and a `fallback` argument). Also memoizes the card-derived
  detail data so it no longer restarts the load on every render.

## 0.4.1

### Patch Changes

- 6499360: Keep the detail view dialog centered under CSS resets that zero every
  element's margin (for example Tailwind's preflight).

## 0.4.0

### Minor Changes

- d34fd83: Detail view, core part (phase 1 of `docs/design/detail-view.md`; no UI yet).
  Widget definitions gain `detail` (`true` or `{ title, pageSize, mode }`), and
  the core adds the data and query types (`DetailData`, `DetailQuery`,
  `DetailProvider`), `queryRows` (accent- and case-insensitive filtering,
  locale-aware and numeric sorting, paging), `serializeDetailQuery` and
  `parseDetailQuery` for URLs, `validateDetailData`, `resolveDetailOptions` and
  `defaultDetailQuery`. `validateWidgetDefinition` checks `detail`.
- 69e07b1: Detail view, React part (client mode). Widgets with `detail` set get a "View"
  eye button (and a clickable title); `Dashboard` opens a modal dialog with
  search, column filters, sortable headers (`aria-sort`) and paging. New
  `Dashboard` props `loadDetail` and `onOpenDetail`; new exports `WidgetDetail`,
  `WidgetDetailDialog`, `useDetailData`, and core `deriveDetailData` (TABLE
  without a footer and BAR_LIST need no loader). `WidgetCard` takes `onView`.
  New labels (`view`, `close`, `search`, `filterBy`, `sortBy`, `noResults`,
  `showingRows`, `previousPage`, `nextPage`, `pageOf`, `pagination`) and a
  `detail` class slot.
- 38d977f: Polish the card controls: icon buttons are now bordered 28px squares with the
  icon centered; minimized widgets move out of the grid into a "Minimized:" bar
  (new label `minimizedWidgets`) instead of leaving an empty card; links that
  open in a new tab get an external-link icon with hidden text (new label
  `opensInNewTab`); and all text and labels use American English ("Minimize",
  "color", "canceled").
- 20e7fe7: Add `width` to widget definitions: an integer from 2 to 12 (twelfths of the
  row). A grid with any `width` becomes 12 columns, reflowing on narrow
  containers. Adds `isWidgetWidth`, `widthForSize`, `itemWidth` and
  `fillWidthSpans` to the core, and validation of `width`.

## 0.3.0

### Minor Changes

- 1857429: Load widget data asynchronously after the page renders (phase 1 of the
  extensions design in `docs/design/widget-extensions.md`).
  
  - New `useWidgets` React hook: returns `loading` placeholders on the first
    render, then loads each widget independently and replaces its placeholder
    when its own data arrives. Options: `loadWhen: 'mount' | 'visible'`,
    `rootMargin`, `refreshMs` (polling, skips hidden tabs and widgets still
    loading), plus the resolve options below. Returns `{ widgets, refresh,
    gridRef }`.
  - New core `createWidgetLoader` (the framework-agnostic logic behind the
    hook): `getSnapshot`, `subscribe`, `load`, `loadAll`, `refresh` and
    `dispose`.
  - Providers get an optional third argument `{ signal: AbortSignal }`
    (`ProviderOptions`), aborted on timeout, refresh or dispose. Existing
    two-argument providers are unaffected.
  - `resolveWidget` and `resolveWidgets` accept `timeoutMs`, `signal`, `cache`
    and `cacheKey`. A timeout or cancellation yields an `error` widget that
    names the key; a provider that ignores its signal is still abandoned.
  - New `WidgetCache` (consumer-supplied storage), `CachedPayload`; ok widgets
    gain optional `updatedAt` and `stale`. Cached payloads are validated again,
    and a failing cache never fails a widget.
  - Cards rendered by `ResolvedWidgetCard` carry `data-widget-key`, and
    `WidgetCard` takes an optional `widgetKey` prop.

## 0.2.0

### Minor Changes

- 46a38d2: Add an optional `fill` setting (`'height' | 'width' | 'both'`) to widget
  definitions. `height` stretches a card to the height of its grid row;
  `width` widens it to take the columns left over in its row, which
  `Dashboard` and `WidgetGrid` compute from the rendered grid. New core exports:
  `WIDGET_FILLS`, `WidgetFill`, `fillColumnSpans`, `baseColumnSpan`,
  `fillsWidth`, `fillsHeight`. `WidgetCard` gains `fill` and `columnSpan` props,
  and `validateWidgetDefinition` checks `fill`.

## 0.1.0

### Minor Changes

- 107459b: First release. A framework-agnostic dashboard widget toolkit, generalised from
  Maker Toolkit's widget system and the McQForYouDesign etsy-dashboard's
  Dashboard tab:
  
  - Core (package root and `./core`, runtime-neutral): widget definitions and
    `defineWidget`; JSON payloads for `TEXT`, `KPI`, `GAUGE`, `TABLE`,
    `BAR_LIST`, `ALERT_LIST` and `GRAPH`, plus an empty state; hand-written
    validators with field-level error messages; `resolveWidgets`, which runs
    providers per key and captures failures per widget; the user layout (order,
    hide, minimise) with tolerant parsing; Intl formatting and KPI deltas; axis
    maths; Maker Toolkit payload and definition upgrades.
  - React (`./react`): `WidgetCard`, a renderer per kind, `WidgetGrid` and a
    layout-aware `Dashboard`; accessible inline-SVG bar and line charts, each
    with a "View as table" twin.
  - `./styles.css`: optional styles driven by `--dwt-*` custom properties, light
    and dark.

All notable changes to `@richardmcquiston01/dashboard-widgets-toolkit` are
recorded here by [Changesets](https://github.com/changesets/changesets). Don't
edit entries by hand; add a changeset with `bun run changeset` instead.
