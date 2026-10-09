# CLAUDE.md

Project memory for Claude Code. Read this before changing anything.

## What this is

`@richardmcquiston01/dashboard-widgets-toolkit`: a publishable,
framework-agnostic dashboard widget toolkit. Typed widget definitions and
JSON data payloads (KPI, gauge, table, bar list, alert list, chart), a
viewer's layout (order, hide, minimize), provider resolution, and React
renderers. Consumers bring their own data providers.

It generalises two existing systems:

- **Maker Toolkit** (`apps/api/src/widgets`, the Prisma `Widget` model, and
  the desktop app's `dashboard/` renderer with `dashboard-layout.ts`). Kind
  names stay upper case (`TEXT`, `GAUGE`, `TABLE`, `GRAPH`) for
  compatibility; `compat.ts` upgrades its older `TABLE`/`GRAPH` shapes.
- **etsy-dashboard's Dashboard tab** (KPI row with period comparison, alert
  lists with thumbnails, rating/country bars, the monthly SVG bar chart and
  the trend line chart, each with a "View as table" twin).

## Layout

```
src/
  index.ts              package root: re-exports the core
  core/                 subpath ./core: runtime-neutral, no DOM, no React
    index.ts            barrel
    payload.ts          WidgetKind, payload types, empty state, emptyTextFor
    definition.ts       WidgetDefinition, defineWidget, sort, role filter
    validate.ts         validateWidgetData / validateWidgetDefinition
    resolve.ts          resolveWidgets, resolvePayload, loading/failed widgets
    layout.ts           DashboardLayout: parse/serialise, order, hide, minimize
    pages.ts            pages of widgets: helpers, capacity, normalizeLayout
    format.ts           Intl formatting, percent change, kpiDelta
    scale.ts            niceStep, niceDomain, labelStride
    url.ts              isSafeHref / isSafeImageUrl
    compat.ts           Maker Toolkit payload/definition upgrades
    result.ts           Result<T>
  react/                subpath ./react: browser code, React >= 18 peer
    index.ts            barrel
    settings.tsx        WidgetSettingsProvider: locale, linkTarget, classNames, labels
    card.tsx            WidgetCard, ResolvedWidgetCard, widgetTitle
    renderers.tsx       one renderer per kind, WidgetContent switch
    charts.tsx          GraphWidget: SVG bar/line, legend, tooltip, table twin
    dashboard.tsx       WidgetGrid, Dashboard (layout controls)
    palette.ts          default series/chrome colors as var(--dwt-*, fallback)
    primitives.tsx      WidgetLink (rel="noreferrer", safe schemes), Thumbnail
    styles.css          optional stylesheet, copied to dist/styles.css
test/
  core/*.test.ts        node:test + node:assert, run by bun test
  react/*.test.tsx      react-dom/server renderToStaticMarkup, no DOM needed
tsup.config.ts          entries index, core, react; copies styles.css
```

Adding a subpath: add the entry to `tsup.config.ts`, `package.json`
`exports` (import/require with types) and `typesVersions`, then add a
changeset.

## Design docs

Plans for work that isn't built yet. Read the one that matches before
starting that work; skip them otherwise. The shipped parts of each are
documented in the code and README, which win if they disagree.

- `docs/design/detail-view.md`: detail view. Core and client-mode React
  shipped. Still planned: server mode (`mode: 'server'`, `totalRows`), URL
  deep links, page-size choice and column visibility.
- `docs/design/widget-extensions.md`: async loading shipped (`useWidgets`,
  `createWidgetLoader`). Still planned: adapters and payload builders,
  drag-and-drop reordering, push streams.
- `docs/design/lock-and-edit-mode.md`: locked widgets (`locked`, pinned slots,
  `enforceLocks`, `overrideLocks`) and the Customize/Done edit mode
  (`editMode="toggle"`, Reset, Revert) are built; drag and drop is not.
- `docs/design/widget-options-views-clones.md`: gear/Options dialog (title,
  width, declared options passed to providers), alternate views and clones,
  stored in the layout. Not built yet; builds on the lock design.
- `docs/design/widget-pages.md`: pages of widgets (per-page layout, capacity of
  about 4 rows, moving widgets between pages, page bar hidden for one page,
  lazy loading by page). Built: the core (`pages.ts`, `placeRows`,
  `normalizeLayout`) and the React page bar, Move to page and page management.
  Not built: swipe, drag onto a page tab, `retain`/`release`.
- `docs/design/storage-adapters.md`: a storage adapter contract, I/O-free
  persistence helpers and a `useStoredLayout` hook; concrete adapters stay in
  consumer code. Not built yet.

## Commands (Bun only)

Bun is the package manager, script runner and test runner. Use
`bun install`, `bun run <script>` and `bunx`; never `npm`, `npx` or `tsx`
locally. The lockfile is `bun.lock` (committed). The only `npm` call is
`npm publish` in the release workflow, for provenance.

