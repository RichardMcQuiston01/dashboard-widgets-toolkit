---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Drag a widget onto a page tab.

With `draggable` on a paged `Dashboard`, dragging a card over another page's tab (or dot) outlines it, solid when the page can take the card and dashed when the drop would be refused, and releasing moves the card there: the same move, and the same refusal message, as the Arrange menu's "Move to page". A lone widget on a paged dashboard now gets a drag handle too, so a page can be emptied this way. New exports: `tabAtPoint` and `TAB_DROP_SLOP_PX` (core), and the `tabsRef`, `tabFor` and `onDropOnTab` options of `usePointerReorder` (React) for your own page bar.
