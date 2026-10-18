# Design: the Widget Builder

- **Status:** Phase 1 (headless, 0.30.0) is built, with every recommendation in
  section 12 accepted by the maintainer. Phases 2 (React building blocks, demo
  tab) and 3 (viewer-created widgets) are not built.
- **Date:** 2026-10-18
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.30.x
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

Today a widget is created by a developer, in code: `defineWidget({...})` plus a
provider. The Widget Builder lets an administrator (not a developer) create and
edit widgets from a form: pick a data source the developer made available,
name the widget, choose which of the source's options to expose and their
defaults, choose alternate views, set the width, the roles, the locks. Its
output is a `WidgetDefinition` as JSON, which the consumer stores and passes to
`Dashboard` like any other definition.

The library ships the **headless part**: pure functions in a `./builder`
subpath that create and edit definitions immutably, list what is valid for a
source, validate, and produce the JSON to store. The consumer builds the admin
screen. It still never fetches or stores anything (ROADMAP "Never").

The rule that keeps this small and safe, already fixed in
`widget-options-views-clones.md` section 11: **data stays code.** The builder
cannot invent a data source or a query. It can only combine what a developer
registered and described.

### Non-goals

- Fetching, storing or querying data, or a query or report builder (choosing
  arbitrary fields, filters or joins).
- A built-in admin screen. React building blocks are a later phase (section 9).
- Viewer-created widgets (a viewer building their own). Same functions, later,
  and the consumer's server validates (section 10).
- Editing a viewer's layout (`layout.settings`, order, hide). That already has
  its own UI; the builder edits what a _definition_ says.
- New payload kinds or new view conversions.

## 2. Where things stand

Everything a builder would set is already plain data on `WidgetDefinition`:
`key`, `title`, `description`, `kind`, `sortOrder`, `roles`, `active`,
`width`/`minWidth`/`maxWidth`, `fill`, `detail`, `tableControls`, `locked`,
`page`, `options` (with defaults), `filters`, `views` (named, parameterized
conversions, or provider-supplied), `defaultView`, `baseViewLabel`.
`validateWidgetDefinition` checks all of it and its messages name the field
path. Nothing needs a function or a regular expression, which is why a
definition can be stored.

What is missing is only (a) a way to say what a source can offer, (b) edit
helpers that keep a definition valid while it changes, and (c) a link from a
builder-made definition to the provider that feeds it.

On (c): a definition's data comes from `providers[definition.sourceKey ??
definition.key]`. `sourceKey` exists for clones, and is read as "this is a
clone" in three places: `cleanClones` refuses a clone of a widget that has a
`sourceKey`, `duplicateWidget` follows it back to the original, and the
Options dialog shows Delete for a widget that has one (`dashboard.tsx`). A
builder-made widget must not get those behaviours (a viewer should be able to
duplicate it, and it is not deletable by the viewer), so it needs its own field
(decision D2).

## 3. The model

Three pieces:

1. **A source description** (`SourceDescription`): plain data a developer writes
   once per registered provider. It says what the provider returns and what it
   can be asked for. It lives in code (or a config file), not in the database.
2. **A widget definition**: the builder's output. It carries
   `source: '<source key>'` and only choices the source allows.
3. **The builder functions**: pure `(source, definition, change) => Result`.

The developer registers a provider and describes it:

```ts
const providers = { products: loadProducts }; // as today

