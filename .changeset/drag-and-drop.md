---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Drag-and-drop reordering. Add `draggable` to `Dashboard` and each unlocked card gets a drag handle: press and move with a mouse, finger or pen (the dragged card follows the pointer, the target shows an indicator, the window auto-scrolls near its edges, Escape cancels), or use the keyboard (Space or Enter picks up, arrows move, Space or Enter drops, Escape cancels) with live-region announcements. `onLayoutChange` is called once per drop and commits through `moveWidget`, so pinned widgets and hidden widgets behave as with the move buttons, which stay. New core helpers `dropTargetKey`, `dropPlacement`, `reorderOnto`, `listPosition`, `autoScrollStep`; React `usePointerReorder`; new labels `dragHandle`, `pickedUp`, `movedTo`, `dropped`, `dragCancelled`; `WidgetCard` accepts `style`.
