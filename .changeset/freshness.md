---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Freshness. `Dashboard` and `WidgetGrid` take `freshness` ("Updated 2 minutes ago"
under each loaded card, kept current by one timer that fires only when the words
change) and `onRefresh` (a refresh button on each loaded card; pass
`useWidgets`'s `refresh`). A failed `refresh()` (the button, `refreshMs` polling)
now keeps the card's last good data instead of replacing it with an error card:
the widget carries the new `OkWidget.refreshError` and, with `freshness`, shows
"Couldn't refresh. Showing data from 5 minutes ago". `refresh()` also marks the
widget `stale` while it reloads. The core adds `formatAge`, `ageOf` and
`msUntilAgeChanges`. New labels `updatedAgo`, `justNow`, `refreshFailed`,
`refreshFailedHint`, `refreshWidget`, `refreshing` and class slot `freshness`.
Also fills a gap in the 0.26.0 docs: the README and GETTING_STARTED now describe
Export (CSV, SVG, PNG, print).
