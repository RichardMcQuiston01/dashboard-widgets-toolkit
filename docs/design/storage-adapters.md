# Design: storage adapters

- **Status:** Draft for review. Decisions 1 to 3 of section 11 come from the
  maintainer; the rest are proposals.
- **Date:** 2026-10-09
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.7.x
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

The toolkit never stores anything: the consumer persists the layout with
`serializeLayout` and `parseLayout`. As the layout grows (settings, clones, pages,
a pre-edit backup), every consumer would write the same glue: load on start, save
on change without hammering the server, cope with failures, survive another tab.
This design defines a small **storage adapter** contract, plus I/O-free helpers
built on it, so developers can plug in localStorage, IndexedDB, a REST API or a
database, and the toolkit supplies everything around the storage itself.

The line is the one the project already draws: **the package defines the contract
and the logic; the consumer's code does the I/O.** No `localStorage`, `fetch` or
database driver enters `src/`.

### Non-goals

- Shipping browser or server I/O inside the core (decided: see section 8).
- Authentication or authorization. A server adapter's endpoint enforces who may
  read or write what.
- Syncing widget data. This is for layouts and backups only.

## 2. Today

`Dashboard` takes `layout` and `onLayoutChange`. The demo app keeps the layout in
React state and the consumer wires persistence by hand. Nothing handles a load in
progress, a failed save, a quota error, two tabs, or the planned backup
(`backup` / `onBackup` in the options design).

## 3. Two levels

### Level 1: the adapter (what a developer writes)

A deliberately tiny, async, string-based key-value contract, so it is easy to
write and impossible to get wrong about the layout's shape:

```ts
type StoreErrorCode =
  | 'unavailable' // storage can't be reached or is disabled
  | 'quota' // storage is full
  | 'forbidden' // not allowed to read or write
  | 'conflict' // the stored revision is newer than the one given
  | 'invalid'; // the adapter was given something it can't store

type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: StoreErrorCode;
      readonly error: string;
    };

interface StoredValue {
  readonly value: string; // the serialized layout
  /** Opaque version (an ETag, a row version) for conflict detection. */
  readonly revision?: string;
}

interface StorageAdapter {
  /** Resolves `{ ok: true, value: null }` when nothing is stored. */
  get(
    key: string,
    options: { readonly signal: AbortSignal }
  ): Promise<StoreResult<StoredValue | null>>;
  set(
    key: string,
    value: string,
    options: { readonly signal: AbortSignal; readonly ifRevision?: string }
  ): Promise<StoreResult<StoredValue>>;
  remove?(
    key: string,
    options: { readonly signal: AbortSignal }
  ): Promise<StoreResult<null>>;
  /** Optional: tell the toolkit the stored value changed elsewhere (another tab). */
  subscribe?(
    key: string,
    onChange: (stored: StoredValue | null) => void
  ): () => void;
}
```

An adapter never throws for expected failures; it returns a `StoreResult` with a
code and a message that names the key and the cause (`Could not save
"dwt:sales:user-42:layout": storage quota exceeded (4.9 MB used).`). A thrown
exception is treated as a bug and reported the same way.

### Level 2: the persistence (what the toolkit provides)

`createLayoutPersistence(adapter, options)` (core, pure) knows about layouts:

```ts
interface LayoutPersistence {
  load(scope: StoreScope, definitions): Promise<Result<LoadedLayout>>;
  save(
    scope: StoreScope,
    layout: DashboardLayout
  ): Promise<Result<SavedLayout>>;
  loadBackup(scope): Promise<Result<DashboardLayout | null>>;
  saveBackup(scope, layout): Promise<Result<null>>;
  reset(scope): Promise<Result<null>>;
}

interface StoreScope {
  readonly dashboardKey: string; // 'sales'
  readonly userKey?: string; // who the layout belongs to; absent for shared defaults
}
```

It builds the adapter key (`dwt:<dashboardKey>:<userKey>:layout`, and `:backup`),
and on the way in and out does the work every consumer would otherwise repeat:

- Wraps the layout in an envelope `{ v: 1, savedAt, layout }` so future versions
  can migrate. A bare layout saved by an older consumer is read as `v: 0`.
