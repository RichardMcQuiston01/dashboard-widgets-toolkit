---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Detail view server mode. With `detail: { mode: 'server' }` the loader receives the viewer's `query` (search, filters, sort, page, page size) and returns one page plus `totalRows`; every change asks again, aborting the previous request and keeping the old page on screen (`aria-busy`). Search and filter inputs wait 300 ms after the last key. New: core `serverPage`, `clampServerQuery` and `validateDetailData(data, subject, { mode, pageSize })`; React `WidgetDetail` props `mode` and `busy`, `useDetailData(..., { query })`, `DetailLoadState.refreshing`, `SERVER_INPUT_DEBOUNCE_MS`.
