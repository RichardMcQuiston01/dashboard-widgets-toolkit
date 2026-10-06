# Design: drag and drop, asynchronous widget loading, data sources and adapters

- **Status:** Draft for review
- **Date:** 2026-10-06
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.2.0
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

Four extensions are proposed. They are independent enough to ship one at a
time, but they share one idea: **the package defines contracts and pure
helpers; the consumer supplies data and I/O.**

| #   | Extension                                                 | Proposed home                           | Size |
| --- | --------------------------------------------------------- | --------------------------------------- | ---- |
| 1   | Drag-and-drop reordering                                  | `./react` (`Dashboard`)                 | M    |
| 2   | Async (post-load) widget data, refresh, timeouts, caching | `./core` (options) and `./react` (hook) | M    |
| 3   | Data sources, including push (live) sources               | `./core` (contracts); transports: D1    | L    |
| 4   | Adapters: source, then mapper, then a widget              | `./core` (contract and builders)        | M    |

Order of delivery is in section 8. All changes are additive, so each is a
minor release.

### Non-goals

- Fetching, storing or querying anything inside the package (see D1 for the
  one open question about where concrete transports live).
- A new rendering framework. Vue renderers are a separate roadmap item.
- Changing the JSON payload shapes. Adapters produce the existing seven kinds.

### Constraints this design must respect

These come from `CLAUDE.md` and `ROADMAP.md`:

- `src/core` is runtime-neutral: no DOM, no Node built-ins, no React, no
  `fetch`, `window` or `localStorage` (ESLint enforces it).
- ESM and CommonJS builds for every entry, with matching declarations.
- Payloads are JSON-serialisable; functions return values the caller checks
  (`Result<T>`); error messages name the widget, the field and the problem.
- Accessibility is a requirement, not a polish step. Everything draggable
  keeps a keyboard path.
- ROADMAP "Never": data fetching, storage or database code in the package.

## 2. Where things stand today

A short reference, because the proposals build on it.

- **Definition:** `defineWidget({ key, title, kind, sortOrder?, roles?,
defaultSize?, fill? })`.
- **Provider:** `WidgetProvider<C> = (context, definition) => WidgetPayload |
Promise<WidgetPayload>`, registered per widget key in `WidgetProviders<C>`.
  It may be sync or async and may throw.
- **Resolution:** `resolveWidgets(definitions, providers, context, options)`
  runs the providers in parallel and returns one `ResolvedWidget` per visible
  widget (`ok`, `empty` or `error`). A throw, a missing provider or an invalid
  payload becomes an `error` widget; it never rejects. `resolveWidget` does
  the same for one widget, and `resolvePayload(definition, json)` validates
  JSON that was fetched elsewhere (for example on a server).
- **Loading state:** `loadingWidgets(definitions)` gives `status: 'loading'`
  placeholders. `Dashboard` and `WidgetGrid` accept any mix of loading and
  resolved widgets, so per-widget loading is already representable.
- **Layout:** `DashboardLayout` is plain JSON (`order`, `hidden`,
  `minimized`). `moveWidget(definitions, layout, key, toIndex)` already moves
  to an absolute index and returns the same object when nothing changes.
  `Dashboard` calls `onLayoutChange(next)`; the consumer persists it.
- **What is missing:** cancellation (providers get no `AbortSignal`),
  timeouts, caching, refresh, viewport-triggered loading, push sources, a
  typed adapter contract, and pointer-based reordering.

## 3. Extension 1: drag-and-drop reordering

### Problem

Reordering today uses the move-earlier and move-later buttons. They are
accessible but slow for a long dashboard. The roadmap already lists
drag-and-drop "on top of `moveWidget`, with the move buttons kept as the
keyboard-accessible path". That keeps the data side finished: the work is the
interaction layer.

### Requirements

1. Pointer (mouse, pen) and touch reordering of visible cards.
2. A keyboard path with screen-reader announcements.
3. No new runtime dependency in the default build.
4. Works with variable spans (`large`, `full`, and `fill: 'width'` spans)
   and with the fill-span measurement.
5. No behaviour change unless the consumer opts in.
6. Respects `prefers-reduced-motion`.
7. Server rendering unchanged (no effects needed to show the dashboard).

### Options considered

