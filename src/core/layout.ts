/**
 * A viewer's dashboard customization: order, hidden and minimized widgets.
 * Pure functions over a small JSON-serialisable object. Persist it however
 * you like (a settings table, localStorage); `parseLayout` tolerates
 * anything, so a corrupt saved value never breaks the dashboard.
 *
 * Generalised from Maker Toolkit's desktop `dashboard-layout.ts`.
 */

import { resolveWidgetLock, type WidgetLock } from './definition.js';

/** What layout functions need from a widget definition. */
export interface LayoutItem {
  readonly key: string;
  readonly sortOrder?: number;
  /** See `WidgetDefinition.locked`. Pinned widgets hold their slot. */
  readonly locked?: boolean | WidgetLock;
  /** See `WidgetDefinition.page`: the widget's home page. */
  readonly page?: string;
}

export interface DashboardLayout {
  /** Widget keys in display order. Keys not listed follow, by sortOrder. */
  readonly order: readonly string[];
  /** Widget keys removed from the dashboard (restorable). */
  readonly hidden: readonly string[];
  /** Widget keys collapsed to their header. */
  readonly minimized: readonly string[];
  /**
   * Pages of widgets. Absent, the lists above are the one and only page. With
   * pages, each page owns its own lists and the top-level lists are left
   * empty. See `pages.ts`.
   */
  readonly pages?: readonly LayoutPage[];
}

/** One page of a paged layout: the same lists as a layout, plus a name. */
export interface LayoutPage {
  /** Unique within the layout and stable when the page is renamed or moved. */
  readonly key: string;
  /** Shown in the page bar. At most `MAX_PAGE_TITLE_LENGTH` characters. */
  readonly title: string;
  readonly order: readonly string[];
  readonly hidden: readonly string[];
  readonly minimized: readonly string[];
  /** Rows this page holds, overriding the dashboard's default. */
  readonly maxRows?: number;
}

/** Longest page title; longer saved titles are cut. */
export const MAX_PAGE_TITLE_LENGTH = 30;
/**
 * Most pages `parseLayout` keeps: a safety ceiling against malformed or
 * hostile JSON, not a product limit.
 */
export const MAX_PARSED_PAGES = 50;
/** Most rows a page may be given with `maxRows`. */
export const MAX_PAGE_ROWS = 20;

export const EMPTY_LAYOUT: DashboardLayout = Object.freeze({
  order: Object.freeze([]) as readonly string[],
  hidden: Object.freeze([]) as readonly string[],
  minimized: Object.freeze([]) as readonly string[],
});

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && entry !== '') seen.add(entry);
  }
  return [...seen];
}

/**
 * Reads a saved layout: a JSON string or an already-parsed object. Missing,
 * corrupt or wrongly typed values give the empty layout (or empty lists for
 * the fields that are wrong); non-string and duplicate keys are dropped.
 */
export function parseLayout(raw: unknown): DashboardLayout {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return EMPTY_LAYOUT;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return EMPTY_LAYOUT;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const order: string[] = uniqueStrings(record['order']);
  const hidden: string[] = uniqueStrings(record['hidden']);
  const minimized: string[] = uniqueStrings(record['minimized']);
  const pages: LayoutPage[] = parsePages(record['pages']);
  if (pages.length > 0) {
    // With pages, the pages own placement and the top-level lists stay empty.
    return {
      order: EMPTY_LAYOUT.order,
      hidden: EMPTY_LAYOUT.hidden,
      minimized: EMPTY_LAYOUT.minimized,
      pages,
    };
  }
  if (order.length === 0 && hidden.length === 0 && minimized.length === 0) {
    return EMPTY_LAYOUT;
  }
  return { order, hidden, minimized };
}

