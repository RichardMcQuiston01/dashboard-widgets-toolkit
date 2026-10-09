---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Add storage adapters: the `StorageAdapter` contract, `createLayoutPersistence` (versioned envelope, repair against definitions, size limit, serialized saves, conflict policies, backups, other-tab `watch`), adapter wrappers (`memoryAdapter`, `withPrefix`, `withFallback`, `withReadCache`, `readOnly`, `withRetry`, `withEncoding`, `withLogging`) and the `useStoredLayout` React hook. The package still does no I/O; concrete adapters live in your code.