| Option                          | Pros                                                | Cons                                                             |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| HTML5 drag-and-drop API         | No dependency, little code                          | Poor touch support, limited styling control, weak accessibility  |
| In-house pointer events         | No dependency, full control, touch and pen included | Most code to write and test: hit-testing, scrolling, auto-scroll |
| Adapter for a library (dnd-kit) | Mature behaviour, least code here                   | Peer dependency, a second set of semantics to document           |

**Recommendation:** in-house pointer events behind an opt-in prop, and keep
the buttons. If demand appears, expose an escape hatch (below) so people can
bring a library without the package depending on one.

### Proposed API

```ts
interface DashboardProps {
  // ...existing
  /** Show a drag handle on each card and allow reordering. Needs onLayoutChange. */
  readonly draggable?: boolean;
}

interface DashboardLabels {
  // ...existing
  readonly dragHandle: (title: string) => string; // "Reorder Revenue"
  readonly pickedUp: (title: string, position: number, total: number) => string;
  readonly movedTo: (title: string, position: number, total: number) => string;
  readonly dropped: (title: string, position: number, total: number) => string;
  readonly dragCancelled: (title: string) => string;
}
```

Styling hooks follow the existing convention: stable `dwt-*` classes
(`dwt-drag-handle`, `dwt-card--dragging`, `dwt-drop-indicator`) and new
`--dwt-*` custom properties for the indicator colour.

### Interaction specification

- **Handle:** a real `<button>` in the card header (so it is focusable and
  has a name). Dragging starts from the handle only, so text selection and
  links inside cards keep working.
- **Pointer:** `pointerdown` on the handle starts a drag after a small
  movement threshold; `setPointerCapture` keeps events on the handle. The
  nearest card by centre distance is the drop target; an indicator line shows
  the insertion point. `pointerup` commits with
  `onLayoutChange(moveWidget(definitions, layout, key, toIndex))`;
  `Escape` or `pointercancel` aborts without a change.
- **Touch:** `touch-action: none` on the handle only; the page still scrolls
  elsewhere. Auto-scroll when the pointer nears the viewport edge.
- **Keyboard:** Space or Enter picks up; ArrowUp/ArrowLeft move earlier and
  ArrowDown/ArrowRight later (skipping hidden widgets, as `moveWidget` already
  does); Space or Enter drops; Escape cancels. Each step updates a visually
  hidden `aria-live="polite"` region using the labels above.
- **Reduced motion:** no animated displacement; the indicator moves instantly.
- **WCAG 2.2 criterion 2.5.7 (Dragging Movements):** the existing buttons are
  the required single-pointer alternative, which is why they stay.

### Interaction with the grid

Order is a list of keys, so reordering is independent of spans: after a
commit the grid reflows and the fill-span calculation re-runs because its
inputs (the ordered definitions) changed. During a drag, only a lightweight
preview is shown (a placeholder and the indicator), not a live reflow, to
avoid layout thrash and span flicker. A drag never changes `hidden` or
`minimized`.

### Escape hatch for libraries

Export a small `useDashboardOrder` helper that returns the ordered visible
keys and a `move(key, toIndex)` function. People who prefer dnd-kit or
another library can wire it to their own handles without the package
depending on it.

### Testing

Pure logic (index from pointer position, keyboard transitions, announcement
text) is unit-tested without a DOM. Behaviour is verified in a real browser
in the demo app (Playwright), including touch emulation and keyboard-only
runs. Server rendering gets a `renderToStaticMarkup` check that nothing
changes when `draggable` is off.

### Risks

- Hit-testing in a grid with spans is the fiddly part; a design that works on
  card rectangles rather than grid coordinates avoids most of it.
- Mobile browsers vary in how they treat `touch-action` and long-press; real
  device checks are needed before release.
- Nested scroll containers complicate auto-scroll; v1 supports window scroll
  and one scrollable ancestor.

## 4. Extension 2: asynchronous widget loading, refresh, timeouts and caching

### What "lazy loading" means here

