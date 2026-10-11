---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add alternate views. A widget can declare `views` (and `defaultView`,
`baseViewLabel`): a table shown as a bar list or chart, a bar list as a table or
chart, a chart as a table. Each view is built from the widget's own payload by a
named conversion, so switching never reloads. The Options dialog gets a View
field (stored as `layout.settings[key].view`), and `Dashboard` applies it. New
core exports: `applyView`, `convertView`, `viewChoices`, `effectiveViewKey`,
`viewNote`, `BASE_VIEW_KEY` and the view types. `validateWidgetDefinition` checks
views. New labels `optionsViewField` and `viewDefault`.
