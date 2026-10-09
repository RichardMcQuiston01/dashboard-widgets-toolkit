/**
 * Pages of widgets: a dashboard split into pages, like the home screens of a
 * phone. Each page is a small layout (order, hidden, minimized) with a name
 * and a capacity of `maxRows` rows of 12 columns. Pure functions, in the
 * style of `layout.ts`: inputs are never mutated, a refusal is a `Result`
 * with a specific message, and a no-op returns the same object.
 *
 * A layout without `pages` has one implicit page (`DEFAULT_PAGE_KEY`), so
 * everything here also works on layouts saved before pages existed.
 */

import { resolveWidgetLock } from './definition.js';
import { placeRows, fitCount, type GridItem } from './grid.js';
import {
  enforceLocks,
  MAX_PAGE_ROWS,
  MAX_PAGE_TITLE_LENGTH,
  MAX_PARSED_PAGES,
  pruneLayout,
  visibleWidgets,
  type DashboardLayout,
  type LayoutItem,
  type LayoutPage,
} from './layout.js';
import { err, ok, type Result } from './result.js';

/** The key of the implicit page of a layout that has no `pages`. */
export const DEFAULT_PAGE_KEY = 'default';
/** Rows a page holds unless it (or the dashboard) says otherwise. */
export const DEFAULT_PAGE_ROWS = 4;

/** What the page functions need from a widget definition. */
export type PageItem = LayoutItem &
  GridItem & {
    /** Used in messages; the key stands in when absent. */
    readonly title?: string;
  };

export interface PageOptions {
  /** Rows a page holds when it has no `maxRows` of its own. Default 4. */
  readonly maxRows?: number;
}

function rowsAllowed(page: LayoutPage, options: PageOptions): number {
  const rows: number = page.maxRows ?? options.maxRows ?? DEFAULT_PAGE_ROWS;
  return Math.max(1, Math.min(MAX_PAGE_ROWS, Math.floor(rows)));
}

/** Whether the layout has pages of its own (rather than one implicit page). */
export function hasPages(layout: DashboardLayout): boolean {
  return layout.pages !== undefined && layout.pages.length > 0;
}

/**
 * The layout's pages. A layout without `pages` has one implicit page called
 * "Page 1" made from its top-level lists.
 */
export function pageList(layout: DashboardLayout): readonly LayoutPage[] {
  if (layout.pages !== undefined && layout.pages.length > 0) {
    return layout.pages;
  }
  return [
    {
      key: DEFAULT_PAGE_KEY,
      title: 'Page 1',
      order: layout.order,
      hidden: layout.hidden,
      minimized: layout.minimized,
    },
  ];
}

/** Turns an implicit single page into an explicit one, so it can be edited. */
function withExplicitPages(layout: DashboardLayout): DashboardLayout {
  if (hasPages(layout)) return layout;
  return {
    ...layout,
    order: [],
    hidden: [],
    minimized: [],
    pages: pageList(layout),
  };
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((k, i) => k === b[i]));
}

/**
 * One page as an ordinary layout, so every function in `layout.ts` (move,
 * hide, minimize, `visibleWidgets`) works on it unchanged. For a layout with
 * no pages this is the layout itself. Undefined for an unknown page.
 */
export function pageLayout(
  layout: DashboardLayout,
  pageKey: string
): DashboardLayout | undefined {
  if (!hasPages(layout))
    return pageKey === DEFAULT_PAGE_KEY ? layout : undefined;
  const page: LayoutPage | undefined = layout.pages?.find(
    (p) => p.key === pageKey
  );
  if (page === undefined) return undefined;
  const { pages, ...rest } = layout;
  void pages;
  return {
    ...rest,
    order: page.order,
    hidden: page.hidden,
    minimized: page.minimized,
  };
}

/**
 * Writes a page's layout (changed with the functions in `layout.ts`) back
 * into the whole layout. Returns the same object when nothing changed or the
 * page doesn't exist.
 */
