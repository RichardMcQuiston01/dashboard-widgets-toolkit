---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add views your provider supplies. A `views` entry without `convert` is loaded by
the provider: it is called with `options.view` (new on `ProviderOptions`: `'base'`
or the view's key) and returns a payload of the view's `kind`, so a KPI can show a
trend or an alert list a table. Only the view being shown loads, each provider
view is cached apart (`key?view=...`), and converted views still share the base
load. New: `viewValuesFromLayout`, `useWidgets({ viewValues })` and its `setView`,
`createWidgetLoader({ viewValues })` and `loader.setView`,
`ResolveOptions.viewValues`, `loadViewKey`, `loadViewKind`, `isProviderView`, and
`view` on loaded widgets. `WidgetView.convert` is now optional. Providers written
before this ignore `options.view` and keep working for widgets without provider
views; `sort` and `columns` client options apply to the base payload only.
