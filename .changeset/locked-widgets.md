---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Locked widgets. Set `locked: true` on a definition so viewers can't move, hide or minimize it, or use `{ move, hide, minimize }` to lock only some. A widget locked against moving is pinned: it keeps its place and the others rearrange around it. New `resolveWidgetLock` and `enforceLocks` (for save endpoints), lock-aware `visibleWidgets`, `moveWidget` and `moveWidgetBy`, validation of `locked`, and `Dashboard` withholds the controls a lock covers and enforces locks on the layout it shows. An opt-in `overrideLocks` prop lets administrators arrange locked widgets.