**The primary meaning (owner's definition):** the page, and the dashboard
shell with its cards, render first. Each widget's data is then loaded
asynchronously, after the page has loaded, and each card fills in as its own
data arrives. Nothing about a slow widget delays the page or any other widget.

Two refinements are optional and secondary:

1. **Viewport-triggered loading:** additionally wait to call a provider until
   its card is near the viewport. Useful for long dashboards; not needed for
   the primary meaning.
2. **Lazy code:** split rarely-used renderers (for example charts) from the
   main bundle.

### Today

The building blocks for the primary meaning already exist. `loadingWidgets()`
gives placeholders, so the dashboard can render immediately; `resolveWidget`
resolves one widget independently; and `Dashboard` and `WidgetGrid` accept any
mix of `loading` and resolved widgets. A consumer can therefore start every
provider after the first render and replace each placeholder as its promise
settles. The demo does a simplified version of this: it shows placeholders,
then resolves all widgets together with `resolveWidgets` after a simulated
delay, so all cards appear at once instead of one by one.

What is missing is the ergonomics and the safety around it: a hook that does
this without hand-written effects, per-widget completion, cancellation,
timeouts, refresh and caching, plus the optional viewport trigger. The roadmap
lists "provider timeouts and caching in `resolveWidgets`".

Lazy **code** is low value today: `dist/react.js` is about 49 KB and
`dist/core.js` about 27 KB unminified, and `splitting` is deliberately off.
Revisit if charts grow; a later `./react/charts` entry is the natural split.

### Proposed core changes (runtime-neutral)

Providers gain an optional third argument. Existing providers keep working
because extra parameters are optional.

```ts
interface ProviderOptions {
  /** Aborted on timeout, refresh, unmount or when the widget is hidden. */
  readonly signal: AbortSignal;
}

type WidgetProvider<C = WidgetContext> = (
  context: C,
  definition: WidgetDefinition,
  options: ProviderOptions
) => WidgetPayload | Promise<WidgetPayload>;

interface ResolveOptions {
  readonly validate?: boolean; // existing
  /** Per-widget timeout; a timeout becomes an `error` widget naming the key. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly cache?: WidgetCache;
}

/** Consumer-supplied storage. The package never stores anything itself. */
interface WidgetCache {
  get(
    key: string
  ): CachedPayload | undefined | Promise<CachedPayload | undefined>;
  set(key: string, entry: CachedPayload): void | Promise<void>;
}

interface CachedPayload {
  readonly payload: WidgetPayload;
  readonly storedAt: number; // epoch ms
}
```

`AbortSignal`, `setTimeout` and `AbortController` exist in Node 18+, Bun and
browsers, so the core stays runtime-neutral; the timeout is implemented with
a race and a timer that is always cleared.

Resolved widgets gain optional metadata so UIs can show freshness:

```ts
interface OkWidget {
  // ...existing
  readonly updatedAt?: number; // epoch ms
  readonly stale?: boolean; // shown from cache while revalidating
}
```

**Stale-while-revalidate:** with a cache, `resolveWidget` returns the cached
payload immediately as `stale: true` through the hook (below) and then
replaces it when the provider returns. `resolveWidgets` itself stays a
single-shot function that returns final results; the revalidation flow lives
in the hook.

### Typing constraint in the core (verified)

The core compiles with `lib: ["ES2023"]` and `types: []`, so `AbortSignal`,
`AbortController`, `setTimeout` and `clearTimeout` are **not in scope** there.
A probe file using them fails `tsc` with "Cannot find name 'AbortSignal'".
The runtimes all provide them (Node 18+, Bun, browsers); only the type
declarations are missing. Options:

- **A. A small ambient declaration for the core's own compilation** (a
  `.d.ts` that is not shipped) describing just the members the core uses.
  Emitted declarations then refer to the global `AbortSignal`, which a
  consumer's DOM lib or `@types/node` supplies, so `fetch(url, { signal })`
  type-checks in consumer code. The care needed is avoiding duplicate global
  declarations in the React compilation, which does include the DOM lib.
- **B. A structural `AbortSignalLike` type** exported by the core. No
  ambient globals, but a consumer cannot pass it straight to `fetch`, which
  expects the real `AbortSignal`, so the ergonomics suffer.

**Recommendation:** A, proven with a short spike at the start of phase 1,
before any API is committed. This is decision D7 in section 9.

### Proposed React hook

```ts
interface UseWidgetsOptions<C extends WidgetContext> extends ResolveOptions {
  /** 'mount': start every widget right after the first render (default). */
  readonly loadWhen?: 'mount' | 'visible';
  readonly rootMargin?: string; // IntersectionObserver, default '200px'
  readonly refreshMs?: number; // poll interval; 0 or absent: never
}

declare function useWidgets<C extends WidgetContext>(
  definitions: readonly WidgetDefinition[],
  providers: WidgetProviders<C>,
  context: C,
  options?: UseWidgetsOptions<C>
): {
  readonly widgets: readonly DashboardWidget[];
  readonly refresh: (key?: string) => void;
  readonly gridRef: RefObject<HTMLDivElement | null>; // attach for loadWhen: 'visible'
};
```

