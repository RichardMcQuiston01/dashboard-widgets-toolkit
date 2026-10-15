import { createContext, useContext, type ReactNode } from 'react';

import type { Locale } from '../core/format.js';
import type { TableCell } from '../core/payload.js';

/** Every element that carries a stable `dwt-*` class, for `classNames`. */
export type DashboardClassSlot =
  | 'dashboard'
  | 'hiddenBar'
  | 'toolbar'
  | 'filters'
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
  | 'detail'
  | 'dialog';

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
  /** Names the dashboard filter bar for assistive technology. */
  readonly filters: string;
  /** The button that puts every dashboard filter back to its default. */
  readonly filtersReset: string;
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
  /** The card menu's item that opens the Options dialog. */
  readonly menuOptions: string;
  /** Arrange menu item that makes a clone of the widget. */
  readonly menuDuplicate: string;
  readonly duplicate: (title: string) => string;
  /** Accessible name of Duplicate when the page has no room; `reason` says why. */
  readonly duplicateBlocked: (title: string, reason: string) => string;
  readonly duplicated: (title: string) => string;
  /** Options dialog button that deletes a clone. */
  readonly optionsDelete: string;
  readonly confirmDelete: string;
  readonly deleted: (title: string) => string;
  /** Drag handle button (needs `draggable` on Dashboard): "Reorder Revenue". */
  readonly dragHandle: (title: string) => string;
  /** Announced when a keyboard or pointer drag picks a card up. */
  readonly pickedUp: (title: string, position: number, total: number) => string;
  /** Announced after each keyboard step. */
  readonly movedTo: (title: string, position: number, total: number) => string;
  /** Announced after a drop. */
  readonly dropped: (title: string, position: number, total: number) => string;
  readonly dragCancelled: (title: string) => string;
  /** The title suggested for a clone shown with another view. */
  readonly suggestedViewTitle: (title: string, viewLabel: string) => string;
  /** The Options dialog: heading, fields and buttons. */
  readonly optionsFor: (title: string) => string;
  readonly optionsTitleField: string;
  readonly titleInUse: string;
  readonly optionsWidthField: string;
  readonly widthDefault: string;
  /** e.g. "6 of 12 (1/2)". */
  readonly widthOption: (width: number, share: string) => string;
  readonly optionsFlexible: string;
  /** Label of the View field in the Options dialog. */
  readonly optionsViewField: string;
  /** A view's name when it is the one shown until the viewer picks, e.g. "Table (default)". */
  readonly viewDefault: (viewLabel: string) => string;
  readonly optionsDeclared: string;
  readonly apply: string;
  readonly cancel: string;
  readonly resetToDefaults: string;
  readonly revertToBeforeEditing: string;
  readonly confirmApply: string;
  readonly confirmDiscard: string;
  readonly confirmResetOptions: string;
  readonly confirmRevertOptions: string;
  /** Announced after Apply, Reset or Revert. */
  readonly optionsSaved: (title: string) => string;
  readonly sortDefault: string;
  readonly sortAscending: string;
  readonly sortDescending: string;
  readonly moveColumnUp: (column: string) => string;
  readonly moveColumnDown: (column: string) => string;
  readonly customRange: (value: string) => string;
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
  /** Added to a chart's description when its positions are selectable (`onSelect`). */
  readonly chartSelectHint: string;
  /** The card's View button, opening the detail view. */
  readonly view: (title: string) => string;
  /** The card's Download CSV button (`exportFormats`). */
  readonly downloadCsv: (title: string) => string;
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
  filters: 'Filters',
  filtersReset: 'Reset filters',
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
  menuOptions: 'Options…',
  menuDuplicate: 'Duplicate',
  duplicate: (title) => `Duplicate ${title}`,
  duplicateBlocked: (title, reason) =>
    `Duplicate ${title} (unavailable: ${reason})`,
  duplicated: (title) => `Duplicated ${title}`,
  optionsDelete: 'Delete this widget',
  confirmDelete: 'Delete this widget? Its settings are lost.',
  deleted: (title) => `Deleted ${title}`,
  dragHandle: (title) => `Reorder ${title}`,
  pickedUp: (title, position, total) =>
    `Picked up ${title}, position ${position} of ${total}. Arrow keys move it, Space drops it, Escape cancels.`,
  movedTo: (title, position, total) =>
    `${title} moved to position ${position} of ${total}`,
  dropped: (title, position, total) =>
    `Dropped ${title} at position ${position} of ${total}`,
  dragCancelled: (title) => `Reordering ${title} cancelled`,
  suggestedViewTitle: (title, viewLabel) => `${title} ${viewLabel}`,
  optionsFor: (title) => `Options for ${title}`,
  optionsTitleField: 'Title',
  titleInUse: 'Another widget already uses this title.',
  optionsWidthField: 'Width',
  widthDefault: 'Default',
  widthOption: (width, share) => `${width} of 12 (${share})`,
  optionsFlexible: 'Grow to fill empty space in the row',
  optionsViewField: 'View',
  viewDefault: (viewLabel) => `${viewLabel} (default)`,
  optionsDeclared: 'Data',
  apply: 'Apply',
  cancel: 'Cancel',
  resetToDefaults: 'Reset to defaults',
  revertToBeforeEditing: 'Revert to before editing',
  confirmApply: 'Apply these changes?',
  confirmDiscard: 'Discard your changes?',
  confirmResetOptions: 'Reset these options to their defaults?',
  confirmRevertOptions:
    'Revert these options to how they were before you started editing?',
  optionsSaved: (title) => `Options saved for ${title}`,
  sortDefault: 'Default order',
  sortAscending: 'Ascending',
  sortDescending: 'Descending',
  moveColumnUp: (column) => `Move ${column} up`,
  moveColumnDown: (column) => `Move ${column} down`,
  customRange: (value) => `Custom: ${value}`,
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
  chartSelectHint: 'Press Enter to select the highlighted position.',
  view: (title) => `View ${title}`,
  downloadCsv: (title) => `Download ${title} as CSV`,
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
