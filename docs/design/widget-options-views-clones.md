# Design: widget options, alternate views and clones

- **Status:** Draft for review. Decisions on the gear, Apply, width, Reset and
  defaults are recorded in section 15; the rest are open.
- **Date:** 2026-10-09
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.7.x
- **Builds on:** `lock-and-edit-mode.md` (not yet built)
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

Viewers can already reorder, hide and minimize widgets. This design lets them
tailor a widget itself, through a **gear button** on the card that opens an
**Options dialog**, in three layers that can ship one at a time:

1. **Built-in options.** A widget's **title** and **width**, stored in the
   viewer's layout and applied on top of the author's definition.
2. **Declared options.** Options the _consumer_ defines for a widget (default
   sort, "show top N", a period) and the toolkit renders as form fields. The
   chosen values are handed to the data provider, because some choices change
   _which data_ is loaded, not only how it looks.
3. **Alternate views and clones.** A widget can offer other ways to display
   the same data (a table as a bar list or a chart), and a viewer can clone a
   widget to keep two views side by side.

Under all three sits one rule: **every default is data in the definition**
(default sort, default view, default columns), and a viewer's choices only
override it. That keeps definitions JSON, so a future **Widget Builder** can
generate them (section 11).

The package still never fetches or stores anything. Everything a viewer
chooses lives in the layout JSON that the consumer already persists, and
everything the toolkit shows is limited to what the author allowed.

### Non-goals

- A report or query builder: no choosing arbitrary fields, filters or
  aggregations, no formulas, no creating a widget from nothing. A viewer picks
  from what the author declared.
- Editing data. Options change presentation and provider inputs only.
- Security. Like locks, options are what the UI offers. Values that reach a
  server are untrusted input there (section 9).
- Storing the layout. The consumer persists it with `serializeLayout`.
- Drag and drop and the edit-mode toolbar. They are designed elsewhere;
  this builds on them.

### Terms

- **Setting:** a viewer's value for one widget (title, width, view, option).
- **Option:** a field the author declares that a setting can fill.
- **View:** one way to display a widget (a payload kind plus how to get it).
- **Base view:** the definition's own `kind`.
- **Clone:** a viewer-made copy of a widget with its own settings.
- **Effective definition:** the definition after the viewer's settings are
  applied; what the renderers see.

## 2. Today

- `DashboardLayout` is `{ order, hidden, minimized }`; every function takes
  keys. Nothing in it describes a widget's content.
- A `WidgetDefinition` fixes `title`, `width`, `kind` and `detail` for every
  viewer.
- A provider is `(context, definition, { signal })` and returns a payload.
  `resolvePayload` rejects a payload whose `kind` differs from the
  definition's.
- Caches and loaders are keyed by the widget `key`. `useWidgets` reloads a
  widget when it is refreshed.