Behaviour:

- The first render never waits for data: every widget starts as `loading`, and
  the loads start after mount (in effects), so the page is interactive first.
  Each widget then resolves independently, so cards appear as they finish.
- `loadWhen: 'visible'` (optional) observes each card (`IntersectionObserver`) and runs its
  provider on first approach to the viewport. Hidden widgets are not rendered,
  so they do not load until shown; minimised cards are still in the page, so
  in v1 they load like any other card.
- `refresh(key)` aborts that widget's in-flight call, then re-runs it. This is
  also what the error card's Retry should call.
- Unmount, or a changed `context`, aborts everything in flight; results from a
  superseded run are ignored (the demo already guards against this by hand).
- `refreshMs` polls visible widgets only, and pauses while the tab is hidden
  (`document.visibilityState`).
- Server rendering returns `loading` placeholders; nothing runs on the server.

### Implementation notes (phase 1)

What shipped differs from the sketch above in these ways:

- **D7 resolved with option A.** `types/core-runtime.d.ts` declares the few
  `AbortSignal`, `AbortController` and timer members the core uses. Only
  `tsconfig.json` includes it, so the React and test compilations keep the real
  DOM and Node types and there are no duplicate globals. Core, React and test
  compiles, lint and the build all pass.
- **The logic lives in the core.** `createWidgetLoader` (core) does the
  loading, aborting, caching and de-duplication; `useWidgets` is a thin React
  wrapper. This made the hard parts testable without a DOM and keeps a future
  Vue layer small (Q2).
- **`loadWhen: 'mount' | 'visible'` replaces `lazy`.** `'mount'` is the
  default and is itself asynchronous: first render shows placeholders and the
  loads start in effects. The name now says what it controls.
- **Providers are not called when a load was cancelled before it got a turn,**
  so a dashboard torn down in the same tick starts no requests. This also
  makes React StrictMode's mount, unmount, mount cycle call each provider once.
- **Polling skips widgets still loading** (`refresh(undefined, { skipInFlight:
true })`), because a provider slower than the interval would otherwise be
  restarted forever. An explicit `refresh()` still restarts.
- **Stale data on failure:** if the fresh load fails, the error replaces the
  stale data (so a failure is never hidden). Revisit if users want "keep
  showing stale data and mark it".
- **`gridRef` goes on any element around the cards** (a wrapper `div` works)
  because `Dashboard` renders its own grid element. Cards carry
  `data-widget-key` so the observer can tell which one scrolled into view.
- **Stability requirement:** `definitions`, `providers`, `context` and `cache`
  must be referentially stable, as with any React hook that restarts work when
  its inputs change.

### Testing

Timeouts and polling use fake timers; `IntersectionObserver` is mocked; the
abort path is asserted with a provider that records its signal. Browser checks
in the demo: scroll-triggered loading, refresh, and offline recovery.

### Risks and decisions

- The core has no `AbortSignal` or timer types today (see the typing
  constraint above); settle that first.
- A third provider argument widens a public type. It is additive, but
  `exactOptionalPropertyTypes` and declaration output need checking.
- Caching semantics are easy to get wrong (key choice, invalidation). Keeping
  storage entirely consumer-supplied avoids owning those policies.

## 5. Extension 3: data sources

### The contract today

The package has no "data source" concept by design. A widget's data comes
from a provider function registered under its key; the function returns a
payload of the widget's kind. Therefore any source works as long as consumer
code turns it into that payload.

| Source                        | Works today?    | How                                                    |
| ----------------------------- | --------------- | ------------------------------------------------------ |
| REST / JSON over HTTP         | Yes             | `fetch` inside the provider, then build the payload    |
| GraphQL                       | Yes             | Same                                                   |
| Database (Prisma, SQL)        | Yes             | Query inside the provider (typically on a server)      |
| Computed or in-memory values  | Yes             | A sync provider                                        |
| JSON resolved on a server     | Yes             | Server runs providers; client uses `resolvePayload`    |
| SOAP / XML                    | Yes, indirectly | Wrap the call in a provider; map XML to a payload      |
| Files (CSV, JSON)             | Yes, indirectly | Parse in a provider or an adapter                      |
| Polling                       | Manual          | Re-run the provider yourself; becomes `refreshMs` (4.) |
| WebSocket, Server-Sent Events | No              | A provider resolves once; it cannot push updates       |