const productsSource = defineSource({
  key: 'products', // the provider's key
  label: 'Product sales',
  description: 'Units and revenue per product, last 12 months.',
  kind: 'TABLE', // what the provider returns
  columns: [
    { label: 'Product' },
    { label: 'Sold', numeric: true },
    { label: 'Revenue', numeric: true },
  ],
  options: [
    // what it can be asked for: templates the admin switches on
    {
      key: 'limit',
      type: 'number',
      label: 'Rows',
      min: 3,
      max: 20,
      default: 5,
    },
    {
      key: 'order',
      type: 'sort',
      label: 'Order by',
      apply: 'client',
      columns: [
        { key: 'c1', label: 'Sold' },
        { key: 'c2', label: 'Revenue' },
      ],
      default: 'c2:desc',
    },
  ],
  detail: true, // it can serve a detail view
});
```

An admin then makes "Top 5 products by revenue" and, separately, "Best sellers
by units", from the one source, by choosing a title and different option
defaults. Both load through `providers.products`, with different
`options.limit` and `options.order`, and are cached apart (the cache key
already includes the resolved options).

## 4. `SourceDescription`

```ts
interface SourceDescription {
  /** The provider's key in `providers`. Unique within the descriptions. */
  readonly key: string;
  readonly label: string; // shown in the "pick a source" list
  readonly description?: string;
  /** What the provider returns. The widget's `kind` is this. */
  readonly kind: WidgetKind;
  /**
   * TABLE: the columns in order (conversions and sorts name them by position).
   * Needed to offer conversions: a bar list needs a numeric value column.
   */
  readonly columns?: readonly {
    readonly label: string;
    readonly numeric?: boolean;
  }[];
  /**
   * The options the provider understands: templates with their own key,
   * type, bounds and a default. The admin picks which to expose, may relabel
   * them and may change the default (within the template's bounds). A
   * definition may not declare an option the source does not list.
   */
  readonly options?: readonly WidgetOption[];
  /** Views the provider supplies itself (`options.view`), by key, label, kind. */
  readonly views?: readonly {
    readonly key: string;
    readonly label: string;
    readonly kind: WidgetKind;
  }[];
  /** Whether a detail view is available, and its mode. */
  readonly detail?: boolean | { readonly mode?: DetailMode };
  /** Dashboard filter keys it can use (see `filters.ts`). Absent: any. */
  readonly filters?: readonly string[];
  /** A payload to preview with when the real provider is not wanted. */
  readonly sample?: WidgetPayload;
}
```

Notes:

- It is **JSON-serialisable**, like a definition, so a consumer can generate it
  or keep it in a file. `defineSource` is an identity helper that also
  validates (`validateSourceDescription`: unique option keys, option defaults
  valid for their own template, `columns` present for a TABLE that offers sorts
  or conversions, view keys unique and not `base`).
- It is **not** the adapters' `DataSource` (`widget-extensions.md`, section 6).
  That object does I/O (`load`). This one only _describes_. The two can be tied
  together later (an adapter could emit its description), but neither needs the
  other, and keeping them apart is what keeps the builder free of I/O
  (decision D4).
- `options` reuse the existing `WidgetOption` union as templates, so the same
  validation, defaults and cache-key rules apply and the builder cannot emit
  something the viewer UI cannot edit ("builder drift", risk noted in the
  options design).

## 5. The builder functions

All pure, immutable, and returning `Result<T>` with messages that name the
field path, like the rest of the core. `./builder` imports from `./core`; the
core imports nothing from it.

```ts
// Start
newWidget(source: SourceDescription, input: { key: string; title: string }):
  Result<WidgetDefinition>;
// Edit a plain field (title, description, width, roles, fill, active, page,
// sortOrder, locked, detail, tableControls, baseViewLabel, defaultView, filters).
updateWidget(source, definition, patch: WidgetPatch): Result<WidgetDefinition>;

// Options
exposeOption(source, definition, optionKey: string,
  overrides?: { label?: string; default?: OptionValue }): Result<WidgetDefinition>;
hideOption(definition, optionKey: string): WidgetDefinition;

// Views
availableViews(source, definition): readonly ViewChoice[]; // valid conversions
addView(source, definition, view: WidgetView): Result<WidgetDefinition>;
removeView(definition, viewKey: string): WidgetDefinition;

// Check and output
checkAgainstSource(source, definition): Result<WidgetDefinition>;
serializeDefinition(definition): string; // stable JSON, keys in a fixed order
parseDefinition(text: string, sources: readonly SourceDescription[]):
  Result<{ definition: WidgetDefinition; source: SourceDescription }>;
