---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add an optional `fill` setting (`'height' | 'width' | 'both'`) to widget
definitions. `height` stretches a card to the height of its grid row;
`width` widens it to take the columns left over in its row, which
`Dashboard` and `WidgetGrid` compute from the rendered grid. New core exports:
`WIDGET_FILLS`, `WidgetFill`, `fillColumnSpans`, `baseColumnSpan`,
`fillsWidth`, `fillsHeight`. `WidgetCard` gains `fill` and `columnSpan` props,
and `validateWidgetDefinition` checks `fill`.
