---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

CSV export from the detail view. `exportFormats={['csv']}` now also adds a
Download CSV button to the detail dialog and `WidgetDetail`: client mode exports
every row the search, filters and sort select (new core `queryToCsv`), and
server mode asks the host through the new `onExportDetail` (on `Dashboard`) or
`onExportAll` (on `WidgetDetail`), then builds the file from the `DetailData` it
returns. New types `DetailExportRequest`.
