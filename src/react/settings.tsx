import { createContext, useContext, type ReactNode } from 'react';

import type { Locale } from '../core/format.js';

/** Every element that carries a stable `dwt-*` class, for `classNames`. */
export type DashboardClassSlot =
  | 'dashboard'
  | 'hiddenBar'
  | 'grid'
  | 'card'
  | 'cardHeader'
  | 'cardTitle'
  | 'cardDescription'
  | 'cardActions'
  | 'cardBody'
  | 'cardFooter'
  | 'button'
  | 'status'
  | 'empty'
  | 'error'
  | 'text'
  | 'kpi'
  | 'gauge'
  | 'table'
  | 'barList'
  | 'alertList'
  | 'chart'
  | 'legend'
  | 'tooltip'
  | 'tableTwin';

/**
 * Extra classes per slot, appended to the `dwt-*` class (never replacing
 * it), e.g. `{ card: 'rounded-lg shadow-sm' }` for Tailwind.
 */
export type DashboardClassNames = Partial<Record<DashboardClassSlot, string>>;

/** Interface text, overridable for other languages or house style. */
export interface DashboardLabels {
  readonly loading: string;
  readonly retry: string;
  readonly viewAsTable: string;
  readonly hide: (title: string) => string;
  readonly show: (title: string) => string;
  readonly minimize: (title: string) => string;
  readonly expand: (title: string) => string;
  readonly moveEarlier: (title: string) => string;
  readonly moveLater: (title: string) => string;
  readonly hiddenWidgets: string;
  readonly allHidden: string;
  readonly noWidgets: string;
  readonly andMore: (count: number) => string;
  /** The comparison in KPI deltas, e.g. "previous period". */
  readonly comparison: string;
}

export const DEFAULT_LABELS: DashboardLabels = {
  loading: 'Loading…',
  retry: 'Retry',
  viewAsTable: 'View as table',
  hide: (title) => `Hide ${title}`,
  show: (title) => `Show ${title}`,
  minimize: (title) => `Minimise ${title}`,
  expand: (title) => `Expand ${title}`,
  moveEarlier: (title) => `Move ${title} earlier`,
  moveLater: (title) => `Move ${title} later`,
  hiddenWidgets: 'Hidden:',
  allHidden: 'Every widget is hidden. Show one from the list above.',
  noWidgets: 'No widgets to show.',
  andMore: (count) => `and ${count} more`,
  comparison: 'previous period',
};

export interface WidgetSettings {
  /** BCP 47 locale for numbers; undefined uses the runtime default. */
  readonly locale?: Locale;
  /** e.g. "_blank". Links always get rel="noreferrer". */
  readonly linkTarget?: string;
  readonly classNames?: DashboardClassNames;
  readonly labels?: Partial<DashboardLabels>;
}

interface ResolvedSettings {
  readonly locale: Locale;
  readonly linkTarget: string | undefined;
  readonly classNames: DashboardClassNames;
  readonly labels: DashboardLabels;
}

const SettingsContext = createContext<ResolvedSettings>({
  locale: undefined,
  linkTarget: undefined,
  classNames: {},
  labels: DEFAULT_LABELS,
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
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useWidgetSettings(): ResolvedSettings {
  return useContext(SettingsContext);
}

/** Joins class names, skipping empty ones. */
export function joinClassNames(
  ...names: readonly (string | false | null | undefined)[]
): string {
  return names
    .filter((name) => typeof name === 'string' && name !== '')
    .join(' ');
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