function parsePages(value: unknown): LayoutPage[] {
  if (!Array.isArray(value)) return [];
  const pages: LayoutPage[] = [];
  const keys = new Set<string>();
  for (const entry of value.slice(0, MAX_PARSED_PAGES)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    const key: unknown = record['key'];
    if (typeof key !== 'string' || key === '' || keys.has(key)) continue;
    keys.add(key);
    const rawTitle: unknown = record['title'];
    const title: string =
      typeof rawTitle === 'string' && rawTitle.trim() !== ''
        ? rawTitle.trim().slice(0, MAX_PAGE_TITLE_LENGTH)
        : `Page ${pages.length + 1}`;
    const maxRows: unknown = record['maxRows'];
    // A widget lives on one page: the first page that holds it keeps it.
    const held = new Set<string>();
    for (const earlier of pages) {
      for (const k of [...earlier.order, ...earlier.hidden]) held.add(k);
    }
    const keep = (list: unknown): string[] =>
      uniqueStrings(list).filter((k) => !held.has(k));
    pages.push({
      key,
      title,
      order: keep(record['order']),
      hidden: keep(record['hidden']),
      minimized: keep(record['minimized']),
      ...(typeof maxRows === 'number' &&
      Number.isInteger(maxRows) &&
      maxRows >= 1 &&
      maxRows <= MAX_PAGE_ROWS
        ? { maxRows }
        : {}),
    });
  }
  return pages;
}

/** The JSON string to persist. */
export function serializeLayout(layout: DashboardLayout): string {
  return JSON.stringify({
    order: [...layout.order],
    hidden: [...layout.hidden],
    minimized: [...layout.minimized],
    ...(layout.pages === undefined || layout.pages.length === 0
      ? {}
      : {
          pages: layout.pages.map((page) => ({
            key: page.key,
            title: page.title,
            order: [...page.order],
            hidden: [...page.hidden],
            minimized: [...page.minimized],
            ...(page.maxRows === undefined ? {} : { maxRows: page.maxRows }),
          })),
        }),
  });
}

function bySortOrder<T extends LayoutItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0) || a.index - b.index
    )
    .map(({ item }) => item);
}

function isPinned(item: LayoutItem): boolean {
  return resolveWidgetLock(item).move;
}

/**
 * The visible widgets in the viewer's order, ignoring locks: saved keys first
 * (when still present), then widgets the layout doesn't know yet, by
 * sortOrder.
 */
function viewerOrder<T extends LayoutItem>(
  visible: readonly T[],
  layout: DashboardLayout
): T[] {
  const byKey = new Map<string, T>(visible.map((d) => [d.key, d]));
  const ordered: T[] = [];
  for (const key of layout.order) {
    const definition: T | undefined = byKey.get(key);
    if (definition !== undefined) {
      ordered.push(definition);
      byKey.delete(key);
    }
  }
  for (const definition of bySortOrder(visible)) {
    if (byKey.has(definition.key)) ordered.push(definition);
  }
  return ordered;
}

/**
 * Lays `free` widgets out around the pinned ones. A pinned widget keeps its
 * slot: its index among the visible widgets in `sortOrder` order. Free
 * widgets fill the remaining slots, left to right.
 */
function placeAroundPinned<T extends LayoutItem>(
  visible: readonly T[],
  free: readonly T[]
): T[] {
  const slots: (T | undefined)[] = bySortOrder(visible).map((item) =>
    isPinned(item) ? item : undefined
  );
  let next = 0;
  return slots.map((pinned) => pinned ?? (free[next++] as T));
}

/**
 * The widgets to show, in order: saved keys first (when still present),
 * then widgets the layout doesn't know yet, by sortOrder. Hidden widgets
 * are left out. Widgets locked against moving are pinned: each keeps its
 * place from the definitions (never from `layout.order`) and the others
 * rearrange around it.
 */
export function visibleWidgets<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout
): T[] {
  const hidden = new Set<string>(layout.hidden);
  const visible: T[] = definitions.filter((d) => !hidden.has(d.key));
  const ordered: T[] = viewerOrder(visible, layout);
  if (!visible.some(isPinned)) return ordered;
  return placeAroundPinned(
    visible,
    ordered.filter((item) => !isPinned(item))
  );
}

