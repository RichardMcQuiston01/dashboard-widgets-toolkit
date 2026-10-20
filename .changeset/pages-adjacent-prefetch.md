---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Prefetch the neighbouring pages of a paged dashboard. `nearPageWidgetKeys(definitions, layout, activeKey, reach)` names the widgets on the pages next to the one in view, `useWidgets` takes them as `prefetch` (with `prefetchDelayMs`), and `loader.prefetch(keys)` queues them to load once nothing else is loading, so a swipe lands on data and the cards in view are never held up.
