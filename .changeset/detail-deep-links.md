---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

URL deep links for the detail view. `Dashboard` takes `detail` (controlled: `{ key, query }` or `null`), `defaultDetail` and `onDetailChange(next, reason)` with reason `open`, `query` or `close`, so you can keep the open detail view in the URL (push on open and close, replace on query changes). New core helpers: `parseDetailLink` (reads `?widget=orders&sort=total:desc&page=2`, fails with a message naming the widget or parameter), `serializeDetailLink`, `withDetailLink` (keeps your other parameters) and `sanitizeDetailQuery` (a filter or sort from the URL that names a column the data lacks is dropped instead of showing an error). The package still never reads or writes `location`.
