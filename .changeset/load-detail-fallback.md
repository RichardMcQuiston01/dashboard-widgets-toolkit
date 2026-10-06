---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

`loadDetail` may now return `undefined` for a widget it has no extra data for;
a TABLE without a footer or a BAR_LIST then shows its own card data instead of
needing the loader to rebuild it (`DetailLoader` and `useDetailData` gain the
`undefined` result and a `fallback` argument). Also memoizes the card-derived
detail data so it no longer restarts the load on every render.
