/**
 * Widget data payloads, one shape per kind, discriminated by `kind`.
 *
 * The kind names are upper case to stay compatible with Maker Toolkit's
 * `WidgetViewType` (`TEXT`, `GAUGE`, `TABLE`, `GRAPH`). `KPI`, `BAR_LIST`
 * and `ALERT_LIST` are new. Every payload is plain JSON: strings, finite
 * numbers, booleans, null, arrays and objects. No dates (send ISO strings),
 * no functions, no class instances.
 */

/** Every widget kind, in a stable order. */
export const WIDGET_KINDS = [
  'TEXT',
  'KPI',
  'GAUGE',
  'TABLE',
  'BAR_LIST',
  'ALERT_LIST',
  'GRAPH',
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number];

export function isWidgetKind(value: unknown): value is WidgetKind {
  return (
    typeof value === 'string' &&
    (WIDGET_KINDS as readonly string[]).includes(value)
  );
}

/** How a number is shown: a plain count, money, or a fraction as a percent. */
export const VALUE_FORMATS = ['number', 'currency', 'percent'] as const;

export type ValueFormat = (typeof VALUE_FORMATS)[number];

/** A single headline value as text, e.g. "12" or "Open". */
export interface TextWidgetData {
  readonly kind: 'TEXT';
  readonly value: string;
  readonly label: string;
}

/**
 * A stat tile: one number, optionally compared with the previous period.
 *
 * `value` and `previous` are in major units for `currency` (12.5 is $12.50)
 * and fractions for `percent` (0.25 is 25%).
 */
export interface KpiWidgetData {
  readonly kind: 'KPI';
  readonly value: number;
  /** The same measure for the previous period; null or absent for none. */
  readonly previous?: number | null;
  readonly format: ValueFormat;
  /** ISO 4217 code for `currency`, e.g. "USD". Defaults to USD. */
  readonly currency?: string;
  readonly label: string;
  /** Short context under the value, e.g. "Incl. shipping and tax". */
  readonly hint?: string;
  /** Whether a rise is good news (default true). Colors the change. */
  readonly higherIsBetter?: boolean;
}

/** A value against a maximum, drawn as a meter. */
export interface GaugeWidgetData {
  readonly kind: 'GAUGE';
  readonly value: number;
  readonly max: number;
  readonly label: string;
}

export interface TableColumn {
  readonly label: string;
  /** Right-aligned, tabular figures. */
  readonly numeric?: boolean;
}

export interface TableCell {
  readonly text: string;
  /** Renders the cell as a link (http, https, mailto or relative only). */
  readonly href?: string;
}

export interface TableWidgetData {
  readonly kind: 'TABLE';
  readonly columns: readonly TableColumn[];
  /** One array of cells per row, each as long as `columns`. */
  readonly rows: readonly (readonly TableCell[])[];
  /** A note under the table, e.g. "and 12 more". */
  readonly footer?: string;
}

export interface BarListItem {
  readonly label: string;
  readonly value: number;
  /** Text shown beside the bar; defaults to the formatted value. */
  readonly display?: string;
}

/**
 * Labelled horizontal bars, e.g. ratings or purchases by country. Bars are a
 * share of `total` when it is given, otherwise of the largest value.
 */
export interface BarListWidgetData {
  readonly kind: 'BAR_LIST';
  readonly items: readonly BarListItem[];
  readonly total?: number;
}

export interface AlertListItem {
  readonly title: string;
  /** Renders the title as a link (http, https, mailto or relative only). */
  readonly href?: string;
  /** A small square image (http, https or relative only). */
  readonly thumbnailUrl?: string;
  /** The short figure on the right, e.g. "2 left" or "31 views". */
  readonly valueLabel: string;
  /** A secondary line under the title. */
  readonly detail?: string;
}

/**
 * Things that need attention (low stock, stale listings...). `items` may be
 * the first few of `total`; the renderer says "and N more".
 */
export interface AlertListWidgetData {
  readonly kind: 'ALERT_LIST';
  readonly items: readonly AlertListItem[];
  readonly total: number;
  /** Shown when there is nothing to flag, e.g. "Nothing low on stock." */
  readonly emptyText: string;
}

export interface GraphPoint {
  /** The category or date label on the x axis, e.g. "Oct 2026". */
  readonly label: string;
  readonly value: number;
}

export interface GraphSeries {
  readonly name: string;
  readonly points: readonly GraphPoint[];
}

/** The most series a graph may carry: the categorical palette's eight slots. */
export const MAX_GRAPH_SERIES = 8;

/**
 * A bar (grouped for several series) or line chart. All series share the
 * x labels of the first series, by position, and one y axis.
 */
export interface GraphWidgetData {
  readonly kind: 'GRAPH';
  readonly series: readonly GraphSeries[];
  readonly chartType: 'bar' | 'line';
  readonly valueFormat: ValueFormat;
  /** ISO 4217 code for `currency`. Defaults to USD. */
  readonly currency?: string;
  /** Heading for the label column in the table view, e.g. "Month". */
  readonly xLabel?: string;
}

/** Any widget's data, discriminated by `kind`. */
export type WidgetData =
  | TextWidgetData
  | KpiWidgetData
  | GaugeWidgetData
  | TableWidgetData
  | BarListWidgetData
  | AlertListWidgetData
  | GraphWidgetData;

/** The payload type for one kind, e.g. `WidgetDataOf<'KPI'>`. */
export type WidgetDataOf<K extends WidgetKind> = Extract<
  WidgetData,
  { kind: K }
>;

/**
 * A widget with nothing to show yet, with the reason as text ("No orders
 * synced yet."). Any widget may return this instead of its kind's payload.
 */
export interface WidgetEmptyState {
  readonly empty: true;
  readonly text: string;
}

/** What a provider or API returns for a widget: its data, or an empty state. */
export type WidgetPayload = WidgetData | WidgetEmptyState;

/** The default text for an empty widget. */
export const DEFAULT_EMPTY_TEXT = 'Nothing to show yet.';

/** Builds an empty state. */
export function emptyWidget(
  text: string = DEFAULT_EMPTY_TEXT
): WidgetEmptyState {
  return { empty: true, text };
}

export function isWidgetEmptyState(
  payload: WidgetPayload
): payload is WidgetEmptyState {
  return 'empty' in payload && payload.empty === true;
}

/**
 * The empty text for a payload with nothing in it (a table with no rows, a
 * list with no items, a graph with no points), or null when it has content.
 * TEXT, KPI and GAUGE always have content.
 */
export function emptyTextFor(payload: WidgetPayload): string | null {
  if (isWidgetEmptyState(payload)) {
    return payload.text;
  }
  switch (payload.kind) {
    case 'TABLE':
      return payload.rows.length === 0 ? DEFAULT_EMPTY_TEXT : null;
    case 'BAR_LIST':
      return payload.items.length === 0 ? DEFAULT_EMPTY_TEXT : null;
    case 'ALERT_LIST':
      return payload.items.length === 0 ? payload.emptyText : null;
    case 'GRAPH':
      return payload.series.every((series) => series.points.length === 0)
        ? DEFAULT_EMPTY_TEXT
        : null;
    case 'TEXT':
    case 'KPI':
    case 'GAUGE':
      return null;
  }
}
