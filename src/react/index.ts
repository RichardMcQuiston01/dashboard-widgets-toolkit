/**
 * React renderers for dashboard widgets. Browser code (DOM types); renders
 * on the server too (no effects needed to show data). Import the optional
 * stylesheet from `@richardmcquiston01/dashboard-widgets-toolkit/styles.css`.
 */

export {
  ResolvedWidgetCard,
  WidgetCard,
  widgetTitle,
  type ResolvedWidgetCardProps,
  type WidgetCardProps,
} from './card.js';
export {
  GraphWidget,
  barPath,
  buildChartModel,
  describeChart,
} from './charts.js';
export {
  Dashboard,
  WidgetGrid,
  type DashboardProps,
  type WidgetGridProps,
} from './dashboard.js';
export {
  WidgetDetail,
  WidgetDetailDialog,
  useDetailData,
  type DetailLoadState,
  type DetailLoader,
  type WidgetDetailDialogProps,
  type WidgetDetailProps,
} from './detail.js';
export { DEFAULT_SERIES_COLORS, seriesColor } from './palette.js';
export { Thumbnail, WidgetLink } from './primitives.js';
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
  useWidgets,
  type UseWidgetsOptions,
  type UseWidgetsResult,
} from './use-widgets.js';
export {
  DEFAULT_LABELS,
  WidgetSettingsProvider,
  joinClassNames,
  useWidgetSettings,
  type DashboardClassNames,
  type DashboardClassSlot,
  type DashboardLabels,
  type WidgetSettings,
} from './settings.js';