```

`WidgetPatch` is a `Partial` of the editable fields, so a form sends only what
changed. `availableViews` is what makes the builder more than a validator: for
a TABLE source it lists `tableToBarList` for each (label column, numeric column)
pair the description allows, `tableToGraph` for the numeric columns, and the
source's own provider views, each with a plain label for a dropdown.

Every function ends by running `validateWidgetDefinition` and
`checkAgainstSource`, so no function returns a definition the rest of the
library would reject. `checkAgainstSource` adds what the generic validator
cannot know: `kind` equals `source.kind`; every option is one of the source's
templates, with its type unchanged and its default inside the template's
bounds; every sort and conversion column exists; `defaultView` is `base` or a
view that exists; `detail` and `filters` are no wider than the source offers.

**Forms and half-finished input.** The functions only return valid
definitions, so a form keeps its own draft state while the admin types
(an empty title is not a definition). `validatePatch(source, definition,
patch)` returns every problem at once, keyed by field path, for showing next to
the fields, without producing a definition.

## 6. Storing and loading

The consumer stores the JSON wherever they keep data (a Prisma table with a
`json` column, a file). The library offers:

- `serializeDefinition` and `parseDefinition` (one) and
  `serializeDefinitions`/`parseDefinitions` (a list, in an envelope
  `{ "version": 1, "definitions": [...] }` so a later change can migrate).
- `parseDefinitions` drops nothing silently: it returns the valid ones and a
  list of `{ key, error }` for the rest, so one bad row does not blank the
  dashboard and the admin sees what was skipped.
- `mergeDefinitions(codeDefinitions, storedDefinitions)`: stored definitions
  never replace a code definition with the same key (the code one wins, and the
  clash is reported); keys must be unique across both.

A stored definition needs its source to render. If a source was removed or
renamed, `parseDefinitions` reports the definition as skipped with
`source "x" is not registered`, never as a card that fails at runtime.

## 7. The change to the core

One small, additive change, shipped with phase 1:

```ts
interface WidgetDefinition {
  /** The registered source (provider) that feeds this widget, when it is not
      the widget's own key. Set by the Widget Builder; unrelated to `sourceKey`
      (which marks a clone). */
  readonly source?: string;
}
```

A helper `providerKeyOf(definition)` returns `source ?? sourceKey ?? key`, and
`loader.ts` and `resolve.ts` (the provider lookup and `cacheKeyFor`) use it
instead of reading `sourceKey ?? key` inline. `duplicate.ts` is unchanged: it
uses `sourceKey` to find the original _definition_ (for its lock), not the
provider. Cache keys follow the provider key plus option values, so two builder
widgets on one source with the same options share a cache entry, which is
correct. A definition without `source` behaves exactly as today. A clone copies
its original's fields (`withClones`), so a clone of a builder widget carries
`source` as well as `sourceKey`; putting `source` first in the chain means it
still loads from the source with no lookup, and `cleanClones` is unchanged.

`validateWidgetDefinition` checks `source` is a non-empty string. Whether the source is
registered is the consumer's check (`parseDefinitions` does it).

## 8. How it fits

- **Dashboard and layouts.** A builder widget is an ordinary definition.
  `normalizeLayout` already places a widget no page lists on its home page
  (`definition.page`, else the first), so new widgets appear without editing
  any stored layout. Removing one is removing its row; layouts that still name
  it are pruned by `pruneLayout`.
- **Locks.** `locked` is edited here, as the lock design says ("changing the
  lock itself happens in the Widget Builder"). `updateWidget` accepts it.
  Locking is advisory in the browser; the consumer's server enforces
  (`normalizeLayout`, `enforceLocks`).
- **Roles.** `roles` is plain data and editable; whether the _admin_ may use the
  builder is the consumer's authorization, not the library's.
- **Options and the Options dialog.** The builder edits the _declarations_ (and
  defaults); the Options dialog edits a viewer's _values_. Same types, so a
  value the dialog can save is a value the builder could have set as default.
- **Detail view, export, freshness, pages.** No change: they read the
  definition.

## 9. React building blocks (later phase)

Not part of the first release, listed so the headless API is shaped for them:

- `WidgetOptionsForm`: renders a list of `WidgetOption` declarations as form
  fields with validation messages from `validatePatch` (the same form the
  Options dialog already uses for values, generalised to declarations).
- `WidgetPreview`: renders a definition with the existing renderers over
  `source.sample` (or over data the consumer passes), inside `WidgetTheme`, with
  no provider call.
- A `useWidgetDraft(source, definition)` hook: draft state, `validatePatch` on
  change, `commit()` to a valid definition.

`styles.css` stays optional; new classes follow `dwt-builder-*`.

## 10. Security and trust

A stored definition is data a person typed, so it is treated as untrusted the
same way a layout is:

- The consumer's **server** runs `parseDefinition(s)` (which runs
  `validateWidgetDefinition` and `checkAgainstSource`) before saving and before
  serving. The browser's checks are for the form's benefit only.
- A definition cannot name a provider the developer did not register: an
  unknown `source` is rejected, so it cannot reach arbitrary code or URLs.
- Everything free-text is bounded (`label`, `title`, `description` lengths;
  `text` options have `maxLength`) and rendered as text, never HTML. Links in
  payloads keep their existing scheme checks. Option values that reach a
  database query (`text`, `sort`, `columns`) stay "untrusted input" for the
  provider, as the option docs already say.
- Nothing is evaluated: no expressions, formulas or scripts.

## 11. Phasing

| Phase | Version | Scope                                                                                                                                                                                                                                     |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 0.30.0  | `WidgetDefinition.source` and `providerKeyOf`; `./builder` subpath (tsup entry, `exports`, `typesVersions`): `SourceDescription`, `defineSource`, the functions of section 5, storage helpers (section 6), tests, GETTING_STARTED section |
| 2     | later   | React building blocks (section 9) and a demo "Widget Builder" tab (an admin screen over the demo's providers, with the stored definitions kept in the page's memory or `localStorage`)                                                    |
| 3     | later   | Viewer-created widgets: an allow-list of sources per user and a per-user quota, on top of the same functions, validated on the server                                                                                                     |

Tests (`test/builder`, `node:test`): each function's success and every refusal
message; the "never returns an invalid definition" property over a small
generated set of edits; `checkAgainstSource` for each rule; serialize/parse
round trips including key order; `parseDefinitions` skipping with reasons;
`providerKeyOf` including the clone-of-builder chain; unchanged behaviour for
definitions without `source`. The dual ESM/CJS build must keep working for the
new entry, and the core must not import from `./builder`.

Notes on how phase 1 was built, where it adds to the sketch above:

- `defineSource` throws for an invalid description (a programmer error found
  at module load); `validateSourceDescription` returns a `Result`.
- `checkAgainstSource` also bounds what a stored definition may say: key
  (`WIDGET_KEY_PATTERN`, 1 to 64 characters), title (80) and description (500).
  Options must narrow their template: same type, bounds and choices inside it,
  the same `apply`, and a default the template accepts. A restricted
  `source.filters` requires the widget to list `filters` (an absent list means
  "all").
- `updateWidget` changes only `PATCHABLE_FIELDS`; `key`, `kind`, `source`,
  `options` and `views` are refused by name. `validatePatch` reports each field
  apart and a cross-field problem under the empty key.
- `availableViews` keys are stable (`bars-<label>-<value>`, `bar-chart-<label>`,
  `line-chart-<label>`, `table`, or the source's own view key).
- `parseDefinitions` skips a repeated key (the first is kept) as well as rows
  that fail; the envelope version must equal `DEFINITIONS_VERSION`.

## 12. Decisions and open questions

| ID  | Question                                                                     | Recommendation                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What can a builder-made widget be?                                           | A widget over a registered source: fixed `kind`, chosen options, views, layout and lock settings. Not a free query (non-goal).                                         |
| D2  | How does a definition point at its source?                                   | A new `source` field, not `sourceKey` (which means "clone" in three places). `providerKeyOf` resolves the chain.                                                       |
| D3  | Do the functions return drafts or valid definitions?                         | Valid definitions only (`Result`), plus `validatePatch` for forms. A form holds its own draft state.                                                                   |
| D4  | Tie `SourceDescription` to the adapters' `DataSource`?                       | No. A description is pure data; an adapter does I/O. Keep them apart now; an adapter may emit a description later.                                                     |
| D5  | Where does it live?                                                          | `./builder` subpath in this package (already decided in the options design), no new runtime dependency.                                                                |
| D6  | Storage format?                                                              | A versioned envelope `{ version, definitions }`; `parseDefinitions` returns valid rows plus skipped ones with reasons.                                                 |
| D7  | Who generates widget keys?                                                   | The caller (`newWidget` takes `key`); a helper `uniqueWidgetKey(base, existing)` suggests one. Keys are stable ids layouts refer to, so renaming a key is not an edit. |
| D8  | Can a code definition be edited in the builder?                              | No: code definitions are read-only there (the code wins on a key clash). An admin can create a widget "like" one by starting from its source.                          |
| D9  | Preview data?                                                                | `source.sample` for the headless/preview case; the consumer may instead pass real data. The library never calls a provider for a preview.                              |
| D10 | Is `locked` editable in the builder?                                         | Yes (the lock design says so); the consumer decides who may.                                                                                                           |
| D11 | Version 1 scope: ship the headless functions only, or with the React blocks? | Headless first (phase 1), blocks after the API has been used for real in the demo.                                                                                     |
| D12 | Migrations when a definition's shape changes later?                          | The envelope's `version` is the hook; no migration code until a change needs one.                                                                                      |

## 13. Risks

- **Scope creep toward a query builder.** Mitigation: D1 and the non-goals. A
  source is a developer's contract; the admin picks among its options.
- **Builder drift:** emitting a combination the viewer UI cannot handle.
  Mitigation: options are the same types, every function validates, and the
  demo exercises them.
- **Orphaned definitions** when a source is renamed or removed. Mitigation:
  `parseDefinitions` skips with a reason instead of rendering a broken card.
- **Key clashes** between code and stored definitions. Mitigation: `merge`
  rules (code wins, clash reported).
