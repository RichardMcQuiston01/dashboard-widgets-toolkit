import type { WidgetDetailOptions, WidgetTableControls } from './detail.js';
import type { WidgetOption } from './options.js';
import type { WidgetKind } from './payload.js';

/** A size hint for grid layouts; renderers may map it to column spans. */
export const WIDGET_SIZES = ['small', 'medium', 'large', 'full'] as const;

export type WidgetSize = (typeof WIDGET_SIZES)[number];

/**
 * How a widget fills free space in a grid layout. `height` stretches it to
 * the height of its row; `width` widens it to take the columns left over in
 * its row; `both` does both. Absent, a widget is only as big as its content
 * and `defaultSize`.
 */
export const WIDGET_FILLS = ['height', 'width', 'both'] as const;

export type WidgetFill = (typeof WIDGET_FILLS)[number];

/**
 * What a widget is, independent of its data. Mirrors Maker Toolkit's
 * `widget` table (`widget_key`, `title`, `description`, `view_type`,
 * `roles`, `sort_order`, `active`).
 */
export interface WidgetDefinition {
  /** Stable, unique id. Layouts and providers are keyed by it. */
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly kind: WidgetKind;
  /** Lower comes first. Default 0; ties keep definition order. */
  readonly sortOrder?: number;
  /** Roles allowed to see it. Absent or empty means everyone. */
  readonly roles?: readonly string[];
  /** False hides it from every user. Default true. */
  readonly active?: boolean;
  readonly defaultSize?: WidgetSize;
  /**
   * Share of the row the widget takes, in twelfths: an integer from 2 to 12
   * (6 is half the row, 12 the whole row). When any widget in a grid sets
   * it, the grid becomes 12 columns wide and widgets without a `width` use
   * the one their `defaultSize` implies (see `widthForSize`). Narrow grids
   * give widgets more room automatically.
   */
  readonly width?: number;
  /**
   * Gives the widget a detail view: a full list with sorting, filtering and
   * paging. `true` uses defaults. The data comes from a detail provider.
   */
  readonly detail?: boolean | WidgetDetailOptions;
  /**
   * TABLE widgets only: a search box and sortable column headers in the card
   * itself, working on the rows the card holds. `true` turns on both. With a
   * `footer` (rows were left out) they only see the rows shown; use `detail`
   * for the full list.
   */
  readonly tableControls?: boolean | WidgetTableControls;
  /** Fill free space in the row (height, width or both). Default: none. */
  readonly fill?: WidgetFill;
  /**
   * Keeps viewers from rearranging this widget. `true` locks everything:
   * move, hide and minimize. Use an object to lock only some; fields left out
   * are not locked.
   */
  readonly locked?: boolean | WidgetLock;
  /**
   * The widget's home page in a paged dashboard: a page key or title. A
   * widget no page lists yet (and a widget locked against moving) shows here;
   * without it, on the first page. Ignored when the layout has no pages.
   */
  readonly page?: string;
  /**
   * Choices the author offers, with defaults: a default sort, "top N", a
   * period, which columns show. The chosen values reach your provider as
   * `ProviderOptions.options`. See `options.ts`.
   */
  readonly options?: readonly WidgetOption[];
}

/** What a viewer may not do to a locked widget. */
export interface WidgetLock {
  /** Can't be reordered, and holds its place (a pinned slot). */
  readonly move?: boolean;
  /** Can't be hidden. */
  readonly hide?: boolean;
  /** Can't be collapsed to its header. */
  readonly minimize?: boolean;
}

/** `WidgetLock` with every default filled in. */
export type ResolvedWidgetLock = Required<WidgetLock>;

const NOT_LOCKED: ResolvedWidgetLock = Object.freeze({
  move: false,
  hide: false,
  minimize: false,
});
const FULLY_LOCKED: ResolvedWidgetLock = Object.freeze({
  move: true,
  hide: true,
  minimize: true,
});

/**
 * Reads a widget's `locked` setting with defaults: `true` locks move, hide
 * and minimize, an object locks the fields it sets to `true`, and anything
 * else (absent, `false`) locks nothing.
 */
export function resolveWidgetLock(
  definition: Pick<WidgetDefinition, 'locked'>
): ResolvedWidgetLock {
  const setting: boolean | WidgetLock | undefined = definition.locked;
  if (setting === true) return FULLY_LOCKED;
  if (setting === undefined || setting === false) return NOT_LOCKED;
  return {
    move: setting.move === true,
    hide: setting.hide === true,
    minimize: setting.minimize === true,
  };
}

/**
 * Identity helper that keeps the literal `kind` (so typed providers can be
 * checked against it) and gives a definition its type without a cast.
 */
export function defineWidget<const D extends WidgetDefinition>(
  definition: D
): D {
  return definition;
}

/** Definitions sorted by `sortOrder` (stable: ties keep their input order). */
export function sortDefinitions<D extends WidgetDefinition>(
  definitions: readonly D[]
): D[] {
  return definitions
    .map((definition, index) => ({ definition, index }))
    .sort(
      (a, b) =>
        (a.definition.sortOrder ?? 0) - (b.definition.sortOrder ?? 0) ||
        a.index - b.index
    )
    .map(({ definition }) => definition);
}

/** Whether a widget is active and visible to someone with these roles. */
export function isWidgetVisibleTo(
  definition: WidgetDefinition,
  roles: readonly string[] | undefined
): boolean {
  if (definition.active === false) {
    return false;
  }
  if (definition.roles === undefined || definition.roles.length === 0) {
    return true;
  }
  if (roles === undefined) {
    return false;
  }
  return definition.roles.some((role) => roles.includes(role));
}
