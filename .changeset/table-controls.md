---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Searchable, sortable tables in the card. A `TABLE` definition can set
`tableControls: true` (or `{ search, sort }`) to get a search box and sortable
column headers (`aria-sort`) in the card itself, using the detail view's
`queryRows`. The core adds `resolveTableControls`, `tableDetailData` and the
`WidgetTableControls` types; `WidgetContent` and `TableWidget` take the
resolved `tableControls`. `validateWidgetDefinition` checks the setting and
rejects it on non-TABLE kinds.
