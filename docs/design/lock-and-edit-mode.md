# Design: locked widgets and an edit mode

- **Status:** Draft for review. Decisions 1 to 3 of section 10 are recorded;
  4 to 6 are still open.
- **Date:** 2026-10-09
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.7.x
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

Two small features that belong together:

1. **Locked widgets.** A widget definition can say "viewers can't move, hide or
   minimize this one". The author decides, per widget.
2. **Edit mode.** The customization controls (move, hide, and later drag
   handles) appear only after the viewer presses **Customize**, and go away on
   **Done**. The viewer decides, per session.

They answer the same question at two levels: _who may change the layout?_ A
lock is the author saying no; edit mode is the viewer choosing when to
change things, so a stray click or drag can't rearrange the page. Drag and
drop (`widget-extensions.md`, section 3) needs both: drag handles on every
card all the time are noisy, and a locked card must not get one.

Nothing here changes behavior for existing consumers. Both features are
opt-in, and `DashboardLayout` keeps its shape, so saved layouts still parse.

### Non-goals

- **Security.** A lock controls what the UI offers and what the layout
  helpers will do. It is not access control. Anything that must hold has to be
  enforced where the layout is saved; section 6 gives the helper for that.
- Per-user or per-role permission models. Roles already filter which
  definitions a viewer gets; locks ride on the same definitions (section 4).
- Drag and drop itself, resizing, multiple saved views, and an "Add widget"
  gallery. Each is a separate design; this one only leaves room for them.
- Persisting edit mode. It is a session state; a consumer can store it if it
  wants (the prop is controllable).

### Terms

- **Locked:** the author's setting on a definition (`locked`).
- **Pinned:** a widget locked against moving. It holds a slot in the order.
- **Edit mode:** the state in which customization controls are shown.
- **Free widget:** one that is not pinned.

## 2. Today

`Dashboard` is editable when `onLayoutChange` is passed. Then every card shows
move-earlier, move-later and hide buttons plus a minimize toggle, always. A
"Hidden:" bar lists hidden widgets for restoring and a "Minimized:" bar lists
minimized ones. `DashboardLayout` is `{ order, hidden, minimized }`.
`visibleWidgets` puts saved keys first, then the rest by `sortOrder`.

Gaps:

- The controls can't be turned off per widget, so a required widget (a
  compliance notice, a "system status" tile) can be hidden or buried.
- The controls are always on screen. On a dashboard people mostly read, that
  is clutter, and it is where an accidental drag would come from.
- No way back to the default arrangement.

## 3. Locked widgets

### API

```ts
interface WidgetLock {
  /** Can't be reordered, and holds its place. */
  readonly move?: boolean;
  /** Can't be hidden. */
  readonly hide?: boolean;
  /** Can't be collapsed to its header. */
  readonly minimize?: boolean;
}

interface WidgetDefinition {
  // ...existing
  /**
   * Keeps viewers from rearranging this widget. `true` locks everything:
   * move, hide and minimize. Use an object to lock only some; fields left out
   * are not locked.
   */
  readonly locked?: boolean | WidgetLock;
}
```

`resolveWidgetLock(definition)` returns `{ move, hide, minimize }` with every
default filled in (all `false` when `locked` is absent), the same pattern as
`resolveDetailOptions` and `resolveTableControls`.

`locked: true` means the widget can't be moved, hidden or minimized. Anything
short of that is spelled out: `{ move: true, hide: true }` pins and protects a
widget but still lets the viewer collapse it. A widget that isn't minimize-locked
can be minimized, in any mode (section 4).

### Pinned slots

When `move` is locked the widget is **pinned**: it keeps its place and the
other widgets rearrange around it. The alternative, "can't be dragged but
others can still push it along", is simpler to build and surprising to use: a
viewer moves card A above locked card B and B silently changes position.

The order is computed as:

1. `defaults` = the not-hidden definitions in `sortOrder` order (ties keep
   definition order, as today).
2. A pinned widget's **slot** is its index in `defaults`.
3. Free widgets, in the viewer's saved order (`layout.order`, then the rest by
   `sortOrder`, exactly as today), fill the remaining slots left to right.

A pinned widget's position therefore comes from the definition, never from
`layout.order`. Two consequences are intended:

