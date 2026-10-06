# ROADMAP

## Shipped

- Core: widget definitions, seven payload kinds plus an empty state,
  validators, provider resolution, layout, formatting and axis maths (0.1.0).
- React renderers, `Dashboard`/`WidgetGrid`, SVG charts with table twins, and
  the optional `styles.css` (0.1.0).

## Short term

- **Icon buttons.** Make the card controls (move, hide, minimise) real square
  buttons with the icon centred, so they read as clickable.
- **Detail view.** Let a widget be configured as expandable: clicking its
  title or a "View" (eye icon) button opens a dedicated list view of the data
  with filtering and sorting. Needs a design: the toolkit supplies the view,
  consumers supply the full dataset through the provider.
- **External link icon.** Links that leave the site (`linkTarget` new tab)
  get an icon saying so.
- **Minimise behaviour.** Today a minimised widget is an empty titled box
  taking the same space. Either remove the control, or move minimised widgets
  into their own section (like the hidden bar).
- **American English labels.** "Minimise" becomes "Minimize" (the
  `minimize` label in `src/react/settings.tsx`, README, docs, CHANGELOG
  wording going forward).

## Next

- **Vue renderers** (`./vue`) for Maker Toolkit's Shop Dashboard and other
  Vue 3 apps, over the same core and `styles.css` class names.
- **Drag-and-drop reordering** in `Dashboard`, on top of `moveWidget`, with
  the move buttons kept as the keyboard-accessible path.
- **Widget sizes in the layout.** Let viewers resize a widget (grid column
  and row spans) and persist it alongside order, hidden and minimized, with
  `defaultSize` as the starting point.
- **Sparkline kind** (`SPARKLINE`), and an optional sparkline on `KPI` tiles
  (12 points, current period in the accent).
- **More chart forms**: stacked bars for part-to-whole, and area charts.
- **Provider timeouts and caching** in `resolveWidgets` (per-widget timeout,
  stale-while-revalidate hook), still without the package fetching anything
  itself.
- **Texture fill** for bars (45°/135°) under `forced-colors`, print or an
  accessibility setting, as a second channel after color.

See [docs/design/widget-extensions.md](./docs/design/widget-extensions.md) for
the design of drag-and-drop, lazy loading, data sources and adapters.

## Never

- Data fetching, storage or database code in the package. Consumers supply
  providers and persist layouts themselves.
