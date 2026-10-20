---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add `/vue`, Vue 3.3+ renderers over the same core and `styles.css` class names as `/react`: `WidgetCard` (with `actions` and `footer` slots), `ResolvedWidgetCard`, one renderer per kind (TEXT, KPI, GAUGE, TABLE with search and sort, BAR_LIST, ALERT_LIST, GRAPH with its "View as table" twin), field types and custom cell formatters, selection, CSV/SVG/PNG export buttons, freshness and refresh, `WidgetSettingsProvider`, `WidgetTheme` and the `useWidgets` composable (`loadWhen: 'visible'`, `prefetch`, polling, options, views and filters). Vue is an optional peer dependency. The layout controls (`Dashboard`, pages, drag and drop) and the dialogs are not in `/vue` yet.
