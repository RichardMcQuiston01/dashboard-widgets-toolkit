---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Chart download. `exportFormats` accepts `'svg'` and `'png'`, adding buttons to
chart cards that save a standalone picture with its legend, title and
description, painted as on screen (dark themes export dark). The PNG is drawn at
2x. `chartToSvg` and `svgToPng` are exported for custom buttons, `ExportFile`
becomes `TextExportFile` (csv, svg) or `BinaryExportFile` (png), and there are
new labels `downloadSvg` and `downloadPng`.
