# Freshness

Status: built (age line, refresh button, last good data kept on a failed
refresh). Nothing planned except the open questions below.

## Built

- Core: `OkWidget.refreshError` (a failed refresh with the last good data kept),
  `refresh()` marks the widget `stale` while it reloads, and `formatAge`,
  `ageOf`, `msUntilAgeChanges` (`src/core/freshness.ts`, pure, `Intl` only).
- React: `Dashboard` / `WidgetGrid` `freshness` (the "Updated ..." line,
  `FreshnessLine`) and `onRefresh` (the card's `RefreshButton`). Labels
  `updatedAgo`, `justNow`, `refreshFailed`, `refreshFailedHint`, `refreshWidget`,
  `refreshing`; class slot `freshness`.

## Decisions

- **Only a plain refresh keeps data.** `refresh()` (the button, polling, retry)
  asks the same question again, so the old answer is still the right kind of
  answer. A reload after a filter, option or view change asks a different
  question; showing the old data with a "failed" badge would mislead, so those
  still end in the error card (the data stays only while loading, marked `stale`).
- **No flicker on polling.** The age line keeps saying "Updated ..." while a
  refresh runs; the refresh button shows the busy state (spinner, `aria-disabled`,
  "Refreshing ..."). Otherwise a 30-second poll would flip the text every tick.
- **The words are a bucket, not a counter.** "just now" under 45 seconds, then
  whole minutes, hours, days (rounded down), via `Intl.RelativeTimeFormat`, so
  every locale works. One timer per card fires only when the text changes
  (`msUntilAgeChanges`), not every second.
- **Failure is not color alone.** The badge is a "!" in a ring with the words
  "Couldn't refresh. Showing data from ..."; the error message is in the tooltip
  and the badge is `role="status"`.
- **Cards without `updatedAt` show no line.** Data a provider did not stamp
  (for example from `resolveWidgets` called yourself) simply has none.
- **Printing keeps the line.** "Updated ..." is useful on paper; the refresh
  button is hidden with the other card actions.

## Open questions

- A dashboard-level "Refresh all" and "Last updated" in the toolbar.
- A staleness threshold (`staleAfterMs`) that turns the line into a warning when
  data is older than a widget expects, and per-widget `refreshMs` in the
  definition rather than one interval for the dashboard.
- Whether the server-rendered age should be omitted instead of marked
  `suppressHydrationWarning`.
