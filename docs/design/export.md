# Export

Status: CSV for cards is built. The rest is planned.

## Built

- `widgetToCsv(data, options)` for TABLE, BAR_LIST and GRAPH payloads and
  `detailToCsv(detailData, options)` (core, pure strings, `Result<string>`).
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

## Planned

1. **Detail view CSV.** A button in the dialog. Client mode exports the
   filtered, sorted rows. Server mode must export all matching rows: ask the
   host through a callback (for example `onExportDetail(query)`) because the
   package fetches nothing.
2. **Chart download.** SVG (serialize the chart's `<svg>` with `<title>` and
   `<desc>`, inline the `--dwt-*` colors so it renders outside the page) and
   PNG (draw the SVG to a canvas at 2x).
3. **Print stylesheet.** Hide controls, break between cards, expand
   minimized cards, show each chart's table twin.

Open question: whether exports should honor the active detail filters in a card
(they do not today; a card exports what it shows).