- Reads with `parseLayout` (tolerant of corruption) then `normalizeLayout` so a
  stored layout is repaired against today's definitions before use.
- Refuses to save a layout larger than a limit (default 64 KB) with a message that
  names the size.
- Handles `conflict` by the chosen policy (section 6).
- Serializes saves (one in flight, newest wins) so rapid edits never race.

It uses no timers, no DOM and no globals, so it fits the core's rules and is
tested with an in-memory adapter.

## 4. Wrappers

Adapters compose. Small helpers (all pure, all in the core) turn one adapter into
another:

| Wrapper                                     | What it does                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `memoryAdapter()`                           | An in-memory adapter: for tests, SSR and as a fallback                              |
| `withPrefix(adapter, prefix)`               | Namespaces keys (several dashboards, several apps on one origin)                    |
| `withFallback(primary, secondary)`          | Reads from the first that has a value; writes to both (server first, local second)  |
| `withReadCache(adapter)`                    | Remembers the last read in memory                                                   |
| `readOnly(adapter)`                         | Rejects writes with `forbidden` (previewing someone else's layout)                  |
| `withRetry(adapter, { attempts, sleep })`   | Retries `unavailable` errors; the consumer passes `sleep` so the core has no timers |
| `withEncoding(adapter, { encode, decode })` | Transforms values: compression, or encryption with the consumer's own crypto        |
| `withLogging(adapter, log)`                 | Reports operations and errors (keys and codes only, never values)                   |

A developer writing their own wrapper only needs to return an object with the same
four methods.

## 5. React: `useStoredLayout`

In `./react`, one hook joins persistence to `Dashboard`:

```tsx
const stored = useStoredLayout({
  persistence,
  scope: { dashboardKey: 'sales', userKey: user.id },
  definitions,
  defaultLayout, // the organization default; used until loaded and when nothing is stored
  saveDelayMs: 500,
  initialLayout, // optional, from the server render, to avoid a flash
});

<Dashboard
  definitions={definitions}
  layout={stored.layout}
  onLayoutChange={stored.setLayout}
  backup={stored.backup}
  onBackup={stored.setBackup}
/>;
```

It returns `{ layout, setLayout, backup, setBackup, status, error }` where status
is `'loading' | 'ready' | 'saving' | 'error' | 'conflict'`.

- **The dashboard never blocks on storage.** While loading it shows the default
  layout; a failed load or save keeps the in-memory layout working and surfaces
  `error` (a specific message, for the consumer to show or log).
- **Saves are debounced** (`saveDelayMs`) and flushed best-effort when the page is
  hidden (`pagehide`), so a quick edit then close isn't lost.
- **Another tab.** If the adapter implements `subscribe`, a change made elsewhere
  is applied when the viewer isn't editing; during edit mode it shows an inline
  notice, "Layout changed in another tab. Use that version?" with "✓" / "X".
- **Rendering on the server** runs no effects (like every component here): the
  hook returns `initialLayout` or the default.
- **Active page** (pages design) can be stored with the same hook via
  `stored.activePage`, saved under a separate key so it doesn't create layout
  conflicts.

## 6. Conflicts

Two devices edit the same layout. Adapters that support revisions (an ETag, a row
version) let the toolkit detect it: `set` with `ifRevision` fails with `conflict`.
The persistence applies `onConflict`:

- `'overwrite'`: save anyway. Simple, loses the other device's change.
- `'keep-theirs'`: reload the stored layout and drop the local save, with a notice.
- `'ask'` (proposed default for adapters with revisions): set `status: 'conflict'`
  and let the UI choose.
- A function `(mine, theirs) => DashboardLayout` for consumers who want to merge.

Adapters without revisions get last-write-wins, which is the right default for a
personal layout.

## 7. Recipes

Recipes live in the docs and the demo app (consumer code, so I/O is fine there):

- **localStorage:** `get`/`set` over `window.localStorage`, mapping a
  `QuotaExceededError` to `quota` and a blocked or disabled storage to
  `unavailable`; `subscribe` over the `storage` event for other tabs.
- **IndexedDB:** the same contract for larger layouts and many dashboards.
- **REST:** `GET`/`PUT /api/dashboard-layouts/:key` with `ETag` and `If-Match`
  mapped to `revision` and `ifRevision`, and the 412 status mapped to `conflict`.
- **Prisma (Next.js):** a table with singular, snake_case names, a UUID key and
  timestamps, behind an authenticated route handler:

```prisma
model DashboardLayout {
  id           String   @id @default(uuid()) @db.Uuid
  user_id      String   @db.Uuid
  storage_key  String
  value        Json
  revision     Int      @default(1)
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  @@unique([user_id, storage_key])
  @@map("dashboard_layout")
}
```

`set` runs an `updateMany` with `where: { revision: ifRevision }` and increments
`revision`; zero rows updated is a `conflict`.

- **Fallback chain:** `withFallback(restAdapter, localStorageAdapter)` for an app
  that should still remember layouts when the network is down.

## 8. Where code lives

Three options for the concrete adapters (localStorage, IndexedDB, REST):

| Option | Where                                                                  | Trade-off                                                                |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A      | Recipes and the demo app only                                          | Keeps the package storage-free; every consumer copies ~30 lines          |
| B      | A `./storage` subpath with browser adapters                            | Convenient; breaks "never add storage code" and needs a lint exception   |
| C      | A separate companion package (`...-dashboard-widgets-toolkit-storage`) | Convenient and the main package stays clean; a second package to release |

Proposal: **A now, C if the recipes prove popular.** The contract, persistence,
wrappers and hook (everything I/O-free) go in the main package; `CLAUDE.md`'s rule
is clarified to "the package defines storage contracts and I/O-free helpers;
concrete adapters live in consumer code or a companion package".

## 9. Security and privacy

- A stored layout is **untrusted input on the server**: viewers type titles and
  pick option values. A server adapter runs `normalizeLayout(definitions, parseLayout(body))`
  before saving, and enforces the size limit itself.
- **Scope is the adapter's job.** `userKey` is a hint to build a key; a server
  must take the user from the session, never from the request.
- Never put credentials or tokens in a layout or a storage key. `withLogging` logs
  keys and error codes only, never values.
- An encoding wrapper can encrypt before storing; key handling is the consumer's.
- The backup holds a full earlier layout, so it has the same sensitivity and the
  same scope.

## 10. Phasing and testing

| Phase | Scope                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `StorageAdapter`, `StoreResult`, `createLayoutPersistence` (envelope, normalize, size limit, serialized saves, conflict policy), `memoryAdapter`, wrappers |
| 2     | `useStoredLayout` (debounce, flush on `pagehide`, status, other-tab notice), backup and active-page keys                                                   |
| 3     | Recipes in GETTING_STARTED and the demo (localStorage adapter first); revisit option C                                                                     |

Tests (`test/core`, with the in-memory adapter and a scripted failing adapter):
envelope round trips and reading a bare legacy layout; corrupt values give the
default layout and an error message; the size limit; save serialization and
newest-wins; each conflict policy; every wrapper (prefix, fallback order, retry
count with an injected `sleep`, read-only rejection, encoding round trip, logging
never printing values). (`test/react`): the hook's markup states while loading,
and no effects on the server. Real browser (demo): reload keeps the layout, a
second tab's change appears, a disabled localStorage still lets the dashboard work.

## 11. Decisions and open questions

### Decided (2026-10-09)

1. **Storage is the consumer's**, through adapters or wrappers, and is not limited
   to localStorage.
2. **The backup is storable** the same way (`backup` / `onBackup`).
3. **This gets its own design**, separate from the options dialog.

### Still open (proposals above)

4. **Where concrete adapters live** (section 8): recipes now, companion package
   later (proposed)?
5. **Default conflict policy** for adapters with revisions: `'ask'` (proposed), or
   last-write-wins everywhere?
6. **Debounce and flush.** 500 ms and a best-effort flush on `pagehide`?
7. **Backup history.** One snapshot per edit session (proposed), or keep the last
   N?
8. **Shared defaults.** Should the organization default layout load through the
   same persistence (a scope with no `userKey`), so one adapter serves both?
9. **Size limit.** 64 KB by default, configurable?
