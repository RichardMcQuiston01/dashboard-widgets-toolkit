# Design: widget detail view

- **Status:** Draft for review
- **Date:** 2026-10-06
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.3.x
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

Cards show a summary: five rows, a footer saying "and 12 more". A viewer who
wants the rest has nowhere to go. This design adds a **detail view**: a
widget can be marked as having one, the card gets a "View" control (an eye
icon button, and the title becomes a button), and activating it opens a
dedicated list of the full data with sorting, filtering and paging.

The package still never fetches. The consumer supplies the data through a
second kind of provider, and either lets the toolkit show the view in a
dialog or handles navigation itself (a route, a new page).

### Non-goals

- Fetching, storing or querying data (see ROADMAP "Never").
- Spreadsheet features: editing, pivoting, column resizing, virtualised
  scrolling of 100,000 rows. Large data is paged, not virtualised.
- Replacing a consumer's own data grid. The detail view is the sensible
  default; `onOpenDetail` is the way out.
- Exporting (CSV, print). Possible later; not designed here.

### Terms

"Detail view" is the proposed name (not "expandable", which collides with
minimize/expand, and not "drill-down", which suggests hierarchy). The control
is labelled **View** (`labels.view(title)`, "View Most popular products").

## 2. Where things stand

- A TABLE payload is `columns` plus `rows` of `{ text, href? }` cells, so
  numbers are already formatted strings: they cannot be sorted numerically.
- Providers are `(context, definition, { signal }) => payload`, resolved per
  widget, async, cancellable, cached (phase 1).
- Cards have a header with an actions area (move, hide, minimize), now as
  bordered square icon buttons.
- GRAPH and BAR_LIST already have a "View as table" twin, so their data is
  complete on the card. TABLE and ALERT_LIST usually carry a truncated page.

## 3. Proposal

### 3.1 Definition

```ts
defineWidget({
  key: 'top-products',
  title: 'Most popular products',
  kind: 'TABLE',
  width: 8,
  detail: true, // or { title?: string, pageSize?: number, mode?: 'client' | 'server' }
});
```

`detail` is optional and JSON-serialisable (it lives on the definition, which
may come from a database). `true` means "use defaults".

### 3.2 Data: a detail provider

A separate provider keyed by widget key, so the card stays cheap and the
heavy load only happens when the viewer asks:

```ts
type DetailProvider<C> = (
  context: C,
  definition: WidgetDefinition,
  options: { signal: AbortSignal; query: DetailQuery }
) => DetailData | Promise<DetailData>;

interface DetailQuery {
  readonly search?: string; // free text across columns
  readonly filters?: Readonly<Record<string, string>>; // by column key
  readonly sort?: {
    readonly column: string;
    readonly direction: 'asc' | 'desc';
  };
  readonly page: number; // 1-based
  readonly pageSize: number;
}

interface DetailColumn {
  readonly key: string;
  readonly label: string;
  readonly numeric?: boolean;
  readonly sortable?: boolean; // default true
  readonly filterable?: boolean; // default false
}

interface DetailCell {
  readonly text: string; // what is shown
  readonly value?: string | number; // what sorts and filters; default: text
  readonly href?: string;
}

interface DetailData {
  readonly columns: readonly DetailColumn[];
  readonly rows: readonly (readonly DetailCell[])[];
  /** Server mode only: rows matching the query, across all pages. */
  readonly totalRows?: number;
}
```

**Two modes, one signature.**

- **Client mode** (default): the provider returns every row once and ignores
  `query`; the toolkit sorts, filters and pages in memory with pure core
  functions. Good up to a few thousand rows.
- **Server mode** (`mode: 'server'`): the provider honours `query` and
  returns one page plus `totalRows`. The toolkit only renders and reports
  changes. Good for large data, and the consumer's database does the work
  (for example a Prisma `findMany` with `orderBy`, `where`, `skip`, `take`).

**No detail provider?** Widgets whose card payload is complete derive the
view: GRAPH and BAR_LIST become a two-or-more column table, a TABLE with no
footer becomes its own detail. A truncated TABLE or ALERT_LIST without a
detail provider cannot show more than the card, so validation warns when
`detail` is set and neither a provider nor a complete payload exists.

### 3.3 Core (runtime-neutral)

Pure, tested functions in `src/core/detail.ts`:

- `queryRows(data, query): { rows, totalRows }`: filter, sort, then page.
- Sorting uses `Intl.Collator` with the viewer's locale, numeric-aware for
  `numeric` columns via `value`, and is stable.
- Filtering is case- and diacritic-insensitive substring matching on `value`
  (else `text`); `search` matches any column.
- `serializeDetailQuery` / `parseDetailQuery`: round-trip a query to a URL
  query string, validated the same way layouts are (`Result<T>`, specific
  error messages naming the field).
- `validateDetailData`: column keys unique, every row as long as `columns`,
  `value` is a string or finite number, `href` safe (reuses `url.ts`).

### 3.4 React

