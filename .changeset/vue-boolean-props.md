---
'@richardmcquiston01/dashboard-widgets-toolkit': patch
---

Fix Vue boolean props written as bare attributes (`<Dashboard draggable />`, `freshness`, `editing`, `minimized` and the rest): they now cast to `true`. Export `ExportFile`, `ExportFormat`, `TextExportFile`, `BinaryExportFile`, `DetailExportRequest` and `downloadExportFile` from `./vue`, as `./react` does.
