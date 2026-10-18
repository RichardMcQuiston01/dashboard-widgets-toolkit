---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Swipe between pages on touch screens.

On a paged `Dashboard`, swiping left or right on the page shows the next or previous page (right-to-left layouts flip). It never starts on a button, link, field, drag handle or a table that scrolls sideways, does not wrap past the ends, and treats a mostly vertical movement as a scroll; the page bar is unchanged. New exports: `swipeDirection`, `adjacentPageKey` and the swipe constants (core), and `usePageSwipe` (React) for your own page container.