export function withPageLayout(
  layout: DashboardLayout,
  pageKey: string,
  next: DashboardLayout
): DashboardLayout {
  const current: DashboardLayout | undefined = pageLayout(layout, pageKey);
  if (
    current === undefined ||
    (sameKeys(current.order, next.order) &&
      sameKeys(current.hidden, next.hidden) &&
      sameKeys(current.minimized, next.minimized))
  ) {
    return layout;
  }
  if (!hasPages(layout)) {
    return {
      ...layout,
      order: next.order,
      hidden: next.hidden,
      minimized: next.minimized,
    };
  }
  return {
    ...layout,
    pages: (layout.pages ?? []).map((page) =>
      page.key === pageKey
        ? {
            ...page,
            order: next.order,
            hidden: next.hidden,
            minimized: next.minimized,
          }
        : page
    ),
  };
}

function normalizedTitle(title: string): string {
  return title.trim().normalize('NFKC').toLowerCase();
}

/** The key of the page a `page` reference names: a key, else a title. */
export function resolvePageKey(
  layout: DashboardLayout,
  reference: string | undefined
): string | undefined {
  if (reference === undefined || reference === '') return undefined;
  const pages: readonly LayoutPage[] = pageList(layout);
  const byKey: LayoutPage | undefined = pages.find((p) => p.key === reference);
  if (byKey !== undefined) return byKey.key;
  const wanted: string = normalizedTitle(reference);
  return pages.find((p) => normalizedTitle(p.title) === wanted)?.key;
}

function homePageKey(layout: DashboardLayout, item: LayoutItem): string {
  return (
    resolvePageKey(layout, item.page) ?? (pageList(layout)[0] as LayoutPage).key
  );
}

/**
 * Which page each widget shows on: the page that lists it (in its order or
 * hidden list), else its home page (`definition.page`, else the first page).
 * A widget locked against moving always shows on its home page, so a viewer's
 * saved layout can't move it. Definitions keep their input order.
 */
export function assignPages<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout
): Map<string, T[]> {
  const pages: readonly LayoutPage[] = pageList(layout);
  const assigned = new Map<string, T[]>(pages.map((p) => [p.key, []]));
  for (const definition of definitions) {
    let pageKey: string | undefined;
    if (!resolveWidgetLock(definition).move) {
      pageKey = pages.find(
        (p) =>
          p.order.includes(definition.key) || p.hidden.includes(definition.key)
      )?.key;
    }
    assigned.get(pageKey ?? homePageKey(layout, definition))?.push(definition);
  }
  return assigned;
}

/** The key of the page a widget shows on; undefined if it isn't a definition. */
export function pageOf<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string
): string | undefined {
  for (const [pageKey, widgets] of assignPages(definitions, layout)) {
    if (widgets.some((w) => w.key === key)) return pageKey;
  }
  return undefined;
}

/** A page's visible widgets, in display order (minimized ones included). */
export function pageWidgets<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  pageKey: string
): T[] {
  const onPage: T[] = assignPages(definitions, layout).get(pageKey) ?? [];
  const view: DashboardLayout | undefined = pageLayout(layout, pageKey);
  return view === undefined ? [] : visibleWidgets(onPage, view);
}

/** How full a page is. */
export interface PageRoom {
  readonly maxRows: number;
  readonly rowsUsed: number;
  readonly rowsFree: number;
}

/** Rows a page allows, uses and has left, as the grid will draw them. */
export function pageRoom<T extends PageItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  pageKey: string,
  options: PageOptions = {}
): PageRoom | undefined {
  const page: LayoutPage | undefined = pageList(layout).find(
    (p) => p.key === pageKey
  );
  if (page === undefined) return undefined;
  const maxRows: number = rowsAllowed(page, options);
  const rowsUsed: number = placeRows(
    pageWidgets(definitions, layout, pageKey)
  ).length;
  return { maxRows, rowsUsed, rowsFree: Math.max(0, maxRows - rowsUsed) };
}

function describePage(page: LayoutPage): string {
  return `Page "${page.title}"`;
}

function titleOf(item: PageItem): string {
  return item.title ?? item.key;
}

