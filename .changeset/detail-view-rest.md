---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Detail view: a page-size choice and column visibility.

- `detail.pageSizes` (for example `[10, 25, 100]`) adds a "Rows per page" select; `detail.columnVisibility` adds a "Columns" menu. Both are off by default.
- `DetailQuery.hidden` lists the hidden column keys. It is display only: search, filters and sort still cover every column, a server-mode provider is not sent it (`providerQuery`), and CSV exports leave the hidden columns out.
- Deep links carry `size` and `hide`; `serializeDetailLink` writes `size` only when it differs from `DetailLink.defaultPageSize`, which `parseDetailLink` fills in. `parseDetailQuery` takes an `allowed` argument to refuse sizes a widget does not offer.
- New helpers `hideColumns`, `visibleColumnIndexes` and `providerQuery`; new labels `rowsPerPage` and `columnsMenu`.
