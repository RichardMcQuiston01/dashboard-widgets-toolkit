---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

The storage adapter contract and wrappers (`StorageAdapter`, `memoryAdapter`, `withPrefix`, `withFallback`, `withReadCache`, `readOnly`, `withRetry`, `withEncoding`, `withLogging`, `utf8Length`) now come from the new `@richardmcquiston01/storage-adapters` package, which is now the toolkit's one runtime dependency. The toolkit re-exports them, so imports and behaviour do not change. `createLayoutPersistence` is now built on that package's `createPersistence` and stores the same envelope, so saved layouts keep loading. The only visible difference is the wording of the "newer version" error.