SOAP is supported only in the sense that nothing prevents calling it from a
provider. First-party helpers for it are a non-goal; the adapter model in
section 6 is how someone would add one.

### Push (live) sources

A provider returns once, so streams need a second registration type:

```ts
interface StreamHandlers {
  /** Replace the widget's current payload. */
  readonly emit: (payload: WidgetPayload) => void;
  /** Report a failure; the card shows an error and may recover on the next emit. */
  readonly fail: (cause: unknown) => void;
  readonly signal: AbortSignal;
}

/** Starts a live feed for one widget; returns an optional cleanup function. */
type WidgetStream<C = WidgetContext> = (
  context: C,
  definition: WidgetDefinition,
  handlers: StreamHandlers
) => void | (() => void);

type WidgetStreams<C = WidgetContext> = Readonly<
  Record<string, WidgetStream<C>>
>;
```

`useWidgets` accepts `streams` next to `providers`. Per key, a stream takes
precedence if both exist. Every emitted payload goes through the same
validation as a provider result, so a malformed message from a socket becomes
an error on that card, not a crash. Options worth having from the start:
`minIntervalMs` to coalesce bursts (a feed that emits 50 times a second should
not rerender 50 times), and `onStatus` for connected/reconnecting/closed.

### Where transports live (decision D1)

`WidgetStream` and `WidgetProvider` are contracts and cost nothing in the
core. Concrete transports (an HTTP JSON poller, a WebSocket client, an
`EventSource` client) need `fetch`, `WebSocket` or `EventSource`, which the
core's lint rules and the ROADMAP "Never" section forbid inside the package.

- **Option A (recommended):** a separate companion package, for example
  `@richardmcquiston01/dashboard-widgets-sources`, with the transports. The
  core stays free of I/O, the "Never" principle stays literally true, and the
  companion can take dependencies without touching the core's bundle.
- **Option B:** a new `./sources` subpath in this package with a relaxed lint
  config. Simpler to publish, but it weakens the "never fetches" promise and
  needs the ROADMAP wording changed.

Credentials are always the consumer's responsibility: transports accept
headers, tokens and URLs as inputs and never read environment variables or
store secrets.

### Testing

Streams are tested with a fake emitter (no network): emit, emit-too-fast,
malformed payload, `fail`, abort and reconnect. Transports in the companion
package are tested against local servers started in the test.

## 6. Extension 4: adapters

### Goal

Let someone take an API they own, describe once how to fetch it and once how
to turn the response into a widget payload, and register the result against a
widget key, without writing the plumbing (cancellation, errors, caching,
sharing one response between several widgets) each time.

### Concept: source, then mapper

```ts
/** Gets raw data. Knows about transports, auth and pagination. */
interface DataSource<C extends WidgetContext, Raw> {
  readonly id: string; // used to share and cache one response between widgets
  load(context: C, options: ProviderOptions): Promise<Raw>;
}

/** Pure: raw data in, widget payload out. Easy to unit-test. */
type Mapper<Raw, K extends WidgetKind, C extends WidgetContext> = (
  raw: Raw,
  context: C
) => WidgetDataOf<K> | WidgetEmptyState;

/** An adapter is a source plus a mapper, ready to register as a provider. */
declare function defineAdapter<
  C extends WidgetContext,
  Raw,
  K extends WidgetKind,
>(
  kind: K,
  source: DataSource<C, Raw>,
  map: Mapper<Raw, K, C>
): WidgetProvider<C>;
```

`WidgetDataOf<K>` already exists in the core, so the compiler can check that
a table mapper returns a table payload.

Key properties:

- **A normal provider comes out.** `defineAdapter` returns a
  `WidgetProvider<C>`, so adapters work with `resolveWidgets`, `useWidgets` and
  today's code. Nothing about registration changes.
- **Errors are named.** A thrown fetch error or mapper error is wrapped by the
  existing `resolveWidget` path, so the card says which widget failed and why.
- **Validation still runs after mapping.** A mapper bug (a string where a
  number belongs) is reported with the field path, exactly like any provider.
