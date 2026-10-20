# Vue renderers: design

Status: decisions VU1 to VU10 are confirmed (the recommendations stand). Phase 0
is built: `chart-model.ts`, `labels.ts` and `palette.ts` live in the core and
`./react` re-exports them. Phase 1 is built (`./vue`: settings, theme, cards, every renderer, the chart,
freshness, exports, `useWidgets`, with a React-versus-Vue markup parity test).
Phases 2 to 4 are not built.

## 1. Goal

A `./vue` subpath for Vue 3 apps (first user: Maker Toolkit's Shop Dashboard),
over the same core, payloads, layout and `styles.css` class names as `./react`.
A Vue app should show the same dashboard, with the same data and layout JSON,
without React installed.

Non-goals: a Vue port of the Widget Builder forms, a Vue 2 build, a
framework-neutral renderer (web components stay a separate roadmap item).

## 2. What ports and what does not

The core and builder are runtime-neutral and are reused as they are: payloads,
`resolve`, `loader`, layout, pages, options, views, export CSV, `theme`,
`format`, `scale`. That is the point of keeping the logic out of React.

Three things in `src/react` are not React-specific and sit in the wrong place:
`buildChartModel` / `barPath` / `describeChart` (`charts.tsx`), the labels and
class-slot types (`settings.tsx`), and `palette.ts`. Phase 0 moves them into
`src/core` (or a shared `src/view/` module) and re-exports them from `./react`
so nothing changes for React users.

## 3. Phases

| Phase | Scope                                                                                                                                                                                                                                 | Why this order                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 0     | Move the framework-free parts of `charts.tsx`, `settings.tsx` (labels, class slots) and `palette.ts` out of `src/react`; no behavior change                                                                                           | The Vue layer must not copy them                                          |
| 1     | `./vue`: `WidgetSettingsProvider` (provide/inject), `WidgetTheme`, one component per kind, `WidgetContent`, `WidgetCard`, `GraphWidget` (SVG, legend, tooltip, table twin), `FreshnessLine`, `RefreshButton`, `useWidgets` composable | A read-only dashboard: what Maker Toolkit needs first                     |
| 2     | `WidgetGrid` and `Dashboard`: hide, minimize, move up/down, Customize/Done, locks, pages and the page bar, `useStoredLayout`                                                                                                          | Layout editing without drag and drop                                      |
| 3     | Options dialog, clones, detail view, filters, export buttons                                                                                                                                                                          | The heavier dialogs                                                       |
| 4     | Drag and drop and swipe (`usePointerReorder`, `usePageSwipe`)                                                                                                                                                                         | Pointer code; the decisions in `reorder.ts` / `swipe.ts` are already pure |

Each phase ships as its own minor release. Phases 3 and 4 are not committed to
until phase 1 has a real consumer.

## 4. Decisions

| #    | Question             | Recommendation                                                                                                                                                                                                                                    |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VU1  | Authoring style      | Render functions in `.ts` files (`defineComponent` + `h`), no `.vue` single-file components. tsup builds them like the React code, with no Vue compiler plugin, and ESM + CJS output stays identical in shape                                     |
| VU2  | Vue version          | Vue `>=3.3` as an optional peer (`peerDependenciesMeta`), like React. No Vue 2                                                                                                                                                                    |
| VU3  | Subpath              | `./vue`, with `exports`, `typesVersions` and a tsup entry, per the CLAUDE.md recipe. `vue` is external                                                                                                                                            |
| VU4  | Share the stylesheet | Yes: same `styles.css` and the same `dwt-*` class names and `data-*` attributes, so a theme or `classNames` override works in both. Renders must match the React markup closely enough that one CSS file styles both                              |
| VU5  | Slots vs props       | Slots for the places React takes render props or `ReactNode` (cell formatters stay functions returning `VNodeChild`; per-card actions get a named slot). Labels and classes stay props / provide                                                  |
| VU6  | State                | Composables over the core: `useWidgets` returns refs (`widgets`, `refresh`, `setOptions`, `release`, `prefetch`); `useStoredLayout` in phase 2. They subscribe to the same `createWidgetLoader`                                                   |
| VU7  | Testing              | `@vue/server-renderer` `renderToString` in `node:test`, mirroring `renderToStaticMarkup`. Plus a parity test that renders the same widgets with React and Vue and compares normalized markup, which is what keeps VU4 honest. Dev dependency only |
| VU8  | Server rendering     | Supported, as for React: no effects on the first render; loading starts in `onMounted`                                                                                                                                                            |
| VU9  | Docs and demo        | A `Vue` section in GETTING_STARTED. A Vue demo is a separate repo and request, not part of this work                                                                                                                                              |
| VU10 | Release              | Phase 0 patch, each later phase minor; changeset per PR. CI gains the Vue typecheck (`tsconfig.vue.json`, DOM lib)                                                                                                                                |

## 5. Risks

- **Markup drift.** Two renderers can diverge. Mitigation: the parity test
  (VU7) and sharing the chart model and labels (phase 0).
- **Size.** `dashboard.tsx` alone is about 2,000 lines. Phases 2 to 4 are large;
  phase 1 is the part that is cheap and useful on its own.
- **Reactivity gaps.** Vue tracks reads, React re-renders; the loader snapshot
  is immutable and replaced on change, so a `shallowRef` set from `subscribe`
  is enough. Dependencies must be read in the render function, not captured.
