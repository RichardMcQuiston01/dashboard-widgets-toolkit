---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Pages of widgets, the core. A layout can have `pages` (each with its own order, hidden and minimized lists, a title and an optional `maxRows`); layouts without `pages` behave as before and serialize to the same JSON. New pure functions: `pageList`, `pageLayout`, `withPageLayout`, `assignPages`, `pageWidgets`, `pageOf`, `pageRoom`, `addPage`, `renamePage`, `movePage`, `removePage` and `moveWidgetToPage`, which refuse with specific messages (a page that is full, a widget locked against moving). Capacity is counted in rows as the grid draws them with the new `placeRows` and `fitCount`; widgets are never split, and a page that needs more rows than it allows overflows to another page. `normalizeLayout` repairs a layout for saving. Definitions can name a home `page`. `pruneLayout` and `enforceLocks` now cover pages. The React page bar comes later.