/** Hidden widgets, by sortOrder, for a "restore" menu. */
export function hiddenWidgets<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout
): T[] {
  const hidden = new Set<string>(layout.hidden);
  return bySortOrder(definitions.filter((d) => hidden.has(d.key)));
}

/**
 * Moves `key` to `toIndex` within the current visible order. Returns the
 * same layout object when the key isn't visible, the index is out of range,
 * or the move isn't allowed: a pinned widget can't move, and nothing can be
 * moved onto a pinned slot. Free widgets keep their relative order around
 * pinned ones, so a move that crosses a pinned slot lands on the nearest
 * free slot you named.
 */
export function moveWidget<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string,
  toIndex: number
): DashboardLayout {
  const current: T[] = visibleWidgets(definitions, layout);
  const fromIndex: number = current.findIndex((d) => d.key === key);
  const mover: T | undefined = current[fromIndex];
  if (
    mover === undefined ||
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= current.length ||
    toIndex === fromIndex ||
    isPinned(mover) ||
    isPinned(current[toIndex] as T)
  ) {
    return layout;
  }
  const freeSlots: number[] = freeSlotIndexes(current);
  const free: T[] = current.filter((item) => !isPinned(item));
  const fromFree: number = freeSlots.indexOf(fromIndex);
  const toFree: number = freeSlots.indexOf(toIndex);
  free.splice(fromFree, 1);
  free.splice(toFree, 0, mover);
  const next: T[] = placeAroundPinned(current, free);
  return { ...layout, order: next.map((d) => d.key) };
}

/** Indexes of the slots in `ordered` that are not pinned. */
function freeSlotIndexes(ordered: readonly LayoutItem[]): number[] {
  const slots: number[] = [];
  ordered.forEach((item, index) => {
    if (!isPinned(item)) slots.push(index);
  });
  return slots;
}

/**
 * Moves `key` by `offset` places (negative is earlier). Pinned slots are
 * stepped over, not counted, and the move is clamped at the first and last
 * free slot.
 */
export function moveWidgetBy<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string,
  offset: number
): DashboardLayout {
  const current: T[] = visibleWidgets(definitions, layout);
  const fromIndex: number = current.findIndex((d) => d.key === key);
  if (fromIndex === -1) return layout;
  const freeSlots: number[] = freeSlotIndexes(current);
  const fromFree: number = freeSlots.indexOf(fromIndex);
  if (fromFree === -1) return layout;
  const toFree: number = Math.max(
    0,
    Math.min(freeSlots.length - 1, fromFree + Math.trunc(offset))
  );
  return moveWidget(definitions, layout, key, freeSlots[toFree] as number);
}

/** Moves `key` one place earlier. */
export function moveWidgetUp<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  return moveWidgetBy(definitions, layout, key, -1);
}

/** Moves `key` one place later. */
export function moveWidgetDown<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  return moveWidgetBy(definitions, layout, key, 1);
}

export function isHidden(layout: DashboardLayout, key: string): boolean {
  return layout.hidden.includes(key);
}

export function isMinimized(layout: DashboardLayout, key: string): boolean {
  return layout.minimized.includes(key);
}

/** Hides `key`. No-op (same object) if already hidden. */
export function hideWidget(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (isHidden(layout, key)) return layout;
  return { ...layout, hidden: [...layout.hidden, key] };
}

/** Shows `key` again, expanded. No-op (same object) if not hidden. */
export function showWidget(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (!isHidden(layout, key)) return layout;
  return {
    ...layout,
    hidden: layout.hidden.filter((k) => k !== key),
    minimized: layout.minimized.filter((k) => k !== key),
  };
}

/** Hides or shows `key` (showing also clears its minimized state). */
export function toggleHidden(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  return isHidden(layout, key)
    ? showWidget(layout, key)
    : hideWidget(layout, key);
}

