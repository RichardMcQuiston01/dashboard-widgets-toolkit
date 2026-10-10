# CHANGELOG

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
