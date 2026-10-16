# Export

Status: built (CSV, chart SVG/PNG, print stylesheet).

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

- Chart download: `exportFormats` takes `'svg'` and `'png'` for GRAPH cards.
  `chartToSvg` (browser-only) clones the rendered `<svg>`, copies every
  element's computed paint (the live chart uses `var(--dwt-*, fallback)`, which a
  saved file cannot resolve) as inline styles, removes the hit layer and
  crosshair, redraws the HTML legend inside the SVG (so a two-series chart is
  readable alone), and sets a background taken from the page so a dark chart is
  not transparent. `svgToPng` draws it to a canvas at 2x. The `<title>` and
  `<desc>` stay.

- Print: an `@media print` block in `styles.css`. It hides controls (card
  actions, toolbar, page tabs, drag handles, filter reset, tooltips, detail
  search and pager), keeps cards whole (`break-inside: avoid`), forces bar and
  line colors to print, opens each chart's table twin through
  `::details-content` (Chromium 131+; elsewhere the chart alone prints), and
  lets an open detail view print in full. A test checks every class the block
  names is rendered by a component, so a rename cannot silently break it.
  Decisions: only the active page prints (the other pages are not in the DOM),
  and minimized cards stay minimized (the viewer chose that). Paper size and
  margins are the host's `@page` rule.

## Open questions

- Server-mode exports of very large results (streaming, a size cap). Today the
  host decides.
- Printing every page of a paged dashboard (needs all pages rendered).