/** Collapses `key` to its header. No-op (same object) if already minimized. */
export function minimizeWidget(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (isMinimized(layout, key)) return layout;
  return { ...layout, minimized: [...layout.minimized, key] };
}

/** Expands `key`. No-op (same object) if not minimized. */
export function restoreWidget(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (!isMinimized(layout, key)) return layout;
  return { ...layout, minimized: layout.minimized.filter((k) => k !== key) };
}

/** Minimizes or restores `key`. */
export function toggleMinimized(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  return isMinimized(layout, key)
    ? restoreWidget(layout, key)
    : minimizeWidget(layout, key);
}

/**
 * Drops keys for widgets that no longer exist. Only pass the full list of
 * definitions (not a role-filtered one), or a viewer's settings for widgets
 * they temporarily can't see are lost.
 */
export function pruneLayout<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout
): DashboardLayout {
  const known = new Set<string>(definitions.map((d) => d.key));
  const keep = (keys: readonly string[]): readonly string[] =>
    keys.every((k) => known.has(k)) ? keys : keys.filter((k) => known.has(k));
  return mapLayoutLists(layout, (lists) => ({
    order: keep(lists.order),
    hidden: keep(lists.hidden),
    minimized: keep(lists.minimized),
  }));
}

/** The three lists a layout and each of its pages carry. */
interface LayoutLists {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
  readonly minimized: readonly string[];
}

/**
 * Applies `change` to the top-level lists and to each page's lists. Returns
 * the same object when no list changed (compared by identity, so `change`
 * should return the same arrays it was given when it has nothing to do).
 */
function mapLayoutLists(
  layout: DashboardLayout,
  change: (lists: LayoutLists) => LayoutLists
): DashboardLayout {
  const top: LayoutLists = change(layout);
  const pages: LayoutPage[] | undefined = layout.pages?.map((page) => {
    const next: LayoutLists = change(page);
    return next.order === page.order &&
      next.hidden === page.hidden &&
      next.minimized === page.minimized
      ? page
      : { ...page, ...next };
  });
  const pagesChanged: boolean =
    pages !== undefined && pages.some((page, i) => page !== layout.pages?.[i]);
  if (
    top.order === layout.order &&
    top.hidden === layout.hidden &&
    top.minimized === layout.minimized &&
    !pagesChanged
  ) {
    return layout;
  }
  return {
    ...layout,
    ...top,
    ...(pages === undefined ? {} : { pages }),
  };
}

/** Options for `enforceLocks`. */
export interface EnforceLocksOptions {
  /**
   * Skip enforcement. Set it server-side only for a user who may rearrange
   * locked widgets (an administrator editing the default layout), never from
   * a flag the client sends.
   */
  readonly overrideLocks?: boolean;
}

/**
 * Removes whatever a widget's lock forbids from a layout: a hide-locked key
 * leaves `hidden`, a minimize-locked key leaves `minimized`, and a
 * move-locked key leaves `order` (a pinned widget's place comes from the
 * definitions). Idempotent; returns the same object when nothing changes.
 * Run it on a layout a client sends before saving it.
 */
export function enforceLocks<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  options: EnforceLocksOptions = {}
): DashboardLayout {
  if (options.overrideLocks === true) return layout;
  const noMove = new Set<string>();
  const noHide = new Set<string>();
  const noMinimize = new Set<string>();
  for (const definition of definitions) {
    const lock = resolveWidgetLock(definition);
    if (lock.move) noMove.add(definition.key);
    if (lock.hide) noHide.add(definition.key);
    if (lock.minimize) noMinimize.add(definition.key);
  }
  const without = (keys: readonly string[], drop: ReadonlySet<string>) =>
    keys.some((key) => drop.has(key))
      ? keys.filter((key) => !drop.has(key))
      : keys;
  return mapLayoutLists(layout, (lists) => ({
    order: without(lists.order, noMove),
    hidden: without(lists.hidden, noHide),
    minimized: without(lists.minimized, noMinimize),
  }));
}
