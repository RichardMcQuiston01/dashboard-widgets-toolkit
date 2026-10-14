/**
 * Dashboard-level filters: a few choices (a date range, a store, a segment)
 * made once for the whole dashboard instead of card by card. A filter is
 * declared like a widget option (same types, same validation, same defaults),
 * and its resolved value reaches every provider that uses it as
 * `ProviderOptions.filters`. The package never decides what a filter means for
 * your data; it validates the chosen values, keeps cached payloads for
 * different choices apart, and reloads only the widgets a change affects.
 *
 * Definitions stay plain JSON: no functions, no regular expressions.
 */

import {
  defaultOptionValue,
  resolveOptionValues,
  type BooleanOption,
  type ChoiceOption,
  type DateRangeOption,
  type NumberOption,
  type OptionContext,
  type OptionValue,
  type OptionValues,
  type TextOption,
} from './options.js';

/**
 * A filter the dashboard offers. The option types that make sense for a whole
 * dashboard: a pick from a list, a number, a switch, a text term or a date
 * range. (`sort`, `columns` and `color` describe one widget, so they aren't
 * filters.)
 */
export type DashboardFilter =
  ChoiceOption | NumberOption | BooleanOption | TextOption | DateRangeOption;

export const DASHBOARD_FILTER_TYPES = [
  'choice',
  'number',
  'boolean',
  'text',
  'dateRange',
] as const;

/** The most filters a dashboard may declare. */
export const MAX_DASHBOARD_FILTERS = 12;

/** What a widget definition says about filters (its `filters` field). */
export interface FilterUse {
  /**
   * Keys of the dashboard filters this widget uses. Absent: all of them.
   * Empty: none.
   */
  readonly filters?: readonly string[];
}

/** The chosen filter values by filter key. */
export type FilterChoices = Readonly<Record<string, unknown>>;

/**
 * The value of every filter: the chosen one when it is valid for that filter,
 * else the default. Keys that aren't declared and values that aren't valid are
 * ignored (never an error), so a saved choice from before a filter changed
 * still loads. Date ranges resolve to an ISO interval.
 */
export function resolveFilterValues(
  filters: readonly DashboardFilter[] | undefined,
  chosen: FilterChoices | undefined,
  context: OptionContext = {}
): OptionValues {
  if (filters === undefined || filters.length === 0) return {};
  return resolveOptionValues({ options: filters }, chosen, context);
}

/** Whether a widget uses the filter with this key. */
export function usesFilter(definition: FilterUse, key: string): boolean {
  return definition.filters === undefined || definition.filters.includes(key);
}

/**
 * The part of the resolved `values` a widget receives: all of them unless its
 * definition lists the filters it uses.
 */
export function filterValuesFor(
  definition: FilterUse,
  values: OptionValues
): OptionValues {
  if (definition.filters === undefined) return values;
  const picked: Record<string, OptionValue> = {};
  for (const key of definition.filters) {
    const value: OptionValue | undefined = values[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

/**
 * Cache key pieces that tell apart the payloads different filter choices
 * produce: the filters the widget uses whose value differs from the default,
 * in key order, as `filter.key=value`. Empty when everything is on its
 * default, so an unfiltered widget keeps its plain key.
 */
export function filterCacheParts(
  definition: FilterUse,
  filters: readonly DashboardFilter[] | undefined,
  values: OptionValues,
  context: OptionContext = {}
): string[] {
  const parts: string[] = [];
  for (const filter of filters ?? []) {
    if (!usesFilter(definition, filter.key)) continue;
    const value: OptionValue | undefined = values[filter.key];
    const fallback: OptionValue | undefined = defaultOptionValue(
      filter,
      context
    );
    if (JSON.stringify(value) === JSON.stringify(fallback)) continue;
    parts.push(
      `filter.${filter.key}=${encodeURIComponent(JSON.stringify(value ?? null))}`
    );
  }
  return parts.sort();
}
