# Export

Status: CSV for cards and for the detail view is built. Chart download and print are planned.

## Built

- `widgetToCsv(data, options)` for TABLE, BAR_LIST and GRAPH payloads and
  `detailToCsv(detailData, options)` (core, pure strings, `Result<string>`).
- `queryToCsv(data, query, options)`: client-mode detail data filtered and sorted by the viewer's query, every matching row (page ignored).
- `exportFileName(title, extension, date?)`: a safe file name.
- `Dashboard` / `WidgetGrid` `exportFormats={['csv']}`: a Download button on
  loaded cards that have rows. `onExport(file)` replaces the browser download;
  `onExportError(message)` reports failures. `downloadExportFile` is the one
  DOM call (an object URL and a temporary link).

Decisions:

- Off by default: a dashboard that never asks for it looks the same.
- The package never stores or sends the file. `onExport` is the escape hatch
  for a server-side export.
- Spreadsheet formula injection: text starting with `=`, `+`, `-`, `@`, a tab
  or a carriage return gets a leading `'`, except plain numbers. Turn off with
  `neutralizeFormulas: false` for data you trust.
- Text by default (what the viewer sees); `cells: 'value'` exports the sort
  value behind a formatted cell.

- Detail view: the same `exportFormats` adds a button. Client mode exports all
  matching rows. Server mode calls `onExportDetail({ widgetKey, title, query,
totalRows })` because the package fetches nothing: the host returns
  `DetailData` (the package builds the CSV) or saves the file itself and
  returns nothing. `query` carries the viewer's search, filters and sort at
  page 1 with `pageSize` = `totalRows`; the host must honor it. No callback,
  no button in server mode, so a file never silently holds one page.

## Planned

1. **Chart download.** SVG (serialize the chart's `<svg>` with `<title>` and
   `<desc>`, inline the `--dwt-*` colors so it renders outside the page) and
   PNG (draw the SVG to a canvas at 2x).
2. **Print stylesheet.** Hide controls, break between cards, expand
   minimized cards, show each chart's table twin.

Open question: server-mode exports of very large results (streaming, a size
cap). Today the host decides.
