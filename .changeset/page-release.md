---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Release the payloads of far-away pages.

A page keeps its data after the viewer leaves it, so a long-lived dashboard with many pages only grows. `release(keys)` on `useWidgets` (and `loader.release(keys)` on the core loader) now drops the payloads of the widgets you name: a load in flight is aborted and its late result ignored, the card goes back to `loading`, option and view choices are kept, and it loads again the next time its card appears, from your `cache` first when you pass one. `farPageWidgetKeys(definitions, layout, activeKey, keep = 1)` names the widgets on pages more than `keep` pages from the page in view. With `loadWhen: 'mount'`, `useWidgets().release` does nothing, and a widget whose card is on screen is never released. Nothing is released automatically.
