---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add clones. While editing, a card's Arrange menu has **Duplicate**, which makes a
copy of the widget (stored as `layout.clones`, with its own settings under its own
key) that shares the original's provider but can have its own view, width, title
and option values. The Options dialog opens for the new clone and offers **Delete
this widget**; picking another view suggests a title such as "Recent Orders
Chart". New core exports: `withClones`, `cleanClones`, `parseClones`,
`duplicateWidget`, `deleteClone`, `canDuplicate`, `nextCloneKey`,
`suggestedViewTitle`. `WidgetDefinition.sourceKey` marks a clone, and loaders and
`resolveWidgets` call the original's provider. `locked.clone` (included in
`locked: true`) forbids cloning. `normalizeLayout` drops clones that can't exist.
Layouts without clones are byte-identical. New labels: `menuDuplicate`,
`duplicate`, `duplicateBlocked`, `duplicated`, `optionsDelete`, `confirmDelete`,
`deleted`, `suggestedViewTitle`.