- **`WidgetCard`** gains an optional `onView` prop. When present, the header
  shows an eye icon button (`aria-label="View {title}"`) in the actions, and
  the title also activates it for mouse and touch users. The title is not a
  second tab stop (`tabindex="-1"`); the icon button is the accessible
  control.
- **`Dashboard`** wires `onView` for widgets with `detail` set. Props:
  `onOpenDetail?: (key: string) => void`. If omitted, the dashboard opens the
  built-in dialog itself.
- **`WidgetDetail`** (exported, usable on its own as a page):
  `{ widget, data, query, onQueryChange, loading, error, onRetry }`. It is a
  controlled component, so a consumer can keep the query in the URL.
- **`WidgetDetailDialog`**: wraps `WidgetDetail` in a native `<dialog>`
  (`showModal()`), which gives focus trapping, Esc and a backdrop for free.
  Hosts the detail load: calls the provider with the abort signal, shows the
  same loading, error and retry states as cards, aborts on close.
- **`useWidgetDetail(providers, context)`**: the load/abort/query state for a
  consumer who builds their own shell.

### 3.5 Interaction and accessibility

- Table is a real `<table>` with `<caption>` (the widget title), `scope`
  headers, and `aria-sort` on the sorted column. Sort controls are buttons
  inside the header cells, not click handlers on `<th>`.
- Filter inputs have visible labels; a polite live region announces
  "Showing 1-25 of 312 results" after each change (debounced).
- Pagination is a labelled `<nav>` with Previous/Next and a page indicator.
  Page size is fixed by the definition (no selector in v1).
- Dialog: labelled by the title, focus moves to the dialog heading on open
  and returns to the View button on close; Esc closes; the page behind is
  inert. On narrow screens the dialog is full-screen.
- Touch targets and focus rings follow the existing button styles. Colour is
  never the only signal (sort direction has an arrow glyph and `aria-sort`).

### 3.6 Deep links

`parseDetailQuery` / `serializeDetailQuery` plus a `?widget=top-products&sort=sold:desc&page=2`
convention let a consumer put the open detail view in the URL. The package
does not read or write `location`; the consumer passes the query in and
handles `onQueryChange`.

## 4. Fit with the rest of the toolkit

- **Async loading (phase 1):** the detail provider reuses `ProviderOptions`,
  the abort signal, `timeoutMs` and `WidgetCache` (cache key adds the
  query), so closing the dialog cancels the request.
- **Adapters (phase 2):** an adapter's mapper gains a `toDetail` builder
  beside `toTable`, so one source can feed both the card and the view.
- **Width:** the dialog does not use `width`; it has its own sizing.
- **Layout:** nothing persisted. (A viewer's last sort could be saved
  with the layout later.)
- **Drag and drop:** the View control is a button, so it does not conflict
  with drag handles.

## 5. Phasing

1. **Core:** types, `queryRows`, query (de)serialisation, validation, tests.
   No UI. Ships as a minor.
2. **React, client mode:** `onView` on the card, `WidgetDetail`,
   `WidgetDetailDialog`, derived detail for complete payloads, styles,
   labels, demo update.
3. **Server mode and deep links:** `mode: 'server'`, `useWidgetDetail`,
   URL helpers, cache keys including the query.
4. **Polish:** page-size choice, column visibility, CSV export if asked.

## 6. Decisions and open questions

| ID  | Question                                                        | Recommendation                                                             |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| V1  | Built-in dialog, a page, or both?                               | Both: dialog by default, `onOpenDetail` to route instead                   |
| V2  | Client mode only, or server mode too?                           | Both, one provider signature (section 3.2)                                 |
| V3  | One `detail` flag on the definition, or an `onView` prop only?  | Flag on the definition; it survives being stored as JSON                   |
| V4  | Add `value` to cells so numbers and dates sort correctly?       | Yes, on `DetailCell`; consider the same on `TableCell`                     |
| V5  | Title as a button and an eye icon, or the icon only?            | Both; the title is a mouse convenience, the icon is the accessible control |
| V6  | Which filter UI: one search box, per-column filters, or both?   | Search box plus per-column filters on columns marked `filterable`          |
| V7  | Should derived details (GRAPH, BAR_LIST) exist at all in v1?    | Yes for BAR_LIST and TABLE without footer; GRAPH later                     |
| V8  | Is the Drafts tab in etsy-dashboard a candidate first consumer? | Likely: it needs a list with a modal per row; confirm                      |

## 7. Risks

- **Scope creep toward a data grid.** Mitigation: the non-goals above; the
  consumer's own grid via `onOpenDetail` is the supported way out.
- **Sorting formatted text.** Mitigation: `value` on cells; without it the
  view sorts by `text`, which is documented.
- **Large client-mode datasets.** Mitigation: paging, a documented ceiling,
  and server mode.
- **Dialog support.** Native `<dialog>` is available in all current
  browsers; the focus-return and inert behaviour is tested in a real
  browser, since `renderToStaticMarkup` cannot cover it.
