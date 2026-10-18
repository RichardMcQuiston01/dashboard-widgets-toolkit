---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Detail view for widgets with views.

- `loadDetail` and detail providers now receive `options.view`: the view the card loads (`base`, or the key of a view the provider supplies), so a widget with several views can return the rows behind the one on screen. `useDetailData` takes it as a new last argument.
- A chart (`GRAPH`) now has a derived detail view, the same table as "View as table" with search, sorting and paging (`deriveDetailData`). A provider view of kind `GRAPH`, `TABLE` or `BAR_LIST` needs no detail loader when its payload is complete.
- Fixed: the detail view reloaded on every keystroke or page change for a widget with views or viewer settings, because the card's definition was rebuilt on each render.
