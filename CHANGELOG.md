# CHANGELOG

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
