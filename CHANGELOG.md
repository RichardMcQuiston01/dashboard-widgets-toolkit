# CHANGELOG

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
