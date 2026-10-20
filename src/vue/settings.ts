import {
  computed,
  defineComponent,
  inject,
  provide,
  type ComputedRef,
  type InjectionKey,
  type VNodeChild,
} from 'vue';

import type { Locale } from '../core/format.js';
import {
  DEFAULT_LABELS,
  joinClassNames,
  type DashboardClassNames,
  type DashboardClassSlot,
  type DashboardLabels,
} from '../core/labels.js';
import type { TableCell } from '../core/payload.js';

export { DEFAULT_LABELS, joinClassNames };
export type { DashboardClassNames, DashboardClassSlot, DashboardLabels };

/** What a `custom` column's formatter is given for one cell. */
export interface CellFormatterInput {
  /** The widget the table belongs to; empty outside a `Dashboard`. */
  readonly widgetKey: string;
  /** `c0`, `c1`, ... (the column's place), as sort and filter use. */
  readonly columnKey: string;
  /** The cell's text. */
  readonly text: string;
  /** The cell's `value`, if any. */
  readonly value: string | number | undefined;
  /** Every cell of the row. */
  readonly row: readonly TableCell[];
}

/**
 * Draws a `custom` column's cell. Display only: sorting, search and the
 * "View as table" twin keep using the cell's `text` and `value`. Strings it
 * returns are escaped by Vue like any other.
 */
export type CellFormatter = (input: CellFormatterInput) => VNodeChild;

/** A formatter that was missing or failed; the cell showed its text. */
export interface CellFormatterProblem {
  readonly widgetKey: string;
  readonly columnKey: string;
  readonly formatter: string;
  /** Names the widget, column and formatter, and what went wrong. */
  readonly message: string;
}

export interface WidgetSettings {
  /** BCP 47 locale for numbers; undefined uses the runtime default. */
  readonly locale?: Locale | undefined;
  /** e.g. "_blank". Links always get rel="noreferrer". */
  readonly linkTarget?: string | undefined;
  readonly classNames?: DashboardClassNames | undefined;
  readonly labels?: Partial<DashboardLabels> | undefined;
  /**
   * Formatters for `custom` table columns, by the name a column's `formatter`
   * gives. Keep the object stable (a module constant).
   */
  readonly formatters?: Readonly<Record<string, CellFormatter>> | undefined;
  /**
   * Called when a `custom` column names a formatter that isn't registered, or
   * one that throws. The cell shows its text either way.
   */
  readonly onFormatterError?:
    ((problem: CellFormatterProblem) => void) | undefined;
}

export interface ResolvedSettings {
  readonly locale: Locale;
  readonly linkTarget: string | undefined;
  readonly classNames: DashboardClassNames;
  readonly labels: DashboardLabels;
  readonly formatters: Readonly<Record<string, CellFormatter>>;
  readonly onFormatterError: WidgetSettings['onFormatterError'];
}

const DEFAULT_SETTINGS: ResolvedSettings = {
  locale: undefined,
  linkTarget: undefined,
  classNames: {},
  labels: DEFAULT_LABELS,
  formatters: {},
  onFormatterError: undefined,
};

const SETTINGS_KEY: InjectionKey<ComputedRef<ResolvedSettings>> =
  Symbol('dwt-settings');

/** Resolves the settings a provider was given over the defaults. */
export function resolveSettings(settings: WidgetSettings): ResolvedSettings {
  return {
    locale: settings.locale,
    linkTarget: settings.linkTarget,
    classNames: settings.classNames ?? {},
    labels: { ...DEFAULT_LABELS, ...settings.labels },
    formatters: settings.formatters ?? {},
    onFormatterError: settings.onFormatterError,
  };
}

/**
 * Sets locale, link target, extra classes and labels for widgets inside it:
 * `<WidgetSettingsProvider :locale="'de'" :labels="...">...</...>`. It renders
 * its default slot and nothing else.
 */
export const WidgetSettingsProvider = defineComponent(
  (props: WidgetSettings, { slots }) => {
    provide(
      SETTINGS_KEY,
      computed(() => resolveSettings(props))
    );
    return () => slots['default']?.();
  },
  {
    name: 'WidgetSettingsProvider',
    props: [
      'locale',
      'linkTarget',
      'classNames',
      'labels',
      'formatters',
      'onFormatterError',
    ],
  }
);

/**
 * The settings in effect, as a ref to read inside a render function (a
 * provider's props may change). Outside a provider they are the defaults.
 */
export function useWidgetSettings(): ComputedRef<ResolvedSettings> {
  return (
    inject(SETTINGS_KEY, null) ??
    computed((): ResolvedSettings => DEFAULT_SETTINGS)
  );
}

/** `dwt-<base>` plus any extra classes for that slot. Call it while rendering. */
export function useSlotClassName(): (
  slot: DashboardClassSlot,
  base: string,
  ...extra: readonly (string | false | null | undefined)[]
) => string {
  const settings: ComputedRef<ResolvedSettings> = useWidgetSettings();
  return (slot, base, ...extra) =>
    joinClassNames(base, ...extra, settings.value.classNames[slot]);
}