/** Checks a page title: not empty, short enough, not used by another page. */
function checkTitle(
  layout: DashboardLayout,
  title: string,
  exceptKey?: string
): Result<string> {
  const trimmed: string = title.trim();
  if (trimmed === '') return err('A page title must not be empty.');
  if (trimmed.length > MAX_PAGE_TITLE_LENGTH) {
    return err(
      `Page title "${trimmed}" is ${trimmed.length} characters; the most is ${MAX_PAGE_TITLE_LENGTH}.`
    );
  }
  const wanted: string = normalizedTitle(trimmed);
  const clash: LayoutPage | undefined = pageList(layout).find(
    (p) => p.key !== exceptKey && normalizedTitle(p.title) === wanted
  );
  if (clash !== undefined) {
    return err(`Another page is already called "${clash.title}".`);
  }
  return ok(trimmed);
}

/** The first `page-N` key no page uses. */
export function nextPageKey(layout: DashboardLayout): string {
  const keys = new Set<string>(pageList(layout).map((p) => p.key));
  let n = 1;
  while (keys.has(`page-${n}`)) n += 1;
  return `page-${n}`;
}

/** The first "Page N" title no page uses. */
function nextPageTitle(layout: DashboardLayout): string {
  const used = new Set<string>(
    pageList(layout).map((p) => normalizedTitle(p.title))
  );
  let n: number = pageList(layout).length + 1;
  while (used.has(normalizedTitle(`Page ${n}`))) n += 1;
  return `Page ${n}`;
}

export interface AddPageOptions {
  /** The new page's title. Default: the next free "Page N". */
  readonly title?: string;
  /** The new page's key. Default: the next free `page-N`. */
  readonly key?: string;
}

/**
 * Adds an empty page after the last one. A layout without pages gains an
 * explicit first page holding everything it had.
 */
export function addPage(
  layout: DashboardLayout,
  options: AddPageOptions = {}
): Result<DashboardLayout> {
  if (pageList(layout).length >= MAX_PARSED_PAGES) {
    return err(
      `The layout already has ${MAX_PARSED_PAGES} pages, the most it can keep.`
    );
  }
  const key: string = options.key ?? nextPageKey(layout);
  if (pageList(layout).some((p) => p.key === key)) {
    return err(`A page with the key "${key}" already exists.`);
  }
  const title: Result<string> = checkTitle(
    layout,
    options.title ?? nextPageTitle(layout)
  );
  if (!title.ok) return title;
  const base: DashboardLayout = withExplicitPages(layout);
  const page: LayoutPage = {
    key,
    title: title.value,
    order: [],
    hidden: [],
    minimized: [],
  };
  return ok({ ...base, pages: [...(base.pages ?? []), page] });
}

/** Renames a page. The same layout comes back when the title is unchanged. */
export function renamePage(
  layout: DashboardLayout,
  pageKey: string,
  title: string
): Result<DashboardLayout> {
  const page: LayoutPage | undefined = pageList(layout).find(
    (p) => p.key === pageKey
  );
  if (page === undefined) return err(`Page "${pageKey}" doesn't exist.`);
  const checked: Result<string> = checkTitle(layout, title, pageKey);
  if (!checked.ok) return checked;
  if (checked.value === page.title) return ok(layout);
  const base: DashboardLayout = withExplicitPages(layout);
  return ok({
    ...base,
    pages: (base.pages ?? []).map((p) =>
      p.key === pageKey ? { ...p, title: checked.value } : p
    ),
  });
}

/**
 * Moves a page `offset` places (negative is earlier), clamped at the ends.
 * Returns the same layout when nothing moves.
 */
export function movePage(
  layout: DashboardLayout,
  pageKey: string,
  offset: number
): DashboardLayout {
  const pages: readonly LayoutPage[] = layout.pages ?? [];
  const from: number = pages.findIndex((p) => p.key === pageKey);
  if (from === -1) return layout;
  const to: number = Math.max(
    0,
    Math.min(pages.length - 1, from + Math.trunc(offset))
  );
  if (to === from) return layout;
  const next: LayoutPage[] = [...pages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as LayoutPage);
  return { ...layout, pages: next };
}