- **One response, many widgets.** `defineAdapter` calls
  `source.load` through a small in-flight de-duplication keyed by
  `source.id` and the context, so an "orders" API feeding three widgets is
  fetched once per resolve. Longer-lived caching uses `WidgetCache` (section 4).

### Payload builders

Hand-building payloads is verbose, so the core gains pure builders. They only
construct valid objects; they do no I/O.

```ts
declare function toKpi(input: {
  readonly label: string;
  readonly value: number;
  readonly previous?: number | null;
  readonly format: ValueFormat;
  readonly currency?: string;
  readonly higherIsBetter?: boolean;
}): KpiWidgetData;

declare function toTable<T>(
  rows: readonly T[],
  columns: readonly {
    readonly label: string;
    readonly numeric?: boolean;
    readonly cell: (row: T) => {
      readonly text: string;
      readonly href?: string;
    };
  }[]
): TableWidgetData | WidgetEmptyState; // empty state when there are no rows

declare function toBarList<T>(
  items: readonly T[],
  pick: {
    readonly label: (item: T) => string;
    readonly value: (item: T) => number;
  }
): BarListWidgetData | WidgetEmptyState;

// toGauge, toText, toAlertList and toGraph follow the same pattern.
```

Builders return the empty state for empty input, which is a very common
adapter bug when done by hand.

### Worked example: an API into a table

```ts
interface OrderApiResponse {
  readonly orders: readonly {
    readonly id: string;
    readonly customerName: string;
    readonly totalCents: number;
  }[];
}

const ordersSource: DataSource<ShopContext, OrderApiResponse> = {
  id: 'orders-recent',
  async load(
    context: ShopContext,
    { signal }: ProviderOptions
  ): Promise<OrderApiResponse> {
    const response: Response = await fetch(
      `${context.apiBaseUrl}/orders?limit=5`,
      {
        headers: { Authorization: `Bearer ${context.accessToken}` },
        signal,
      }
    );
    if (!response.ok) {
      throw new Error(
        `Orders API returned ${response.status} ${response.statusText}.`
      );
    }
    return (await response.json()) as OrderApiResponse;
  },
};

const recentOrders: WidgetProvider<ShopContext> = defineAdapter(
  'TABLE',
  ordersSource,
  (raw: OrderApiResponse, context: ShopContext) =>
    toTable(raw.orders, [
      { label: 'Order', cell: (order) => ({ text: `#${order.id}` }) },
      { label: 'Customer', cell: (order) => ({ text: order.customerName }) },
      {
        label: 'Total',
        numeric: true,
        cell: (order) => ({
          text: formatValue(order.totalCents / 100, 'currency', {
            locale: context.locale,
            currency: context.currency,
          }),
        }),
      },
    ])
);

