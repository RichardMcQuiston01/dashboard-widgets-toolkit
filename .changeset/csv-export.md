---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

CSV export. `Dashboard` and `WidgetGrid` take `exportFormats={['csv']}` to add a
Download button to loaded table, bar list and chart cards, with `onExport` and
`onExportError` to handle the file yourself. The core adds `widgetToCsv`,
`detailToCsv` and `exportFileName` (RFC 4180 quoting, `cells: 'value'`, custom
delimiter, byte order mark, and a leading quote on text a spreadsheet would run
as a formula). New label `downloadCsv`.