function overflowing<T extends PageItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  options: PageOptions
): LayoutPage | undefined {
  return pageList(layout).find(
    (page) =>
      placeRows(pageWidgets(definitions, layout, page.key)).length >
      rowsAllowed(page, options)
  );
}

/**
 * Removes a page. Its widgets move to the end of the previous page (the next
 * one when it was first), keeping their hidden and minimized state. Refused
 * for the only page, and when the widgets wouldn't fit on the pages left.
 */
export function removePage<T extends PageItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  pageKey: string,
  options: PageOptions = {}
): Result<DashboardLayout> {
  const pages: readonly LayoutPage[] = pageList(layout);
  const index: number = pages.findIndex((p) => p.key === pageKey);
  const page: LayoutPage | undefined = pages[index];
  if (page === undefined) return err(`Page "${pageKey}" doesn't exist.`);
  if (pages.length === 1) {
    return err(
      `${describePage(page)} is the only page, so it can't be removed.`
    );
  }
  const target: LayoutPage = pages[index > 0 ? index - 1 : 1] as LayoutPage;
  const merged: DashboardLayout = {
    ...layout,
    pages: pages
      .filter((p) => p.key !== pageKey)
      .map((p) =>
        p.key === target.key
          ? {
              ...p,
              order:
                index > 0
                  ? [...p.order, ...page.order]
                  : [...page.order, ...p.order],
              hidden: [...p.hidden, ...page.hidden],
              minimized: [...p.minimized, ...page.minimized],
            }
          : p
      ),
  };
  const full: LayoutPage | undefined = overflowing(
    definitions,
    merged,
    options
  );
  if (full !== undefined) {
    return err(
      `${describePage(page)} has widgets that don't fit on the other pages (${describePage(full)} would need more than ${rowsAllowed(full, options)} rows). Move or hide some first.`
    );
  }
  return ok(merged);
}

function without(keys: readonly string[], key: string): readonly string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : keys;
}

/**
 * Moves a widget to the end of another page, keeping its hidden and
 * minimized state. Refused for an unknown widget or page, for a widget locked
 * against moving, and when a visible widget wouldn't fit in the page's rows.
 */
export function moveWidgetToPage<T extends PageItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  widgetKey: string,
  targetKey: string,
  options: PageOptions = {}
): Result<DashboardLayout> {
  const widget: T | undefined = definitions.find((d) => d.key === widgetKey);
  if (widget === undefined) {
    return err(
      `Widget "${widgetKey}" isn't one of the widgets, so it can't be moved to a page.`
    );
  }
  const pages: readonly LayoutPage[] = pageList(layout);
  const target: LayoutPage | undefined = pages.find((p) => p.key === targetKey);
  if (target === undefined) return err(`Page "${targetKey}" doesn't exist.`);
  const sourceKey: string = pageOf(definitions, layout, widgetKey) as string;
  if (sourceKey === targetKey) return ok(layout);
  if (resolveWidgetLock(widget).move) {
    return err(
      `Widget "${titleOf(widget)}" is locked against moving, so it can't be moved to ${describePage(target)}.`
    );
  }
  const base: DashboardLayout = withExplicitPages(layout);
  const source: LayoutPage = (base.pages ?? []).find(
    (p) => p.key === sourceKey
  ) as LayoutPage;
  const hidden: boolean = source.hidden.includes(widgetKey);
  const minimized: boolean = source.minimized.includes(widgetKey);
  // The widget joins the end of the target's display order.
  const targetOrder: readonly string[] = pageWidgets(
    definitions,
    base,
    targetKey
  ).map((d) => d.key);
  const moved: DashboardLayout = {
    ...base,
    pages: (base.pages ?? []).map((p) => {
      if (p.key === sourceKey) {
        return {
          ...p,
          order: without(p.order, widgetKey),
          hidden: without(p.hidden, widgetKey),
          minimized: without(p.minimized, widgetKey),
        };
      }
      if (p.key === targetKey) {
        return {
          ...p,
          order: hidden ? p.order : [...targetOrder, widgetKey],
          hidden: hidden ? [...p.hidden, widgetKey] : p.hidden,
          minimized: minimized ? [...p.minimized, widgetKey] : p.minimized,
        };
      }
      return p;
    }),
  };
  if (!hidden) {
    const allowed: number = rowsAllowed(target, options);
    const needed: number = placeRows(
      pageWidgets(definitions, moved, targetKey)
    ).length;
    if (needed > allowed) {
      return err(
        `${describePage(target)} has no room for "${titleOf(widget)}": it would need row ${needed}, and the page allows ${allowed}.`
      );
    }
  }
  return ok(moved);
}

