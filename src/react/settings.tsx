import { createContext, useContext, type ReactNode } from 'react';

import type { Locale } from '../core/format.js';
import {
  DEFAULT_LABELS,
  joinClassNames,
  type DashboardClassNames,
  type DashboardClassSlot,
  type DashboardLabels,
} from '../core/labels.js';
import type { TableCell } from '../core/payload.js';

export {
  DEFAULT_LABELS,
  joinClassNames,
  type DashboardClassNames,
  type DashboardClassSlot,
  type DashboardLabels,
};

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
 * returns are escaped by React like any other.
 */
export type CellFormatter = (input: CellFormatterInput) => ReactNode;

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
  readonly locale?: Locale;
  /** e.g. "_blank". Links always get rel="noreferrer". */
  readonly linkTarget?: string;
  readonly classNames?: DashboardClassNames;
  readonly labels?: Partial<DashboardLabels>;
  /**
   * Formatters for `custom` table columns, by the name a column's `formatter`
   * gives. Keep the object stable (a module constant or `useMemo`).
   */
  readonly formatters?: Readonly<Record<string, CellFormatter>>;
  /**
   * Called (in an effect, never while rendering) when a `custom` column names
   * a formatter that isn't registered, or one that throws. The cell shows its
   * text either way.
   */
  readonly onFormatterError?: (problem: CellFormatterProblem) => void;
}

interface ResolvedSettings {
  readonly locale: Locale;
  readonly linkTarget: string | undefined;
  readonly classNames: DashboardClassNames;
  readonly labels: DashboardLabels;
  readonly formatters: Readonly<Record<string, CellFormatter>>;
  readonly onFormatterError: WidgetSettings['onFormatterError'];
}

const SettingsContext = createContext<ResolvedSettings>({
  locale: undefined,
  linkTarget: undefined,
  classNames: {},
  labels: DEFAULT_LABELS,
  formatters: {},
  onFormatterError: undefined,
});

/** Sets locale, link target, extra classes and labels for widgets inside it. */
export function WidgetSettingsProvider({
  children,
  ...settings
}: WidgetSettings & { readonly children?: ReactNode }): ReactNode {
  return (
    <SettingsContext.Provider
      value={{
        locale: settings.locale,
        linkTarget: settings.linkTarget,
        classNames: settings.classNames ?? {},
        labels: { ...DEFAULT_LABELS, ...settings.labels },
        formatters: settings.formatters ?? {},
        onFormatterError: settings.onFormatterError,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useWidgetSettings(): ResolvedSettings {
  return useContext(SettingsContext);
}

/** `dwt-<base>` plus any extra classes for that slot. */
export function useSlotClassName(): (
  slot: DashboardClassSlot,
  base: string,
  ...extra: readonly (string | false | null | undefined)[]
) => string {
  const { classNames } = useWidgetSettings();
  return (slot, base, ...extra) =>
    joinClassNames(base, ...extra, classNames[slot]);
}
