---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Widget Builder, headless: a `./builder` subpath that creates and edits a widget definition as JSON.

A developer describes a registered provider once with `defineSource` (its `kind`, table `columns`, the `options` it understands as templates, the views it supplies, whether it has a detail view, the filters it uses). An administrator's screen then calls pure functions: `newWidget`, `updateWidget` (plain fields), `exposeOption` / `hideOption`, `availableViews` / `addView` / `removeView`, and `validatePatch` for form errors by field. Every function returns a definition that `validateWidgetDefinition` and `checkAgainstSource` accept, or an error naming the widget, the field and the rule: a widget cannot change its source's kind, widen an option's bounds or choices, name a column or view the source does not have, or ask for a detail view or a filter the source does not offer. `serializeDefinition(s)` writes stable JSON in a `{ version, definitions }` envelope; `parseDefinition(s)` checks it against the registered sources and, for a list, returns the valid rows plus the skipped ones with reasons; `mergeDefinitions` keeps code definitions over stored ones with the same key.

Core: `WidgetDefinition.source` names the provider that feeds a widget, and `providerKeyOf(definition)` (`source`, else `sourceKey`, else `key`) is what the loader, `resolveWidgets` and the cache key now use, so a clone of a builder widget keeps loading from its source. Definitions without `source` behave as before. `validateWidgetDefinition` rejects an empty or non-string `source`.
