import {
  computed,
  defineComponent,
  h,
  ref,
  toValue,
  useId,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  type VNode,
} from 'vue';

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
  readonly className?: string | undefined;
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
export const FilterBar = defineComponent(
  (props: FilterBarProps) => {
    const settings = useWidgetSettings();
    const slot = useSlotClassName();
    const baseId: string = useId();
    return (): VNode | null => {
      const { filters, values, onChange } = props;
      if (filters.length === 0) return null;
      const changed: boolean = anyChanged(filters, values);
      return h(
        'form',
        {
          role: 'group',
          'aria-label': settings.value.labels.filters,
          class: slot('filters', 'dwt-filters', props.className),
          onSubmit: (event: Event) => event.preventDefault(),
        },
        [
          ...filters.map((filter) =>
            h(OptionField, {
              key: filter.key,
              option: filter,
              value: shownValue(filter, values),
              id: `${baseId}-${filter.key}`,
              onChange: (value: OptionValue) =>
                onChange({ ...values, [filter.key]: value }),
            })
          ),
          h(
            'button',
            {
              type: 'button',
              class: slot('button', 'dwt-button', 'dwt-filters-reset'),
              disabled: !changed,
              onClick: () => onChange({}),
            },
            settings.value.labels.filtersReset
          ),
        ]
      );
    };
  },
  { name: 'FilterBar', props: ['filters', 'values', 'onChange', 'className'] }
);

export interface DashboardFilterState {
  /** The chosen values, by filter key. Pass to `FilterBar` / `Dashboard`. */
  readonly values: Ref<FilterChoices>;
  /** The resolved values (date ranges as intervals) every provider will see. */
  readonly resolved: ComputedRef<OptionValues>;
  /** Replaces all the chosen values. */
  readonly setValues: (values: FilterChoices) => void;
  /** Chooses one filter's value. */
  readonly setFilter: (key: string, value: unknown) => void;
  /** Puts every filter back to its default. */
  readonly reset: () => void;
}

/**
 * Keeps the dashboard's filter choices in a ref. Pass `values` to `useWidgets`
 * (as `filterValues`) and to `Dashboard`, and `setValues` as `onFilterChange`.
 * `initial` seeds the choices (for example from the URL). Prefer your own
 * state if the choices should live in the URL or in storage; `useWidgets` and
 * `Dashboard` only need the values and the change callback.
 */
export function useDashboardFilters(
  filters: MaybeRefOrGetter<readonly DashboardFilter[]>,
  initial: FilterChoices = {}
): DashboardFilterState {
  const values: Ref<FilterChoices> = ref(initial);
  const resolved: ComputedRef<OptionValues> = computed(() =>
    resolveFilterValues(toValue(filters), values.value)
  );
  function setValues(next: FilterChoices): void {
    values.value = next;
  }
  function setFilter(key: string, value: unknown): void {
    values.value = { ...values.value, [key]: value };
  }
  function reset(): void {
    values.value = {};
  }
  return { values, resolved, setValues, setFilter, reset };
}
