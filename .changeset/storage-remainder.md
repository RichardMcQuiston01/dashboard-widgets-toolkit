---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Storage, the rest. `useStoredLayout` returns `activePage` and `setActivePage`, which `LayoutPersistence` keeps under its own `:page` key (`loadActivePage`, `saveActivePage`), so a reload returns to the same page and page changes never conflict with the layout. `Dashboard` takes `backup` and `onBackup`: it reports the pre-edit snapshot when an edit session starts and `null` when it ends, and an edit session that starts while a `backup` is given resumes from it, so Revert survives a reload mid-edit. `LayoutPersistence` gains `clearBackup` (and `reset` also removes the stored page); `stored.setBackup(null)` now removes the stored backup too, which needs an adapter with `remove`. Cards carry the author's title as `data-dwt-default-title`, so styles and tests can find a card the viewer renamed.
