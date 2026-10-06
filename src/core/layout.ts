/**
 * A viewer's dashboard customisation: order, hidden and minimised widgets.
 * Pure functions over a small JSON-serialisable object. Persist it however
 * you like (a settings table, localStorage); `parseLayout` tolerates
 * anything, so a corrupt saved value never breaks the dashboard.
 *
 * Generalised from Maker Toolkit's desktop `dashboard-layout.ts`.
 */

/** What layout functions need from a widget definition. */
export interface LayoutItem {
  readonly key: string;
  readonly sortOrder?: number;
}

export interface DashboardLayout {
  /** Widget keys in display order. Keys not listed follow, by sortOrder. */
  readonly order: readonly string[];
  /** Widget keys removed from the dashboard (restorable). */
  readonly hidden: readonly string[];
  /** Widget keys collapsed to their header. */
  readonly minimized: readonly string[];
}

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
  if (order.length === 0 && hidden.length === 0 && minimized.length === 0) {
    return EMPTY_LAYOUT;
  }
  return { order, hidden, minimized };
}

/** The JSON string to persist. */
export function serializeLayout(layout: DashboardLayout): string {
  return JSON.stringify({
    order: [...layout.order],
    hidden: [...layout.hidden],
    minimized: [...layout.minimized],
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

/**
 * The widgets to show, in order: saved keys first (when still present),
 * then widgets the layout doesn't know yet, by sortOrder. Hidden widgets
 * are left out.
 */
export function visibleWidgets<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout
): T[] {
  const hidden = new Set<string>(layout.hidden);
  const visible: T[] = definitions.filter((d) => !hidden.has(d.key));
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
 * same layout object when the key isn't visible or the index is out of
 * range, so callers can skip a save.
 */
export function moveWidget<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string,
  toIndex: number
): DashboardLayout {
  const current: string[] = visibleWidgets(definitions, layout).map(
    (d) => d.key
  );
  const fromIndex: number = current.indexOf(key);
  if (
    fromIndex === -1 ||
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= current.length ||
    toIndex === fromIndex
  ) {
    return layout;
  }
  const next: string[] = [...current];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, key);
  return { ...layout, order: next };
}

/** Moves `key` by `offset` places (negative is earlier). Clamped at the ends. */
export function moveWidgetBy<T extends LayoutItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string,
  offset: number
): DashboardLayout {
  const current: string[] = visibleWidgets(definitions, layout).map(
    (d) => d.key
  );
  const fromIndex: number = current.indexOf(key);
  if (fromIndex === -1) return layout;
  const toIndex: number = Math.max(
    0,
    Math.min(current.length - 1, fromIndex + Math.trunc(offset))
  );
  return moveWidget(definitions, layout, key, toIndex);
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

/** Hides or shows `key` (showing also clears its minimised state). */
export function toggleHidden(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  return isHidden(layout, key)
    ? showWidget(layout, key)
    : hideWidget(layout, key);
}

/** Collapses `key` to its header. No-op (same object) if already minimised. */
export function minimizeWidget(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (isMinimized(layout, key)) return layout;
  return { ...layout, minimized: [...layout.minimized, key] };
}

/** Expands `key`. No-op (same object) if not minimised. */
export function restoreWidget(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (!isMinimized(layout, key)) return layout;
  return { ...layout, minimized: layout.minimized.filter((k) => k !== key) };
}

/** Minimises or restores `key`. */
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
  const keep = (keys: readonly string[]): string[] =>
    keys.filter((k) => known.has(k));
  const next: DashboardLayout = {
    order: keep(layout.order),
    hidden: keep(layout.hidden),
    minimized: keep(layout.minimized),
  };
  return next.order.length === layout.order.length &&
    next.hidden.length === layout.hidden.length &&
    next.minimized.length === layout.minimized.length
    ? layout
    : next;
}
