/**
 * Vue 3 renderers for dashboard widgets, over the same core and `styles.css`
 * class names as `./react`. Browser code (DOM types); renders on the server
 * too (no effects needed to show data). Import the optional stylesheet from
 * `@richardmcquiston01/dashboard-widgets-toolkit/styles.css`.
 */

export {
  ResolvedWidgetCard,
  WidgetCard,
  widgetTitle,
  type ResolvedWidgetCardProps,
  type WidgetCardProps,
} from './card.js';
export { CellContent, type CellContentProps } from './cells.js';
export {
  DEFAULT_BUILDER_LABELS,
  WidgetOptionsForm,
  WidgetPreview,
  WidgetViewsForm,
  type BuilderFormProps,
  type BuilderLabels,
  type WidgetPreviewProps,
} from './builder-forms.js';
export {
  useWidgetDraft,
  type DraftLimits,
  type UseWidgetDraftOptions,
  type WidgetDraft,
} from './use-widget-draft.js';
export { InlineConfirm } from './confirm.js';
export {
  downloadExportFile,
  type BinaryExportFile,
  type DetailExportRequest,
  type ExportFile,
  type ExportFormat,
  type TextExportFile,
} from '../react/download.js';
export {
  Dashboard,
  WidgetGrid,
  type DashboardProps,
  type WidgetGridProps,
} from './dashboard.js';
export {
  SERVER_INPUT_DEBOUNCE_MS,
  WidgetDetail,
  WidgetDetailDialog,
  useDetailData,
  type DetailLoader,
  type DetailLoadState,
  type ServerDetailOptions,
  type UseDetailDataResult,
  type WidgetDetailDialogProps,
  type WidgetDetailProps,
} from './detail.js';
export {
  EDIT_MENU_INITIAL_OPEN,
  WidgetEditMenu,
  type EditMenuItem,
  type WidgetEditMenuProps,
} from './edit-menu.js';
export {
  GraphWidget,
  barPath,
  buildChartModel,
  describeChart,
} from './charts.js';
export {
  FilterBar,
  useDashboardFilters,
  type DashboardFilterState,
  type FilterBarProps,
} from './filters.js';
export {
  FreshnessLine,
  RefreshButton,
  type FreshnessLineProps,
} from './freshness.js';
export {
  OptionField,
  WidgetOptionsDialog,
  type OptionFieldProps,
  type WidgetOptionsDialogProps,
} from './options-dialog.js';
export { NewTabIndicator, Thumbnail, WidgetLink } from './primitives.js';
export {
  AlertListWidget,
  BarListWidget,
  GaugeWidget,
  KpiWidget,
  TableWidget,
  TextWidget,
  WidgetContent,
} from './renderers.js';
export {
  DEFAULT_LABELS,
  WidgetSettingsProvider,
  joinClassNames,
  resolveSettings,
  useSlotClassName,
  useWidgetSettings,
  type CellFormatter,
  type CellFormatterInput,
  type CellFormatterProblem,
  type DashboardClassNames,
  type DashboardClassSlot,
  type DashboardLabels,
  type ResolvedSettings,
  type WidgetSettings,
} from './settings.js';
export { WidgetTheme, type WidgetThemeProps } from './theme.js';
export {
  DRAG_START_DISTANCE_PX,
  usePointerReorder,
  type PointerDragState,
  type PointerHandleProps,
  type TabDropStatus,
  type UsePointerReorderOptions,
  type UsePointerReorderResult,
} from './use-reorder.js';
export {
  usePageSwipe,
  type PageSwipeProps,
  type UsePageSwipeOptions,
} from './use-page-swipe.js';
export {
  useStoredLayout,
  type StoredLayoutConflict,
  type StoredLayoutStatus,
  type UseStoredLayoutOptions,
  type UseStoredLayoutResult,
} from './use-stored-layout.js';
export {
  useWidgets,
  type UseWidgetsOptions,
  type UseWidgetsResult,
} from './use-widgets.js';