- A `TABLE` card shows the rows its provider returned. With a footer ("and 25
  more") it holds only some of them, so sorting in the browser can only reorder
  what is already there.

That last point drives the design: **a choice that changes which rows appear
has to reach the provider.**

## 3. The settings model

Two optional fields on the layout, both plain JSON:

```ts
interface DashboardLayout {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
  readonly minimized: readonly string[];
  /** Viewer choices per widget key (originals and clones). */
  readonly settings?: Readonly<Record<string, WidgetSettings>>;
  /** Widgets the viewer made from others. */
  readonly clones?: readonly WidgetClone[];
}

interface WidgetSettings {
  readonly title?: string;
  readonly width?: number;
  readonly view?: string;
  readonly options?: Readonly<Record<string, OptionValue>>;
}

/** A column list is an array of column keys; the rest are scalars. */
type OptionValue = string | number | boolean | readonly string[];

interface WidgetClone {
  readonly key: string; // unique across definitions and clones
  readonly from: string; // the original's key
}
```

- **Compatible.** Both fields are optional, `EMPTY_LAYOUT` is unchanged, and
  `serializeLayout` leaves them out when empty, so JSON saved today is
  byte-identical. `parseLayout` drops anything malformed (wrong types, unknown
  fields, over-long titles) the way it already tolerates bad input.
- **A clone's settings use its own key** in the same `settings` map, so a clone
  is just another widget to the layout code (ordering, hiding, minimizing).
- **Pure functions** do the work, in `layout.ts`:
  - `applySettings(definition, settings)`: the effective definition.
  - `effectiveDefinitions(definitions, layout)`: originals with settings
    applied, plus materialized clones (section 7).
  - `setWidgetSettings`, `clearWidgetSettings`: immutable updaters that return
    the same object when nothing changes, like the existing ones.
  - `normalizeLayout(definitions, layout)`: `pruneLayout` + `enforceLocks`
    (from the lock design) + clamping of settings, for save endpoints
    (section 9).

## 4. Built-in options: title and width

### The dialog

A gear icon button in the card header (an icon button like the others, with the
accessible name "Options for Revenue") opens `WidgetOptionsDialog`, a native
modal `<dialog>` built the same way as the detail view's.

**The gear shows only in edit mode.** It is one of the customization controls
that appear after the viewer presses Customize, so it can't be hit by accident
while reading. This means the gear needs `editMode: 'toggle'`; in `'always'`
mode there is no edit mode to show it in, so no gear.

The dialog holds:

- **Title:** a text field, placeholder showing the author's title, at most 80
  characters. Plain text only (React escapes it; it is never parsed as HTML).
  Empty means "use the default".
- **Width:** a choice from 2 to 12 (next section), limited to the definition's
  range.
- Further fields from sections 5 and 6 (declared options, view).
- **Apply**, **Cancel**, **Reset to defaults** and **Revert to before editing**
  (see "Reset and revert" below).

### Apply, with confirmation

Nothing is saved until **Apply**. There is no live preview: previewing a
changed option could reload data on every keystroke, and the dialog stays
simple. Two confirmations keep it safe:

- **Closing with unsaved changes** (Cancel, Esc, a click outside) asks
  "Discard your changes?" first. Closing with no changes just closes.
- **Applying** commits through `onLayoutChange` in one call and then announces
  "Options saved" in a live region, with the card showing the result behind the
  closing dialog.

Focus returns to the gear on close. (Whether Apply should also ask "Apply these
changes?" before saving is open question 11; this design does not add a second
prompt to every save.)

### Width: a share of the dashboard

The width choice is the existing 12-column scale: **2 is one sixth of the
dashboard's width and 12 is all of it**, measured inside the page's margins and
padding (the grid's content box), not the browser window. The dialog labels each
step so nobody has to do the arithmetic:

| Value | 2   | 3   | 4   | 5    | 6   | 7    | 8   | 9   | 10  | 11    | 12   |
| ----- | --- | --- | --- | ---- | --- | ---- | --- | --- | --- | ----- | ---- |
| Share | 1/6 | 1/4 | 1/3 | 5/12 | 1/2 | 7/12 | 2/3 | 3/4 | 5/6 | 11/12 | Full |

Column gaps are taken out of the cards, not out of the share, so a "1/2" widget
and its neighbor still fill the row exactly.

### Width limits

Definitions gain `minWidth` and `maxWidth` (integers 2 to 12, `minWidth <=
width <= maxWidth`, validated). Without them the full 2 to 12 range applies.
A table that needs room sets `minWidth: 6`; a KPI tile that looks silly wide
sets `maxWidth: 4`. This answers the cramped-table problem a viewer could
otherwise recreate by narrowing.

### How width and `fill` combine

The effective width is `settings.width`, else `definition.width`, else the
size default. A viewer who chose a width gets it: the effective definition
drops the width half of `fill` (`both` becomes `height`, `width` becomes
nothing). A card that silently grew beyond the width the viewer picked would
look like a bug. This follows from the width being a fixed share of the
dashboard (decided, section 15). The responsive rules (twice the width under
900px, the whole row under 560px) still apply, so a saved width is the wide
layout's width, not a phone's.

### Titles in the rest of the UI

Because every label is built from the title ("Hide Revenue", "Move Revenue
earlier"), the effective title flows through unchanged. The detail view's
heading uses `detail.title` when the author set one, else the effective title.

### Reset and revert

Two different ways back, both behind a confirmation:

- **Reset to defaults** (in the widget's dialog) clears _that widget's_
  settings, so it returns to what the definition (and the organization default
  layout) says. It never touches other widgets, and **it never touches clones**
  of the widget, which keep their own settings.
- **Revert to before editing** restores what the widget looked like when the
  viewer pressed Customize. The edit session keeps a **backup**: when edit mode
  starts, `Dashboard` takes a snapshot of the layout (it is an immutable value,
  so this is a reference, not a copy). "Revert to before editing" in a widget's
  dialog restores that widget's settings from the snapshot; **Revert changes** in
  the toolbar restores the whole layout from it, which also removes clones made
  during the session.

Each asks "Reset these options?" or "Revert to how this looked before you
started editing?" in a small confirmation dialog (an `alertdialog` the toolkit
renders, not `window.confirm`), with the safe button focused by default. The
snapshot lives in memory for the edit session; keeping it across sessions is
open question 12.

The toolbar's **Reset layout** (lock design) resets only the arrangement
(order, hidden, minimized) to the default, also after a confirmation. It does
not clear settings or remove clones.

## 5. Declared options

### API

```ts
type WidgetOption =
  | {
      type: 'choice';
      key: string;
      label: string;
      choices: readonly { value: string; label: string }[];
      default: string;
    }
  | {
      type: 'number';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      default: number;
    }
  | { type: 'boolean'; key: string; label: string; default: boolean }
  | {
      type: 'sort';
      key: string; // by convention 'sort'
      label: string;
      columns: readonly { key: string; label: string }[];
      default?: string; // 'c1:desc'
      /** 'provider' (default) sends it to the provider; 'client' sorts here. */
      apply?: 'provider' | 'client';
    }
  | {
      type: 'columns'; // which table columns show, and in what order
      key: string; // by convention 'columns'
      label: string;
      columns: readonly { key: string; label: string }[];
      default: readonly string[]; // column keys, in order
      /** 'provider' (default) sends it to the provider; 'client' hides here. */
      apply?: 'provider' | 'client';
    };

interface WidgetDefinition {
  // ...existing
  readonly options?: readonly WidgetOption[];
}
```

Definitions stay plain JSON: no functions, no regexes. Labels are the
consumer's strings (their own localization), like `title`.

`validateWidgetDefinition` checks each option (unique keys, a default that is
one of the choices or inside the range, at least one choice, a `sort` option
only on `TABLE` or `BAR_LIST`) and names the path, for example
`options[1].default must be one of "units", "revenue", got "profit".`

### Values and how providers get them

`resolveOptionValues(definition, settings)` returns the value of every declared
option: the viewer's if it is valid for that option, else the default. Unknown
keys and invalid values are ignored, never an error, so a layout saved before
an option changed still loads.

Providers receive them:

```ts
interface ProviderOptions {
  readonly signal: AbortSignal;
  /** Every declared option, resolved. Empty when the definition has none. */
  readonly options: Readonly<Record<string, OptionValue>>;
}
```

The third argument was already optional to use, so existing providers keep
working. A provider that wants "top 10 by revenue" reads `options['limit']` and
`options['sort']`.

### Reloading and caching

- Changing a widget's option values reloads that widget only. The previous
  payload stays visible, marked `stale`, until the new one arrives (the loader
  already supports this).
- `cacheKeyFor` appends the non-default option values, in key order, to the
  widget key, so "top 5 by units" and "top 10 by revenue" are cached
  separately, and a widget on its defaults keeps its present key.
- `useWidgets` takes the layout's settings (or a `settings` argument) and
  passes them to the loader. The loader gains
  `setOptions(key, values)`, which triggers the reload above.

### The `sort` option

Default sorting is the motivating case, so it is a first-class type. Its value
is `columnKey:asc|desc`, the same text the detail view already puts in URLs.

- `apply: 'provider'` (the default, and the only correct choice for a truncated
  table): the value goes to the provider, which returns the right rows.
- `apply: 'client'`: for a complete table (no footer) or a bar list, the
  toolkit sorts the payload itself with `queryRows`, so the provider need not
  know about it.
- Either way it seeds the card's `tableControls` initial sort and the detail
  view's default query, so the choice shows up everywhere the widget does.

If a viewer then clicks a column header in the card, that is a temporary,
unsaved sort on top of the default, as today.

### The `columns` option

The same idea for table columns: the author lists the columns a viewer may show
(`default` is the shown set and its order), and the viewer ticks and orders
them in the dialog. A `client` apply hides and reorders columns of the payload in
the browser; a `provider` apply passes the key list so the provider can skip
expensive columns. The value is an array of column keys, so it is the only option
type that is not a scalar. The detail view's planned "column visibility" reads
the same value.

### Other typical options

`limit` (a `number` option) for "show top N", a `choice` option for the period
or metric, a `boolean` for "include refunds". All reach the provider the same
way. Nothing here fetches anything; it only tells the consumer's provider what
the viewer asked for.

## 6. Alternate views

### What a view is

```ts
interface WidgetView {
  readonly key: string; // 'table', 'bars', 'chart'
  readonly label: string;
  readonly kind: WidgetKind; // what this view renders
  /** Build this view from the base payload. Absent: the provider supplies it. */
  readonly convert?: ViewConversion;
}

interface WidgetDefinition {
  // ...existing
  /** Other ways to show this widget. The base `kind` is always available. */
  readonly views?: readonly WidgetView[];
}
```

Two ways a view gets its payload:

1. **Provider-supplied** (no `convert`): the provider receives
   `options.view` and returns a payload of that view's kind. Always correct,
   costs one load per view (cached separately).
2. **Converted** (`convert` set): the toolkit builds the view from the base
   payload with a named, parameterized conversion. No second load, and
   switching is instant.

Conversions are _data_, not functions, so definitions stay JSON:

```ts
type ViewConversion =
  | { type: 'tableToBarList'; label: number; value: number }
  | {
      type: 'tableToGraph';
      label: number;
      values: readonly number[];
      chartType: 'bar' | 'line';
    }
  | { type: 'barListToTable' }
  | { type: 'graphToTable' }
  | { type: 'barListToGraph'; chartType: 'bar' | 'line' };
```

The same logic is exported as pure functions returning `Result` (`tableToBarList`
and the rest), for consumers who build payloads themselves.

### Rules for conversions

- **Numbers come from `value`.** A table cell's text ("$1,234.00") is for
  reading, so a numeric column must carry `TableCell.value` numbers (added in
  0.7.0). If a needed cell has none, the conversion fails with a message naming
  the widget, view, row and column, for example:
  `Widget "top-products" view "bars": row 3, column 2 ("Sold") has no numeric
value. Add value to the cells.` The widget shows that as its error, and the
  viewer can pick another view.
- **Series limits.** `tableToGraph` is capped at `MAX_GRAPH_SERIES` (8) and the
  validator names the definition if it declares more.
- **Truncated data stays truncated.** A table with a footer converts only the
  rows it holds. A chart of the top 5 is what the viewer gets; a full chart
  needs a provider-supplied view.
- **Lossy by nature.** Converting a bar list to a table loses the share bar;
  a table to a bar list drops the other columns. The dialog says so ("Shows
  Name and Sold only").
- **Kinds without a conversion** (`TEXT`, `KPI`, `GAUGE`, and `ALERT_LIST`
  for now) cannot declare converted views; they can still use provider-supplied
  ones.

### How it renders

The effective definition's `kind` becomes the active view's kind, so existing
renderers and `resolvePayload`'s kind check work unchanged. Validation runs on
the converted payload too. The Options dialog shows a View field (a select) only
when the definition declares views; the viewer can pick only declared ones.

## 7. Clones

### Model

A clone is a viewer-made copy of a widget that shares the original's data and
has settings of its own:

- Created from the dialog ("Duplicate this widget") or a card control in edit
  mode. The new clone gets the key `from#n` (n = highest existing suffix plus
  one), the title "Revenue (copy)", and its dialog opens straight away so the
  viewer can pick a view.
- Stored as `{ key, from }` in `layout.clones`, its settings in
  `layout.settings[cloneKey]`, and placed in `order` right after its original.
- `effectiveDefinitions` builds a definition for each clone by copying the
  original's definition and applying the clone's settings; the clone's
  `key` is the clone key and an internal `sourceKey` points back.
- **Data:** the loader resolves a clone with the _original's_ provider
  (`providers[sourceKey ?? key]`). Cache keys use the source key plus the
  non-default options and the view, so a clone that differs only in width, title
  or a converted view reuses the original's payload with no extra load; one with
  different option values loads separately, as it should.
- **Deleting** a clone removes it from `clones`, `settings`, `order`, `hidden`
  and `minimized`. Originals cannot be deleted, only hidden.

### Rules

- A clone of a clone is a clone of the original (`from` is always an
  original), so there are no chains.
- Clones are viewer-owned: they never inherit the original's locks, so the
  viewer can always move, hide and delete them. A lock on the original can forbid
  cloning it (`locked.clone`, included in `locked: true`).
- A clone exists only while its original is visible to the viewer (roles,
  `active`). If the original disappears, `pruneLayout` and `normalizeLayout`
  drop its clones and their settings.
- A cap, `maxClones` on `Dashboard` (default 12), keeps layouts and load counts
  bounded.
- Clone keys are checked against definitions: a clone whose key collides with a
  real widget key is dropped on parse, never allowed to shadow it.

### Changing a view in place versus cloning

Switching a widget's view in place is just setting `settings[key].view`. Cloning
is for keeping both. "Clone, then hide the original" gives the same result as
replacing it, so the UI needs no separate "replace" concept.

## 8. Lock, edit mode and the other designs

- **Locks** (`lock-and-edit-mode.md`). `WidgetLock` gains `options` (the gear
  and its dialog) and `clone`. `locked: true` covers every field, as decided
  there, so a fully locked widget has no gear and cannot be cloned. Either can
  be switched on alone with the object form. `enforceLocks` and
  `normalizeLayout` drop settings and clones that a lock forbids.
- **Edit mode.** The gear is a customization control that appears only while
  editing (so it needs `editMode: 'toggle'`). The toolbar's Reset layout resets
  arrangement only and asks first; **Revert changes** restores the pre-edit
  snapshot (see "Reset and revert"). This settles the lock design's question
  about a Reset confirmation: it asks.
- **Admin defaults.** `defaultLayout` is a full `DashboardLayout`, so an
  administrator can ship an organization default that includes widths, titles,
  options, views and even clones, using the same editing UI with
  `overrideLocks`. A widget's "Reset to defaults" returns to the definition plus
  this organization default (section 11).
- **Drag and drop.** Clones are ordinary entries in `order`, so they drag like
  anything else. A resize handle on the card edge becomes a shortcut to the
  same `width` setting and can come later with drag and drop.
- **Detail view and `tableControls`.** Both read the effective definition, so a
  viewer's title and default sort apply to them automatically.

## 9. Enforcement

Settings are advisory in the browser and must be checked where the layout is
stored. `normalizeLayout(definitions, layout)` is the one function for that:
prune unknown keys, enforce locks, clamp widths to `minWidth`/`maxWidth`, trim
titles to the limit, drop options and views the definition did not declare or
whose values are invalid, drop clones the lock or the cap forbids, and drop
clones whose original is gone. It is idempotent and returns the same object
when nothing changes.

```ts
const layout = normalizeLayout(definitions, parseLayout(request.body.layout));
await saveLayout(userId, serializeLayout(layout));
```

Option values are also **untrusted input to your provider**. The toolkit
validates a value against its declaration in the browser; a server that receives
`sort=…` or `limit=…` from a client must validate it again (an allowed column
name, a bounded number) before using it in a query. The docs say so next to the
`ProviderOptions.options` example.

## 10. Labels and styling

New `DashboardLabels` entries, all overridable: `options` ("Options"),
`optionsFor(title)`, `optionsTitle`, `optionsWidth`, `optionsView`, `apply`,
`resetToDefaults`, `revertToBeforeEditing`, `revertChanges`, `confirmDiscard`,
`confirmReset`, `confirmRevert`, `confirm`, `keepEditing`, `optionsSaved`, `duplicate`, `duplicateOf(title)`,
`deleteWidget(title)`, `copySuffix` ("copy"), and validation messages for the
width and title fields. Classes follow the convention: `dwt-options`,
`dwt-options-field`, `dwt-gear`, and a `dialog` slot in `classNames`. The dialog
reuses the detail dialog's styles. `styles.css` stays optional.

## 11. Defaults and the Widget Builder

Every widget should arrive with sensible settings already chosen: a default sort,
a default view, a default set of columns. They are not special cases; they are
the `default` of each declared option and a new `defaultView` on the definition:

```ts
interface WidgetDefinition {
  // ...existing
  /** The view shown until a viewer picks another (a `views` key). Default: the base kind. */
  readonly defaultView?: string;
}
```

A widget's effective settings come from three layers, later ones winning:

1. **The definition:** option defaults, `defaultView`, `width`, `title`.
2. **The organization default layout** (`defaultLayout`), if the consumer ships one.
3. **The viewer's saved settings** (`layout.settings`).

A temporary column-header click in the card is a session detail on top of
these, never saved.

### Why this matters for a builder

An administrator-facing **Widget Builder** is a plausible later feature: a form
that lets a non-developer create a widget by choosing a data source, a display
type, the columns and a default sort. Nothing in it needs new machinery if the
rules above hold:

- A builder's output is a `WidgetDefinition` as JSON: `kind`, `views`,
  `defaultView`, `options` with their defaults, `width`, `minWidth`, `maxWidth`,
  `detail`, `tableControls`. Because definitions are plain data (no functions;
  conversions are named and parameterized), it can be stored, versioned and
  edited by a UI.
- `validateWidgetDefinition` is the builder's guard: whatever it produces must
  pass, and its messages (which name the field path) become the form's errors.
- **Data stays code.** The builder cannot invent a data source. A consumer
  registers the providers they have, and a source description tells the builder
  what each can offer: its fields (key, label, type), which sorts and filters it
  supports, how many rows it returns. The builder then offers only valid
  combinations ("table, columns Name and Sold, default sort Sold descending").
  The source description is a data-source design (the "adapters" idea in
  `widget-extensions.md`), not part of this one.
- The viewer-facing pieces in this design (the Options dialog and the form
  rendering of declared options) can be reused inside the builder, because both
  edit the same option declarations: one for a definition's defaults, one for a
  viewer's overrides.

The builder itself is out of scope here. It is listed as a later phase so the
data model stays honest: **anything the builder will set must already be
expressible as definition data.**

## 12. Phasing

Each phase is a minor release with its own changeset, README and
GETTING_STARTED text, and a ROADMAP update. Version numbers are indicative; they
follow the lock and edit-mode releases (0.8.0 and 0.9.0).

| Phase | Version | Scope                                                                                                                                                                                                                                      |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | 0.10.0  | Declared options with defaults (`choice`, `number`, `boolean`, `sort`, `columns`), `ProviderOptions.options`, per-widget reload, cache keys, client-side sort and columns, seeding of table controls and the detail view. No gear needed   |
| 2     | 0.11.0  | `layout.settings`, `applySettings`, `normalizeLayout`, `minWidth`/`maxWidth`, gear and Options dialog (title, width, declared options), Apply and discard confirmations, Reset to defaults, pre-edit snapshot and Revert, `locked.options` |
| 3     | 0.12.0  | `views`, `defaultView` and conversions (provider-supplied and converted), the View field                                                                                                                                                   |
| 4     | 0.13.0  | `clones`, `maxClones`, `locked.clone`, Duplicate and Delete                                                                                                                                                                                |
| 5     | later   | Widget Builder and data-source descriptions, in their own design                                                                                                                                                                           |

Phase 1 is the most valuable on its own and needs no new UI: authors get default
sorts, "top N" and column sets, with the viewer's choice arriving later in phase 2
through the same declarations. It is also what a Widget Builder bakes in, so it
comes first. Phase 2 needs edit mode (0.9.0). Phase 4 needs phase 3 to be
interesting but not to work.

## 13. Testing

Pure logic, in `test/core`: `parseLayout`/`serializeLayout` round trips with and
without the new fields and byte-identical output for old layouts; `applySettings`
with width clamping, `fill` handling and titles; `resolveOptionValues` for
valid, invalid and unknown values; `cacheKeyFor` stability and ordering; every
conversion with good and bad cells and the error text; `effectiveDefinitions`
with clones, key collisions and a missing original; `normalizeLayout`
idempotence and locks; `validateWidgetDefinition` messages for options, views and
limits.

Rendering, in `test/react` with `renderToStaticMarkup`: the gear and dialog
markup, field labels, a dialog for a widget with no options or views (only title
and width), locked widgets without a gear, and unchanged output when none of the
new props or fields are used.

Confirmation and reset, in `test/react` and `test/core`: edit mode takes the
snapshot; Reset to defaults and per-widget Revert leave clones alone; Revert
changes restores the whole layout; closing a changed dialog asks before
discarding and an unchanged one does not; no gear in `always` mode; the width
choices carry their share labels.

Loader, in `test/core`: changing option values reloads only that widget, shows
the previous payload as `stale` meanwhile, and a clone loads through its
original's provider and shares its cache entry.

Real browser (Playwright, in the demo): open the dialog by keyboard, change the
title and width, set a default sort on the products table and see the rows
change, switch the products table to a bar list, clone it, and reload the page to
confirm the layout persists.

## 14. Risks

- **Scope creep toward a BI tool.** The line is "choose among what the author
  declared". Resist free-form field pickers; they are a different product.
- **Lossy conversions surprising people.** The dialog names what a view shows
  and drops, and the error text names the cell to fix.
- **Many loads.** Clones with distinct options multiply provider calls. The cap
  and the cache keys bound it; consumers with expensive providers can lower
  `maxClones`.
- **Layout growth.** Titles, option values and the clone count are capped, so a
  saved layout stays small. `normalizeLayout` enforces the caps on save.
- **Accessibility of the dialog.** It is a form in a native modal: labelled
  fields, errors tied to fields with `aria-describedby`, focus restored to the
  gear, no color-only cues. Tested with keyboard-only runs.
- **Confirmation fatigue.** Prompts guard only destructive actions (discard,
  reset, revert), never a routine Apply, so people don't learn to click through.
- **Builder drift.** If the builder ever emits something the viewer UI can't
  edit, the two diverge. Both are tied to `validateWidgetDefinition` and the same
  option declarations to prevent it.
- **Stale settings.** A saved option value for a choice the author later
  removed falls back to the default instead of failing.

## 15. Decisions and open questions

### Decided (2026-10-09)

1. **The gear shows only in edit mode.** It can't be hit by accident while
   reading. (It therefore needs `editMode: 'toggle'`.)
2. **Apply-only, with confirmation.** No live preview. Closing with unsaved
   changes asks before discarding, and Apply confirms the save.
3. **Width is a fixed share of the dashboard, 2 to 12.** 2 is one sixth and 12 is
   the full width, inside the page margins and padding. Because it is a fixed
   share, the viewer's choice wins over `fill: 'width'`.
4. **Reset is per widget and asks first.** It reverts that widget's settings and
   never touches its clones. A pre-edit backup supports "Revert to before
   editing", per widget and for the whole layout.
5. **Defaults live in the definition.** Each widget carries defaults (sort, view,
   columns) as data, so a future Widget Builder can bake them in. Declared options
   and defaults ship first (phase 1), and viewer overrides follow.

### Still open

6. **Option types.** `choice`, `number`, `boolean`, `sort` and `columns` first. Is
   a free `text` option (a search term, a tag) or a date range needed soon?
7. **Who picks the columns for a converted view?** The author, in the `convert`
   parameters (proposed). Should viewers ever choose the label and value
   columns, accepting more UI and more ways to fail?
8. **Provider-supplied views in the first release of views.** Both kinds are
   proposed together. Would you rather ship converted views only and add
   provider-supplied ones later?
9. **Clone limits and naming.** 12 clones by default, titles "X (copy)", keys
   `from#n`. Reasonable? Should a clone change only its width and title (a
   "second copy") and not its view, in a first cut?
10. **Detail heading.** Use the viewer's title for the detail dialog when the
    author gave none (proposed)?
11. **A second prompt on Apply.** "Confirmation" is read here as: confirm before
    discarding, and confirm the save afterwards. Did you mean a prompt before
    every Apply ("Apply these changes?")?
12. **Backup lifetime.** The pre-edit snapshot lasts for the edit session. Should
    the consumer be able to store it, so Revert still works after a reload (a
    `backup` prop and an `onBackup` callback)?
13. **Where the Widget Builder lives.** Later, in its own design: in this package
    as another subpath (for example `./builder`), or a separate package?
