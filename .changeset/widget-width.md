---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add `width` to widget definitions: an integer from 2 to 12 (twelfths of the
row). A grid with any `width` becomes 12 columns, reflowing on narrow
containers. Adds `isWidgetWidth`, `widthForSize`, `itemWidth` and
`fillWidthSpans` to the core, and validation of `width`.