- **No migration.** A layout saved before a widget was locked may list it in
  `order`. It is ignored for that widget, so the lock takes effect on the next
  render without rewriting anything.
- **Hiding free widgets moves pinned ones with them.** Slots count visible
  widgets, so if the viewer hides two free widgets above a pinned one, it shifts
  up two places. This keeps the arrangement gap-free; it is documented, not
  hidden.

Edge cases: a slot past the end (many widgets hidden) clamps to the end; two
pinned widgets keep their relative order; a definition list with every widget
pinned shows exactly the default order.

### Layout helpers

`LayoutItem` gains `locked?`, so the pure functions can see it:

| Function                | Change                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `visibleWidgets`        | Builds the order above when any visible widget is pinned. Unchanged output when none is.                                                                                       |
| `moveWidget`            | Returns the same layout for a pinned key, or when `toIndex` lands on a pinned slot. Indexes are visible-order indexes.                                                         |
| `moveWidgetBy`          | Steps over pinned slots: "later" jumps to the next free slot. Clamps at the ends of the free slots.                                                                            |
| `hideWidget` and others | Unchanged. They take only `(layout, key)`, so the lock check lives in `enforceLocks` and the UI (below).                                                                       |
| `enforceLocks` (new)    | `enforceLocks(definitions, layout)`: per widget, drops the key from `hidden` if hide-locked, from `minimized` if minimize-locked, and from `order` if move-locked. Idempotent. |
| `pruneLayout`           | Unchanged.                                                                                                                                                                     |

`enforceLocks` is the single place the rules are stated for code that is not
the UI. `Dashboard` calls it on the layout it receives, so a saved layout that
predates a lock (or was edited by hand) renders correctly. A consumer's save
endpoint calls it on whatever the client sent:

```ts
const layout = enforceLocks(definitions, parseLayout(request.body.layout));
await saveLayout(userId, serializeLayout(layout));
```

Pass the full definition list for the viewer's role, as `pruneLayout` already
asks.

### Roles and overrides: the developer chooses

Locks set by the developer belong to the definition, so **changing the lock
itself (adding, removing or changing `locked`) happens in the Widget Builder**,
in a dedicated admin view the developer builds (see the options design, section
11). The toolkit has no roles of its own, so how _arranging_ locked widgets works
is the consuming developer's choice, and both ways are supported:

1. **Separate admin UI (the default).** `Dashboard` always respects locks. The
   developer gives administrators their own admin view (built with the Builder's
   functions and the same components) where definitions and the default layout
   are edited. Nothing in the viewer-facing `Dashboard` can bypass a lock.
2. **In-place admin editing.** The developer passes `overrideLocks` to
   `Dashboard` for the roles they choose (for example `overrideLocks={user.isAdmin}`).
   Locked widgets can then be moved, hidden and minimized in the Dashboard UI,
   each marked "Locked for viewers" so the admin sees what they are overriding.
   It never edits the lock itself.

The prop is off unless the developer turns it on, so a developer who wants the
first approach does nothing. Because the toolkit can't know who is an admin, both
checks are the consumer's, and the server still decides:

- A viewer's saved layout is passed through `enforceLocks` (or `normalizeLayout`),
  which has an `overrideLocks` option the server sets only for authorized users. A
  client that sends `overrideLocks` itself gains nothing.
- Edits made with `overrideLocks` should be saved to the **organization default
  layout** (the shared, no-`userKey` scope in `storage-adapters.md`), not to the
  admin's personal layout; otherwise viewers never see them. The consumer routes
  the `onLayoutChange` call accordingly.

### Validation

`validateWidgetDefinition` accepts `locked` as a boolean or an object whose
fields are booleans, and names the bad field, for example
`locked.move must be a boolean, got string.`

## 4. Edit mode

### API

```ts
interface DashboardProps {
  // ...existing
  /**
   * `always` (default): the controls show whenever onLayoutChange is set,
   * as today. `toggle`: they show only while editing, behind a Customize
   * button.
   */
  readonly editMode?: 'always' | 'toggle';
  /** Controlled editing state (toggle mode). */
  readonly editing?: boolean;
  readonly defaultEditing?: boolean;
  readonly onEditingChange?: (editing: boolean) => void;
  /** What Reset restores. Default: the empty layout (sortOrder order). */
  readonly defaultLayout?: DashboardLayout;
  /** Hide the built-in Customize/Done/Reset toolbar (toggle mode). */
  readonly toolbar?: boolean;
}
```

