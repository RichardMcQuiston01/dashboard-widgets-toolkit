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
  GraphWidget,
  barPath,
  buildChartModel,
  describeChart,
} from './charts.js';
export {
  FreshnessLine,
  RefreshButton,
  type FreshnessLineProps,
} from './freshness.js';
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
  useWidgets,
  type UseWidgetsOptions,
  type UseWidgetsResult,
} from './use-widgets.js';
