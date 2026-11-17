---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Adapters and payload builders in the core. `defineAdapter(kind, source, mapper)` makes a normal provider from a `DataSource` (your `load`, which gets the cancellation signal, and an optional `scope` that lets widgets share one running load) and a pure mapper; the compiler checks the mapper returns that kind, and the adapter checks the widget's kind at run time. `bindProviders(definitions, providers)` returns a `Result` that lists every widget without a provider, every adapter of the wrong kind and every provider nothing uses. `toText`, `toKpi`, `toGauge`, `toTable`, `toBarList`, `toAlertList` and `toGraph` build payloads, returning an empty state for an empty list. Nothing fetches: transports stay in your code.
