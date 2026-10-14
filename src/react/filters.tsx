import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';

import {
  resolveFilterValues,
  type DashboardFilter,
  type FilterChoices,
} from '../core/filters.js';
import {
  coerceOptionValue,
  defaultOptionValue,
  type OptionValue,
  type OptionValues,
} from '../core/options.js';
import { OptionField } from './options-dialog.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface FilterBarProps {
  /** The filters to offer. */
  readonly filters: readonly DashboardFilter[];
  /**
   * The values chosen so far, by filter key. A filter with no valid value
   * shows its default.
   */
  readonly values: FilterChoices;
  /** Called with all the chosen values after the viewer changes one. */
  readonly onChange: (values: Record<string, unknown>) => void;
  readonly className?: string;
}

/** The value to show for a filter: the chosen one if valid, else undefined. */
function shownValue(
  filter: DashboardFilter,
  values: FilterChoices
): OptionValue | undefined {
  const chosen: unknown = values[filter.key];
  if (chosen === undefined) return undefined;
  // A date range is shown as the preset or interval chosen, not the interval
  // it resolves to.
  return coerceOptionValue(filter, chosen) === undefined
    ? undefined
    : (chosen as OptionValue);
}

/** Whether any filter is on a value other than its default. */
function anyChanged(
  filters: readonly DashboardFilter[],
  values: FilterChoices
): boolean {
  return filters.some((filter) => {
    const shown: OptionValue | undefined = shownValue(filter, values);
    if (shown === undefined) return false;
    const resolved: OptionValue | undefined = coerceOptionValue(filter, shown);
    return (
      JSON.stringify(resolved) !==
      JSON.stringify(defaultOptionValue(filter) ?? null)
    );
  });
}

/**
 * The dashboard's filter bar: one control per filter (the same controls as a
 * widget's Options dialog) and a button that puts them all back to their
 * defaults. It is controlled: keep the values in state (`useDashboardFilters`),
 * the URL or storage, and pass them back. `Dashboard` renders it for you when
 * you give it `filters`, `filterValues` and `onFilterChange`.
 */
export function FilterBar({
  filters,
  values,
  onChange,
  className,
}: FilterBarProps): ReactNode {
  const { labels } = useWidgetSettings();
  const slot = useSlotClassName();
  const baseId: string = useId();
  if (filters.length === 0) return null;
  const changed: boolean = anyChanged(filters, values);
  return (
    <form
      role="group"
      aria-label={labels.filters}
      className={slot('filters', 'dwt-filters', className)}
      onSubmit={(event) => event.preventDefault()}
    >
      {filters.map((filter) => (
        <OptionField
          key={filter.key}
          option={filter}
          value={shownValue(filter, values)}
          id={`${baseId}-${filter.key}`}
          onChange={(value) => onChange({ ...values, [filter.key]: value })}
        />
      ))}
      <button
        type="button"
        className={slot('button', 'dwt-button', 'dwt-filters-reset')}
        disabled={!changed}
        onClick={() => onChange({})}
      >
        {labels.filtersReset}
      </button>
    </form>
  );
}

export interface DashboardFilterState {
  /** The chosen values, by filter key. Pass to `FilterBar` / `Dashboard`. */
  readonly values: FilterChoices;
  /** The resolved values (date ranges as intervals) every provider will see. */
  readonly resolved: OptionValues;
  /** Replaces all the chosen values. */
  readonly setValues: (values: FilterChoices) => void;
  /** Chooses one filter's value. */
  readonly setFilter: (key: string, value: unknown) => void;
  /** Puts every filter back to its default. */
  readonly reset: () => void;
}

/**
 * Keeps the dashboard's filter choices in state. Pass `values` to
 * `useWidgets` (as `filterValues`) and to `Dashboard`, and `setValues` as
 * `onFilterChange`. `initial` seeds the choices (for example from the URL).
 * Prefer your own state if the choices should live in the URL or in storage;
 * `useWidgets` and `Dashboard` only need the values and the change callback.
 */
export function useDashboardFilters(
  filters: readonly DashboardFilter[],
  initial: FilterChoices = {}
): DashboardFilterState {
  const [values, setValues] = useState<FilterChoices>(initial);
  const resolved: OptionValues = useMemo(
    () => resolveFilterValues(filters, values),
    [filters, values]
  );
  const setFilter = useCallback((key: string, value: unknown): void => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);
  const reset = useCallback((): void => setValues({}), []);
  return { values, resolved, setValues, setFilter, reset };
}