```bash
bun install
bun run typecheck      # core (no DOM, no Node types), react (DOM), tests
bun run lint           # ESLint flat config + typescript-eslint
bun run format         # Prettier, using .prettierrc.json
bun run format:check
bun run test           # bun test test
bun run build          # tsup → dist/ (ESM + CJS + .d.ts/.d.cts) + styles.css
bun run changeset      # describe a change for the next release
```

TypeScript is pinned to 6.0 (`~6.0.2`): tsup's declaration build needs the
JavaScript compiler API. `README.md` is in `.prettierignore` so its fixed
Author, Buy Me a Coffee, License and Copyright sections stay byte-for-byte.

## Dual ESM and CommonJS: required

The build must keep producing ESM (`dist/*.js`) and CommonJS (`dist/*.cjs`)
with declarations for each (`.d.ts`, `.d.cts`) for every entry (`.`,
`./core`, `./react`), plus `dist/styles.css`. Maker Toolkit's NestJS API
compiles to CommonJS and `require()`s the core. Before releasing, check that
`require('@richardmcquiston01/dashboard-widgets-toolkit/core')` works under
Node and that an ESM import of `./react` works with React installed.

`splitting` is off, so `dist/react.*` carries its own copy of the core
functions it uses. That's fine: the core has no singletons or classes.

## Runtime-neutral core, browser React

- `src/core` and `src/index.ts`: `lib` is ES2023 with `types: []` (no DOM, no
  Node). ESLint bans `node:*`, `fs`, `bun`, React imports, and the globals
  `Bun`, `process`, `Buffer`, `require`, `window`, `document`, `fetch` and
  `localStorage`. `Intl` is fine (it's ECMAScript).
- `src/react`: DOM lib and JSX allowed; still no Node or Bun. React is a peer
  dependency (`>=18`, optional so core-only consumers needn't install it).
  Components render on the server with no effects, so tests use
  `renderToStaticMarkup`.

## No data fetching, no database

The package never fetches, stores or queries anything. Consumers supply
providers (a Prisma query, an HTTP call) keyed by widget key, and persist
the layout themselves (`serializeLayout` / `parseLayout`). Never add an
ORM, a DB driver, `fetch`, or storage code (contracts and I/O-free helpers for
storage adapters are fine; see `docs/design/storage-adapters.md`). Links render as plain anchors
with `rel="noreferrer"`; images are plain `<img>` tags. Only http(s),
mailto and relative URLs are rendered (`url.ts`); the validator rejects the
rest, and the renderers fall back to text even for unvalidated data.

## Charts

Follow the dataviz method (marks, color, accessibility): one y axis only;
bars at most 24px with a 4px rounded data end and a square baseline end, 2px
gaps; 2px lines; markers r=4 with a 2px surface ring; solid hairline grid;
a legend for 2+ series and none for one; text in text colors, never series
colors; categorical colors in a fixed order (`palette.ts`, validated in
both modes), at most 8 series (`MAX_GRAPH_SERIES`); every chart has a
`<title>`/`<desc>`, keyboard focus with arrow keys, a hover tooltip that
never gates a value, and a "View as table" twin. If you change the palette,
re-run the dataviz validator for light and dark before shipping.

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`,
  `verbatimModuleSyntax`, `useUnknownInCatchVariables`.
- Google TypeScript Style Guide; descriptive camelCase names; typed locals
  where they help.
- Functions return values the caller checks (`Result<T>`); reserve `throw`
  for programmer error. Error messages are specific: name the widget key,
  the field path and what was wrong.
- Payloads stay JSON-serialisable: no dates (ISO strings), functions or
  class instances.
- Tests: `node:test` + `node:assert`, run by `bun test`. No network, no
  database, no DOM.
- Never write credentials or tokens into source, logs or committed files.

## Git and releases

- `dev` is the integration branch. Branch features off `dev`
  (`feature/...`) and open PRs into `dev`, never `main`.
- Each user-facing change gets a changeset (`bun run changeset`).
- To release: on `dev`, run `bun run version-packages` (bumps
  `package.json`, writes `CHANGELOG.md`), merge `dev` → `main`, then tag
  `main` with `vX.Y.Z` matching `package.json` and push the tag. The Release
  workflow checks the tag matches, builds, tests and runs
  `npm publish --provenance --access public` using the `NPM_TOKEN`
  repository secret.
- `package.json` starts at 0.0.0, so the initial `minor` changeset
  (`.changeset/initial-toolkit.md`) makes the first release 0.1.0.
- CI (`.github/workflows/ci.yml`) runs on PRs and on pushes to `dev`/`main`:
  install with `--frozen-lockfile`, typecheck, lint, format:check, test,
  build.
