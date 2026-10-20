---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

`/vue`: the layout-aware `Dashboard` and `WidgetGrid`, with `useStoredLayout`. `Dashboard` orders widgets by the viewer's layout and, with `onLayoutChange`, adds hide and show, minimize and its bar, move earlier or later and the Arrange menu (`WidgetEditMenu`), locks (`overrideLocks`), the Customize/Done/Reset/Revert toolbar (`editMode="toggle"`, `backup` / `onBackup`) and pages (tab bar, add, rename, move, delete, Move to page, `maxRows`, `maxPages`), with the same props, labels, classes and markup as the React `Dashboard` (a parity test compares them). `useStoredLayout` joins a `LayoutPersistence` to it with refs for the layout, backup, active page, status, error, conflict and remote changes, and loads nothing while rendering on the server. The Options dialog, clones, the detail view, dashboard filters, drag and drop and swipe are not in `/vue` yet.
