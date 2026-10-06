---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Load widget data asynchronously after the page renders (phase 1 of the
extensions design in `docs/design/widget-extensions.md`).

- New `useWidgets` React hook: returns `loading` placeholders on the first
  render, then loads each widget independently and replaces its placeholder
  when its own data arrives. Options: `loadWhen: 'mount' | 'visible'`,
  `rootMargin`, `refreshMs` (polling, skips hidden tabs and widgets still
  loading), plus the resolve options below. Returns `{ widgets, refresh,
  gridRef }`.
- New core `createWidgetLoader` (the framework-agnostic logic behind the
  hook): `getSnapshot`, `subscribe`, `load`, `loadAll`, `refresh` and
  `dispose`.
- Providers get an optional third argument `{ signal: AbortSignal }`
  (`ProviderOptions`), aborted on timeout, refresh or dispose. Existing
  two-argument providers are unaffected.
- `resolveWidget` and `resolveWidgets` accept `timeoutMs`, `signal`, `cache`
  and `cacheKey`. A timeout or cancellation yields an `error` widget that
  names the key; a provider that ignores its signal is still abandoned.
- New `WidgetCache` (consumer-supplied storage), `CachedPayload`; ok widgets
  gain optional `updatedAt` and `stale`. Cached payloads are validated again,
  and a failing cache never fails a widget.
- Cards rendered by `ResolvedWidgetCard` carry `data-widget-key`, and
  `WidgetCard` takes an optional `widgetKey` prop.