const providers: WidgetProviders<ShopContext> = {
  'recent-orders': recentOrders,
};
```

The `fetch` call lives in consumer code (or the companion package from D1),
not in the toolkit. The mapper is a pure function that can be tested with a
plain object.

### Binding helper

```ts
declare function bindProviders<C extends WidgetContext>(
  definitions: readonly WidgetDefinition[],
  adapters: Readonly<Record<string, WidgetProvider<C>>>
): WidgetProviders<C>;
```

It checks, at runtime and in development warnings, that every active
definition has a provider and that adapter keys match definitions. Type-level
checking of "adapter kind equals definition kind" is possible because
`defineWidget` already preserves the literal `kind`.

### Sharing adapters

Adapters for a given service (a shop API, a CMS) can be published as their own
npm packages that export `DataSource` objects and mappers. Because the
contract is small and typed, no coordination with this package is needed
beyond a peer dependency on it.

### Risks

- Over-abstracting. The mapper stays a plain function and the source a plain
  object, so an adapter can always be replaced by a hand-written provider.
- De-duplication keys must include the parts of the context that change the
  request (user, date range), or two viewers could share a response. The key
  is therefore `source.id` plus a consumer-supplied `scope(context)` string,
  defaulting to "no sharing across calls" when absent.

## 7. Cross-cutting concerns

- **Semver:** all four are additive. 0.x allows breaking changes, but nothing
  here requires one.
- **Entry points:** contracts, helpers and builders go in `./core` (and the
  root re-export); `useWidgets`, drag-and-drop and the hook are in `./react`.
  Any new entry needs `tsup.config.ts`, `package.json` `exports` and
  `typesVersions` updated together.
- **Accessibility:** every new interactive element is a real control with a
  name. Loading, stale and error states are announced through the existing
  `role="status"` and `role="alert"` patterns; freshness text is visible, not
  colour-only.
- **Server rendering:** nothing starts on the server. Hooks return loading
  placeholders until mounted.
- **Security:** no network or storage in the core. URLs from payloads still go
  through `isSafeHref`/`isSafeImageUrl`. Stream and source helpers never log
  payloads or credentials.
- **Documentation and demo:** each feature ships with a README section, a
  changeset, and a demo toggle (drag handles, "Load on scroll", a simulated
  live feed and an API adapter example that uses a local fixture, not a real
  service).
- **Testing:** `node:test` for pure logic; `renderToStaticMarkup` for markup;
  browser verification in the demo for interaction, as with the `fill`
  feature.

## 8. Phasing

| Phase | Version (indicative) | Contents                                                                                                                                 | Why this order                                                           |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | 0.3.0                | `ProviderOptions` (`signal`), `timeoutMs`, `WidgetCache`, `useWidgets` with per-widget async loading, `loadWhen`, `refreshMs`, `refresh` | Foundation that the later phases build on; already on the roadmap        |
| 2     | 0.4.0                | `DataSource`, `defineAdapter`, payload builders, `bindProviders`                                                                         | Pure, no I/O, high value, and it needs the `signal` from phase 1         |
| 3     | 0.5.0                | `draggable` on `Dashboard`, labels, `useDashboardOrder`                                                                                  | Independent of the data work; can move earlier if the UI is the priority |
| 4     | 0.6.0                | `WidgetStream`, `streams` in `useWidgets`, `minIntervalMs`; transports per D1                                                            | Largest, and needs the hook, cancellation and adapters first             |

Phases 1 and 3 do not depend on each other and could be built in parallel.

## 9. Decisions and open questions

| ID  | Question                                                                                                  | Recommendation                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D1  | Where do concrete transports (HTTP poller, WebSocket, SSE) live?                                          | Companion package; core keeps contracts only                          |
| D2  | In-house pointer drag-and-drop, or integrate a library?                                                   | In-house, plus `useDashboardOrder` for bring-your-own                 |
| D3  | Should providers get a third `options` argument or a richer context?                                      | Third argument; context stays the consumer's type                     |
| D4  | Should `resolveWidgets` stay single-shot, with progressive flow in the hook?                              | Yes; avoids a second, subtly different resolver                       |
| D5  | Shipping `toKpi`, `toTable` and the other builders in core                                                | Yes; they are pure and runtime-neutral                                |
| D6  | Streaming and polling together under one hook, or two?                                                    | One hook (`useWidgets`), keyed by provider versus stream              |
| D7  | How does the core get `AbortSignal` and timer types without the DOM lib? (Resolved in phase 1: option A.) | Ambient declaration used only by the core's own compile; spike first  |
| Q1  | Should viewers also resize widgets (ROADMAP "widget sizes in the layout")?                                | Out of scope here; it interacts with drag-and-drop, so design it next |
| Q2  | Do we need a Vue port of the hook and drag-and-drop?                                                      | Defer; keep the logic in pure core functions so a Vue layer is thin   |

## 10. Alternatives considered

- **Put fetching helpers in the core.** Rejected: it breaks the runtime
  neutrality and the ROADMAP principle, and forces opinions on auth, retries
  and pagination.
- **A plugin or middleware system for data sources.** More general than
  needed. A typed source and mapper cover the cases in view, and anything
  more elaborate can be built on top of a provider function.
- **Reactive stores (signals or observables) as the data primitive.** Would
  tie the package to a library and complicate the framework-agnostic core;
  `emit` callbacks give the same capability with no dependency.
- **Server-sent layout and data only.** Works (and is supported today through
  `resolvePayload`), but does not help client-driven apps.

## Appendix: roadmap alignment

| Roadmap "Next" item                                       | Covered by              |
| --------------------------------------------------------- | ----------------------- |
| Drag-and-drop reordering                                  | Section 3               |
| Provider timeouts and caching                             | Section 4               |
| Widget sizes in the layout                                | Not covered (Q1)        |
| Vue renderers, sparklines, more chart forms, texture fill | Not covered; unaffected |
| (new) async widget loading, streams, adapters             | Sections 4 to 6         |
