/**
 * Payload builders: pure functions that construct valid widget payloads from
 * your own data, so a provider or an adapter's mapper needn't spell out each
 * object. They do no I/O. The ones that take a list (`toTable`, `toBarList`,
 * `toGraph`) return an empty state for an empty list, a very common bug when
 * done by hand.
 */

import {
  DEFAULT_EMPTY_TEXT,
  emptyWidget,
  type AlertListItem,
  type AlertListWidgetData,
  type BarListItem,
  type BarListWidgetData,
  type GaugeWidgetData,
  type GraphPoint,
  type GraphSeries,
  type GraphWidgetData,
  type KpiWidgetData,
  type TableCell,
  type TableColumn,
  type TableWidgetData,
  type TextWidgetData,
  type ValueFormat,
  type WidgetEmptyState,
} from './payload.js';

/** What `toText` reads. */
export interface TextInput {
  readonly label: string;
  readonly value: string;
}

export function toText(input: TextInput): TextWidgetData {
  return { kind: 'TEXT', value: input.value, label: input.label };
}

/** What `toKpi` reads; the fields are those of `KpiWidgetData`. */
export interface KpiInput {
  readonly label: string;
  readonly value: number;
  /** The same measure for the previous period; null or absent for none. */
  readonly previous?: number | null;
  readonly format: ValueFormat;
  /** ISO 4217 code for `currency`. */
  readonly currency?: string;
  readonly hint?: string;
  readonly higherIsBetter?: boolean;
}

export function toKpi(input: KpiInput): KpiWidgetData {
  return {
    kind: 'KPI',
    value: input.value,
    ...(input.previous === undefined ? {} : { previous: input.previous }),
    format: input.format,
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    label: input.label,
    ...(input.hint === undefined ? {} : { hint: input.hint }),
    ...(input.higherIsBetter === undefined
      ? {}
      : { higherIsBetter: input.higherIsBetter }),
  };
}

/** What `toGauge` reads. */
export interface GaugeInput {
  readonly label: string;
  readonly value: number;
  readonly max: number;
}

export function toGauge(input: GaugeInput): GaugeWidgetData {
  return {
    kind: 'GAUGE',
    value: input.value,
    max: input.max,
    label: input.label,
  };
}

/** A table column and how to read one row's cell for it. */
export interface TableColumnSpec<Row> extends TableColumn {
  readonly cell: (row: Row) => TableCell;
}

/** Options shared by the list builders. */
export interface ListBuilderOptions {
  /** The empty state's text when there are no rows. Default: `DEFAULT_EMPTY_TEXT`. */
  readonly emptyText?: string;
}

export interface TableBuilderOptions extends ListBuilderOptions {
  /** A note under the table, e.g. "and 12 more". */
  readonly footer?: string;
}

/**
 * A table from rows and column specs. Each column carries its `TableColumn`
 * fields (`label`, `numeric`, `type`, `formatter`) and a `cell` function that
 * turns a row into that column's cell. No rows gives an empty state.
 */
export function toTable<Row>(
  rows: readonly Row[],
  columns: readonly TableColumnSpec<Row>[],
  options: TableBuilderOptions = {}
): TableWidgetData | WidgetEmptyState {
  if (rows.length === 0) return emptyWidget(options.emptyText);
  return {
    kind: 'TABLE',
    columns: columns.map(({ cell: _cell, ...column }): TableColumn => column),
    rows: rows.map((row) => columns.map((column) => column.cell(row))),
    ...(options.footer === undefined ? {} : { footer: options.footer }),
  };
}

/** How `toBarList` reads one item. */
export interface BarListPick<Item> {
  readonly label: (item: Item) => string;
  readonly value: (item: Item) => number;
  /** Text shown beside the bar; default the formatted value. */
  readonly display?: (item: Item) => string;
}

export interface BarListBuilderOptions extends ListBuilderOptions {
  /** Bars are a share of this when given, else of the largest value. */
  readonly total?: number;
}

/** Labelled bars from items. No items gives an empty state. */
export function toBarList<Item>(
  items: readonly Item[],
  pick: BarListPick<Item>,
  options: BarListBuilderOptions = {}
): BarListWidgetData | WidgetEmptyState {
  if (items.length === 0) return emptyWidget(options.emptyText);
  return {
    kind: 'BAR_LIST',
    items: items.map((item): BarListItem => {
      const display: string | undefined = pick.display?.(item);
      return {
        label: pick.label(item),
        value: pick.value(item),
        ...(display === undefined ? {} : { display }),
      };
    }),
    ...(options.total === undefined ? {} : { total: options.total }),
  };
}

/** How `toAlertList` reads one item. */
export interface AlertListPick<Item> {
  readonly title: (item: Item) => string;
  /** The short figure on the right, e.g. "2 left". */
  readonly valueLabel: (item: Item) => string;
  readonly href?: (item: Item) => string | undefined;
  readonly thumbnailUrl?: (item: Item) => string | undefined;
  readonly detail?: (item: Item) => string | undefined;
}

export interface AlertListBuilderOptions {
  /** Shown when there is nothing to flag, e.g. "Nothing low on stock." */
  readonly emptyText?: string;
  /** How many there are in all when `items` is only the first few. Default: `items.length`. */
  readonly total?: number;
}

/**
 * An alert list from items. Unlike the other list builders it never returns an
 * empty state: an empty list is good news ("Nothing low on stock."), which the
 * payload carries as its own `emptyText`.
 */
export function toAlertList<Item>(
  items: readonly Item[],
  pick: AlertListPick<Item>,
  options: AlertListBuilderOptions = {}
): AlertListWidgetData {
  return {
    kind: 'ALERT_LIST',
    items: items.map((item): AlertListItem => {
      const href: string | undefined = pick.href?.(item);
      const thumbnailUrl: string | undefined = pick.thumbnailUrl?.(item);
      const detail: string | undefined = pick.detail?.(item);
      return {
        title: pick.title(item),
        ...(href === undefined ? {} : { href }),
        ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
        valueLabel: pick.valueLabel(item),
        ...(detail === undefined ? {} : { detail }),
      };
    }),
    total: options.total ?? items.length,
    emptyText: options.emptyText ?? DEFAULT_EMPTY_TEXT,
  };
}

/** One series for `toGraph`. */
export interface GraphSeriesInput {
  readonly name: string;
  readonly points: readonly GraphPoint[];
}

/** What `toGraph` reads; the fields are those of `GraphWidgetData`. */
export interface GraphInput {
  readonly series: readonly GraphSeriesInput[];
  readonly chartType: 'bar' | 'line';
  readonly valueFormat: ValueFormat;
  readonly currency?: string;
  /** Heading for the label column in the table view, e.g. "Month". */
  readonly xLabel?: string;
}

/** A chart from series. No points in any series gives an empty state. */
export function toGraph(
  input: GraphInput,
  options: ListBuilderOptions = {}
): GraphWidgetData | WidgetEmptyState {
  if (input.series.every((series) => series.points.length === 0)) {
    return emptyWidget(options.emptyText);
  }
  return {
    kind: 'GRAPH',
    series: input.series.map((series): GraphSeries => ({
      name: series.name,
      points: series.points,
    })),
    chartType: input.chartType,
    valueFormat: input.valueFormat,
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    ...(input.xLabel === undefined ? {} : { xLabel: input.xLabel }),
  };
}
