---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Options dialog and viewer settings. While editing, each card's Arrange menu has an Options… item that opens a dialog for the widget's title, width (within the new `minWidth` / `maxWidth` limits), Grow to fill, and every declared option, with confirmations on Apply, Discard, Reset to defaults and Revert to before editing. The choices are stored in the layout as `layout.settings` (layouts without them are unchanged). New core functions: `applySettings`, `effectiveDefinitions`, `setWidgetSettings`, `clearWidgetSettings`, `widgetOptionValues`, `optionValuesFromLayout`, `isTitleInUse`, `normalizeSettings`; `normalizeLayout` now also cleans settings and counts chosen widths toward page capacity. `locked.options` (included in `locked: true`) hides Options for a widget. Reset layout keeps settings. `WidgetOptionsDialog` is exported.