The default `editMode: 'always'` keeps current behavior exactly. Flipping the
default to `'toggle'` is a candidate for 1.0 and would be called out in the
changelog; it is not part of this change.

### What shows when

| Control                           | `always` | `toggle`, not editing | `toggle`, editing   |
| --------------------------------- | -------- | --------------------- | ------------------- |
| Move earlier / later, drag handle | yes      | no                    | yes (free only)     |
| Hide                              | yes      | no                    | yes (free only)     |
| Minimize toggle                   | yes      | yes                   | yes                 |
| "Hidden:" bar (restore)           | yes      | no                    | yes                 |
| "Minimized:" bar (restore)        | yes      | yes                   | yes                 |
| Lock indicator on locked cards    | yes      | no                    | yes                 |
| Options gear (see options design) | no       | no                    | yes (unless locked) |
| Customize / Done / Reset toolbar  | no       | yes                   | yes                 |

The "(free only)" and every minimize cell mean "unless the widget's lock covers
it". Minimize and its bar stay available outside edit mode: collapsing a card
is something a reader does to focus, and a minimized card must always be
restorable, so its bar can't depend on edit mode. A widget that must not
collapse sets `locked.minimize`, which `locked: true` includes. If a saved
layout lists a minimize-locked widget as minimized, `enforceLocks` drops it,
so it shows expanded.

### Toolbar

A small row above the grid, rendered by `Dashboard`:

- **Customize** (when not editing) and **Done** (when editing): one button
  whose label changes. It carries `aria-pressed` so assistive technology
  reports the state without relying on the label alone.
