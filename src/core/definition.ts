import type { WidgetKind } from './payload.js';

/** A size hint for grid layouts; renderers may map it to column spans. */
export const WIDGET_SIZES = ['small', 'medium', 'large', 'full'] as const;

export type WidgetSize = (typeof WIDGET_SIZES)[number];

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
