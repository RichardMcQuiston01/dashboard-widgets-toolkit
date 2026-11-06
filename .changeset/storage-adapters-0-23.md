---
'@richardmcquiston01/dashboard-widgets-toolkit': patch
---

Use `@richardmcquiston01/storage-adapters` `^0.23.0` (was `^0.3.0`). Layout persistence behaves as before. That package stopped exporting `utf8Length` in 0.16.0, so the toolkit now defines it itself and still exports it from the root and `/core`.