export interface NormalizeOptions extends PageOptions {
  /** Skip lock enforcement, for a user who may rearrange locked widgets. */
  readonly overrideLocks?: boolean;
}

function withoutLockField<T extends LayoutItem>(definition: T): T {
  if (definition.locked === undefined) return definition;
  const copy: { -readonly [K in keyof T]: T[K] } = { ...definition };
  delete copy.locked;
  return copy;
}

function uniqueTitle(taken: Set<string>, title: string, index: number): string {
  let base: string = title.trim().slice(0, MAX_PAGE_TITLE_LENGTH);
  if (base === '') base = `Page ${index + 1}`;
  let candidate: string = base;
  let n = 1;
  while (taken.has(normalizedTitle(candidate))) {
    const suffix = ` (#${n})`;
    candidate = `${base.slice(0, MAX_PAGE_TITLE_LENGTH - suffix.length)}${suffix}`;
    n += 1;
  }
  taken.add(normalizedTitle(candidate));
  return candidate;
}

function samePages(
  a: readonly LayoutPage[],
  b: readonly LayoutPage[]
): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i] as LayoutPage;
      return (
        p.key === q.key &&
        p.title === q.title &&
        p.maxRows === q.maxRows &&
        sameKeys(p.order, q.order) &&
        sameKeys(p.hidden, q.hidden) &&
        sameKeys(p.minimized, q.minimized)
      );
    })
  );
}

/**
 * Repairs a layout so it can be trusted, for the place it is saved: unknown
 * widgets are dropped, locks are enforced, and in a paged layout each widget
 * lives on one page, titles are trimmed, unique and short, widgets no page
 * lists yet are placed (on their home page), and a page that holds too many
 * rows has its overflow moved, in order, to the next page with room or a new
 * page after it. Nothing is hidden or dropped to make room. Idempotent;
 * returns the same object when nothing changes.
 */
