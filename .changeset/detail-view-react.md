---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Detail view, React part (client mode). Widgets with `detail` set get a "View"
eye button (and a clickable title); `Dashboard` opens a modal dialog with
search, column filters, sortable headers (`aria-sort`) and paging. New
`Dashboard` props `loadDetail` and `onOpenDetail`; new exports `WidgetDetail`,
`WidgetDetailDialog`, `useDetailData`, and core `deriveDetailData` (TABLE
without a footer and BAR_LIST need no loader). `WidgetCard` takes `onView`.
New labels (`view`, `close`, `search`, `filterBy`, `sortBy`, `noResults`,
`showingRows`, `previousPage`, `nextPage`, `pageOf`, `pagination`) and a
`detail` class slot.
