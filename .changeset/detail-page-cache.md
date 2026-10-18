---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Server-mode detail view remembers the pages it has loaded.

Going back to an earlier page, sort or search shows its rows at once (marked busy) while the loader is asked again, instead of keeping the wrong page on screen until the answer arrives. The cache is per open detail view, in memory, and starts over when the dashboard filters, options, view or a retry change. New core helpers: `detailQuerySignature` and `createDetailPageCache`.
