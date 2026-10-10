import { createContext, useContext, type ReactNode } from 'react';

import type { Locale } from '../core/format.js';

/** Every element that carries a stable `dwt-*` class, for `classNames`. */
export type DashboardClassSlot =
  | 'dashboard'
  | 'hiddenBar'
  | 'toolbar'
  | 'pageBar'
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
  | 'tableTwin'
  | 'detail';

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
  readonly minimizedWidgets: string;
  /** Edit mode toolbar (`editMode="toggle"`). */
  readonly customize: string;
  readonly done: string;
  readonly reset: string;
  readonly revertChanges: string;
  readonly confirmReset: string;
  readonly confirmRevert: string;
  /** Accessible names of the inline "✓" and "X" confirmation buttons. */
  readonly confirmYes: string;
  readonly confirmNo: string;
  /** Announced when edit mode starts and ends. */
  readonly editingOn: string;
  readonly editingOff: string;
  /** Names the toolbar group for assistive technology. */
  readonly dashboardControls: string;
  /** The lock icon on a locked card, e.g. "Revenue is locked". */
  readonly locked: (title: string) => string;
  /** The lock icon on a card shown to an administrator (`overrideLocks`). */
  readonly lockedForViewers: (title: string) => string;
  /** Pages: names the tab list, and each tab ("Page 2 of 3: Sales"). */
  readonly pageBar: string;
  readonly pageTabName: (index: number, count: number, title: string) => string;
  readonly previousPageButton: string;
  readonly nextPageButton: string;
  /** Page management while editing. */
  readonly managePages: string;
  readonly addPage: string;
  readonly renamePage: (title: string) => string;
  readonly pageTitle: string;
  readonly savePageTitle: string;
  readonly cancelPageTitle: string;
  readonly deletePage: (title: string) => string;
  readonly confirmDeletePage: (title: string) => string;
  readonly movePageLeft: (title: string) => string;
  readonly movePageRight: (title: string) => string;
  /** The icon on each card, while editing, that opens its menu of moves. */
  readonly arrangeWidget: (title: string) => string;
  /** Short text of the menu's items (the full names are `moveEarlier` and so on). */
  readonly menuMoveEarlier: string;
  readonly menuMoveLater: string;
  readonly menuHide: string;
  /** The card menu's heading over the pages a widget can move to. */
  readonly moveToPage: (title: string) => string;
  readonly moveToPagePlaceholder: string;
  readonly moveToPageOption: (title: string, rowsFree: number) => string;
  readonly newPageOption: string;
  readonly movedToPage: (title: string, pageTitle: string) => string;
  readonly pageFull: (pageTitle: string, maxRows: number) => string;
  readonly emptyPage: string;
  /** Added to the accessible name of links that open in a new tab. */
  readonly opensInNewTab: string;
  /** The card's View button, opening the detail view. */
  readonly view: (title: string) => string;
  readonly close: string;
  readonly search: string;
  readonly filterBy: (column: string) => string;
  readonly sortBy: (column: string) => string;
  readonly noResults: string;
  /** e.g. "Showing 1–25 of 312 results". */
  readonly showingRows: (from: number, to: number, total: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly pageOf: (page: number, pageCount: number) => string;
  readonly pagination: string;
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
  minimize: (title) => `Minimize ${title}`,
  expand: (title) => `Expand ${title}`,
  moveEarlier: (title) => `Move ${title} earlier`,
  moveLater: (title) => `Move ${title} later`,
  hiddenWidgets: 'Hidden:',
  minimizedWidgets: 'Minimized:',
  customize: 'Customize',
  done: 'Done',
  reset: 'Reset layout',
  revertChanges: 'Revert changes',
  confirmReset: 'Reset the layout to the default?',
  confirmRevert: 'Revert to how this looked before you started editing?',
  confirmYes: 'Yes',
  confirmNo: 'No',
  editingOn:
    'Editing dashboard. Use the buttons on each card to reorder or hide it.',
  editingOff: 'Finished editing.',
  dashboardControls: 'Dashboard controls',
  locked: (title) => `${title} is locked`,
  lockedForViewers: (title) => `${title} is locked for viewers`,
  pageBar: 'Pages',
  pageTabName: (index, count, title) => `Page ${index} of ${count}: ${title}`,
  previousPageButton: 'Previous page',
  nextPageButton: 'Next page',
  managePages: 'Manage pages',
  addPage: 'Add page',
  renamePage: (title) => `Rename ${title}`,
  pageTitle: 'Page title',
  savePageTitle: 'Save page title',
  cancelPageTitle: 'Cancel renaming',
  deletePage: (title) => `Delete ${title}`,
  confirmDeletePage: (title) =>
    `Delete the page "${title}" and move its widgets to another page?`,
  movePageLeft: (title) => `Move ${title} page left`,
  movePageRight: (title) => `Move ${title} page right`,
  arrangeWidget: (title) => `Arrange ${title}`,
  menuMoveEarlier: 'Move earlier',
  menuMoveLater: 'Move later',
  menuHide: 'Hide',
  moveToPage: (title) => `Move ${title} to another page`,
  moveToPagePlaceholder: 'Move to page…',
  moveToPageOption: (title, rowsFree) =>
    `${title} (${rowsFree} ${rowsFree === 1 ? 'row' : 'rows'} free)`,
  newPageOption: 'New page…',
  movedToPage: (title, pageTitle) => `${title} moved to ${pageTitle}`,
  pageFull: (pageTitle, maxRows) =>
    `Page "${pageTitle}" is full (${maxRows} rows). Move or hide a widget first.`,
  emptyPage: 'This page has no widgets. Move one here from another page.',
  opensInNewTab: '(opens in a new tab)',
  view: (title) => `View ${title}`,
  close: 'Close',
  search: 'Search',
  filterBy: (column) => `Filter ${column}`,
  sortBy: (column) => `Sort by ${column}`,
  noResults: 'No matching results.',
  showingRows: (from, to, total) => `Showing ${from}–${to} of ${total} results`,
  previousPage: 'Previous',
  nextPage: 'Next',
  pageOf: (page, pageCount) => `Page ${page} of ${pageCount}`,
  pagination: 'Pagination',
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
