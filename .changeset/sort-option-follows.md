---
'@richardmcquiston01/dashboard-widgets-toolkit': patch
---

Fix a table card's header sort not following its `sort` option: after the viewer (or `optionValues`) chose a different sort, the card kept the header sort it started with. The header now takes the new sort option value.