- **Reset layout** (editing only): after an inline confirmation ("Reset the
  layout to the default?" with "✓" and "X"), calls
  `onLayoutChange(enforceLocks(definitions, defaultLayout ?? EMPTY_LAYOUT))`.
  Locked widgets are unaffected. It resets the arrangement (order, hidden,
  minimized) only; widget settings and clones (see
  `widget-options-views-clones.md`) are left as they are.
- **Revert changes** (editing only, enabled once something changed): after a
  confirmation, restores the layout as it was when Customize was pressed. The
  edit session keeps that snapshot in memory (a layout is an immutable value, so
  it is a reference, not a copy). Done discards it.
- A visually hidden `aria-live="polite"` region announces "Editing dashboard.
  Use the buttons on each card to reorder or hide it." and "Finished editing."

Consumers who want their own button use `editing` and `toolbar={false}`. A
small exported `DashboardToolbar` is not needed for that and is left out.

### Editing affordances

While editing, cards get a dashed outline (`dwt-dashboard--editing` on the root,
`dwt-card--editing` on cards) so the state is visible without color. Locked
cards show a lock icon, button-shaped but not interactive, in the place the
controls it covers would be, with the accessible name `Revenue is locked`. A
fully locked card (`locked: true`) shows only the icon; a partly locked one
shows the icon and keeps the controls its lock leaves open. Keeping the icon
in the controls' slot avoids the header jumping when a card's lock state
changes.

### Focus and server rendering

- Pressing Customize or Done keeps focus on that button (the label changes in
  place). Hiding a card moves focus to the next card's first control, or the
  Hidden bar if it was the last (the existing behavior, unchanged).
- The default state is not editing and there are no effects, so server-rendered
  markup is the same as today in `always` mode and has no controls in
  `toggle` mode.

## 5. Labels and styling

New `DashboardLabels` entries, all overridable like the rest:

```ts
customize: string; // "Customize"
done: string; // "Done"
reset: string; // "Reset layout"
revertChanges: string; // "Revert changes"
confirmReset: string; // "Reset the layout to the default?"
confirmRevert: string; // "Revert to how this looked before you started editing?"
editingOn: string; // "Editing dashboard. Use the buttons…"
editingOff: string; // "Finished editing."
locked: (title: string) => string; // "Revenue is locked"
lockedForViewers: (title: string) => string; // admin override view
```

Styling follows the existing convention: stable `dwt-*` classes
(`dwt-toolbar`, `dwt-lock`, `dwt-dashboard--editing`, `dwt-card--editing`), a
`toolbar` slot in `classNames`, and `--dwt-*` custom properties for the
editing outline. `styles.css` stays optional. American English throughout.

## 6. Enforcement checklist for consumers

1. Define `locked` on the widgets that need it.
2. Render `Dashboard` as usual; it enforces the locks on what it shows.
3. On save, run `enforceLocks(definitions, parseLayout(input))` server-side.
4. For an admin who edits the default layout, either strip `locked` from
   their definitions or pass `overrideLocks`.

## 7. Interaction with drag and drop

Drag and drop is designed separately and builds on this:

- Drag handles render only in edit mode, and not on pinned widgets.
- Pinned slots are not drop targets. The drop indicator skips them, and the
  keyboard flow ("move later") steps over them, matching `moveWidgetBy`.
- The commit is the same `onLayoutChange(moveWidget(...))`, so a drop onto a
  pinned slot is rejected by the core, not only by the UI.
- The move buttons stay for the WCAG 2.5.7 single-pointer alternative.

## 8. Phasing

| Phase | Version | Scope                                                                                                                                                |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 0.8.0   | Core: `locked`, `resolveWidgetLock`, pinned slots in `visibleWidgets`, lock-aware `moveWidget` and `moveWidgetBy`, `enforceLocks`, validation, tests |
| 2     | 0.9.0   | React: `editMode`, toolbar, Reset, lock indicator, labels, CSS, announcements, tests; demo toggle ("Customize") and one locked widget                |
| 3     | later   | Drag and drop (`widget-extensions.md`) on top of both                                                                                                |

Each phase is a minor release with its own changeset, README and
GETTING_STARTED text, and a ROADMAP update. Phase 1 also makes the smallest
React change that keeps the core honest: `Dashboard` runs `enforceLocks` on the
layout it receives and withholds the move, hide and minimize controls that a widget's lock covers.
There is no new UI until phase 2.

## 9. Testing

Pure logic (no DOM), in `test/core`:

- `visibleWidgets` with zero, one, several and adjacent pinned widgets; pinned
  slot clamping; a saved `order` that lists a pinned key; hidden free widgets
  shifting a pinned one up.
- `moveWidget` and `moveWidgetBy` over pinned slots, for pinned keys, and at
  the ends.
- `enforceLocks`: per field, removes keys from `hidden`, `minimized` and
  `order` only where that part is locked; returns the same object when nothing
  changes; idempotent.
- `resolveWidgetLock` defaults and `validateWidgetDefinition` messages.

Rendering (`renderToStaticMarkup`, `test/react`): `always` mode unchanged;
`toggle` mode shows no controls and a Customize button; with
`defaultEditing` it shows controls, the Done and Reset buttons, and lock
indicators with the right names; a fully locked widget has no move, hide or minimize controls, and a partly
locked one keeps the controls its lock leaves open.

Real browser (Playwright, in the demo app): Customize and Done by keyboard,
focus stays on the toggle, hiding and restoring, Reset, and a locked widget
that stays put while the cards around it are reordered.

## 10. Decisions and open questions

### Decided (2026-10-09)

1. **`locked: true` means move, hide and minimize.** A locked widget can't be
   moved, hidden or minimized. The object form locks only the fields named.
2. **Minimize is available unless it is locked.** It stays available outside
   edit mode, and the "Minimized:" bar does too.
3. **Pinned slots are counted among visible widgets.** Hiding free widgets above
   a pinned one shifts it up with them; the arrangement never has gaps.
4. **Reset asks first, and edit mode keeps a backup.** Reset layout needs a
   confirmation (inline, with "✓" and "X" buttons, not `window.confirm`). Pressing
   Customize snapshots the layout, and Revert changes restores it. Reset affects
   the arrangement only.
5. **Lock editing is a developer choice.** Changing `locked` itself is done in
   the Widget Builder's admin view. Arranging locked widgets is either a separate
   admin UI (default) or `overrideLocks` on `Dashboard` for roles the developer
   names, with the server enforcing. Both are supported.

### Still open

6. **Default for `editMode`.** Keep `always` until 1.0, as proposed?