export function normalizeLayout<T extends PageItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  options: NormalizeOptions = {}
): DashboardLayout {
  const known: DashboardLayout = pruneLayout(definitions, layout);
  const locked: DashboardLayout = enforceLocks(definitions, known, options);
  if (!hasPages(locked)) return locked === layout ? layout : locked;

  const defs: readonly T[] =
    options.overrideLocks === true
      ? definitions.map(withoutLockField)
      : definitions;

  // Pages: one per key, one page per widget, clean titles.
  const taken = new Set<string>();
  const seenKeys = new Set<string>();
  const held = new Set<string>();
  let pages: LayoutPage[] = [];
  (locked.pages ?? []).forEach((page, index) => {
    if (seenKeys.has(page.key)) return;
    seenKeys.add(page.key);
    const keep = (list: readonly string[]): string[] => [
      ...new Set(list.filter((k) => !held.has(k))),
    ];
    const next: LayoutPage = {
      ...page,
      title: uniqueTitle(taken, page.title, index),
      order: keep(page.order),
      hidden: keep(page.hidden),
      minimized: keep(page.minimized),
    };
    for (const k of [...next.order, ...next.hidden]) held.add(k);
    pages.push(next);
  });

  const work = (): DashboardLayout => ({ ...locked, pages });

  // A widget locked against moving belongs to its home page: its hidden and
  // minimized entries move there, and it is never listed in an order.
  const pinned: T[] = defs.filter((d) => resolveWidgetLock(d).move);
  for (const widget of pinned) {
    const home: string = homePageKey(work(), widget);
    const keysHere = (p: LayoutPage, list: 'hidden' | 'minimized') =>
      p.key !== home && p[list].includes(widget.key);
    const wasHidden: boolean = pages.some((p) => keysHere(p, 'hidden'));
    const wasMinimized: boolean = pages.some((p) => keysHere(p, 'minimized'));
    if (!wasHidden && !wasMinimized) continue;
    pages = pages.map((p) => {
      let next: LayoutPage = p;
      if (keysHere(p, 'hidden')) {
        next = { ...next, hidden: without(next.hidden, widget.key) };
      }
      if (keysHere(p, 'minimized')) {
        next = { ...next, minimized: without(next.minimized, widget.key) };
      }
      if (p.key === home) {
        next = {
          ...next,
          hidden:
            wasHidden && !next.hidden.includes(widget.key)
              ? [...next.hidden, widget.key]
              : next.hidden,
          minimized:
            wasMinimized && !next.minimized.includes(widget.key)
              ? [...next.minimized, widget.key]
              : next.minimized,
        };
      }
      return next;
    });
  }

  // Widgets no page lists yet join the end of their home page's order.
  const placedKeys = new Set<string>();
  for (const p of pages) {
    for (const k of [...p.order, ...p.hidden]) placedKeys.add(k);
  }
  const pinnedKeys = new Set<string>(pinned.map((d) => d.key));
  const unplaced: T[] = defs
    .filter((d) => !placedKeys.has(d.key) && !pinnedKeys.has(d.key))
    .map((definition, index) => ({ definition, index }))
    .sort(
      (a, b) =>
        (a.definition.sortOrder ?? 0) - (b.definition.sortOrder ?? 0) ||
        a.index - b.index
    )
    .map(({ definition }) => definition);
  for (const widget of unplaced) {
    const home: string = homePageKey(work(), widget);
    pages = pages.map((p) =>
      p.key === home ? { ...p, order: [...p.order, widget.key] } : p
    );
  }

  // Overflow moves, in order, to the next page with room or a new page.
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i] as LayoutPage;
    const shown: T[] = pageWidgets(defs, work(), page.key);
    const fits: number = fitCount(shown, rowsAllowed(page, options));
    if (fits >= shown.length) continue;
    const moving: string[] = shown
      .slice(fits)
      .filter((d) => !pinnedKeys.has(d.key))
      .map((d) => d.key);
    if (moving.length === 0) continue;
    const moveSet = new Set<string>(moving);
    const movedMinimized: string[] = page.minimized.filter((k) =>
      moveSet.has(k)
    );
    pages = pages.map((p) =>
      p.key === page.key
        ? {
            ...p,
            order: p.order.filter((k) => !moveSet.has(k)),
            minimized: p.minimized.filter((k) => !moveSet.has(k)),
          }
        : p
    );
    let placed = false;
    for (let j = i + 1; j < pages.length && !placed; j += 1) {
      const candidate: LayoutPage = pages[j] as LayoutPage;
      const trial: LayoutPage[] = pages.map((p) =>
        p.key === candidate.key
          ? {
              ...p,
              order: [...moving, ...p.order],
              minimized: [...p.minimized, ...movedMinimized],
            }
          : p
      );
      const items: T[] = pageWidgets(
        defs,
        { ...locked, pages: trial },
        candidate.key
      );
      if (placeRows(items).length <= rowsAllowed(candidate, options)) {
        pages = trial;
        placed = true;
      }
    }
    if (!placed) {
      const key: string = nextPageKey(work());
      const title: string = uniqueTitle(
        new Set<string>(pages.map((p) => normalizedTitle(p.title))),
        `Page ${pages.length + 1}`,
        pages.length
      );
      pages = [
        ...pages,
        { key, title, order: moving, hidden: [], minimized: movedMinimized },
      ];
    }
  }

  const result: DashboardLayout = work();
  return samePages(layout.pages ?? [], pages) &&
    sameKeys(layout.order, result.order)
    ? layout
    : result;
}
