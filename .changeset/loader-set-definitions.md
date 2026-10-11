---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Adding or deleting a clone (or any change to `definitions`) no longer reloads every card. `WidgetLoader` gains `setDefinitions(definitions)`: widgets whose key is still present keep their data and any load in flight, new keys appear as `loading`, removed keys are aborted. `useWidgets` uses it, so only `providers`, `context` and the other options recreate the loader.
