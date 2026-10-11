/**
 * Alternate views: other ways to show the same data. A widget declares
 * `views`, each one built from the widget's own payload by a named,
 * parameterized conversion (data, not functions, so definitions stay JSON).
 * Switching is instant: no second load. Pure functions, no I/O.
 */

import type { WidgetDefinition } from './definition.js';
import { formatValue, type FormatOptions, type Locale } from './format.js';
import {
  MAX_GRAPH_SERIES,
  type BarListItem,
  type BarListWidgetData,
  type GraphSeries,
  type GraphWidgetData,
  type TableCell,
  type TableWidgetData,
  type ValueFormat,
  type WidgetData,
  type WidgetKind,
} from './payload.js';
import type { DashboardWidget } from './resolve.js';
import { err, ok, type Result } from './result.js';

/** The key of the widget's own kind, always available as a view. */
export const BASE_VIEW_KEY = 'base';

/** Most views one widget may declare, the base view not counted. */
export const MAX_WIDGET_VIEWS = 8;

/** How a view is built from the widget's payload. */
export type ViewConversion =
  | {
      readonly type: 'tableToBarList';
      /** Column index of the bar labels. */
      readonly label: number;
      /** Column index of the bar values (cells need a numeric `value`). */
      readonly value: number;
    }
  | {
      readonly type: 'tableToGraph';
      /** Column index of the x labels. */
      readonly label: number;
      /** Column indexes of the series (cells need a numeric `value`). */
      readonly values: readonly number[];
      readonly chartType: 'bar' | 'line';
      /** How the numbers read. Default `number`. */
      readonly valueFormat?: ValueFormat;
      readonly currency?: string;
    }
  | {
      readonly type: 'barListToTable';
      /** Heading of the label column. Default "Name". */
      readonly labelHeading?: string;
      /** Heading of the value column. Default "Value". */
      readonly valueHeading?: string;
    }
  | { readonly type: 'graphToTable' }
  | {
      readonly type: 'barListToGraph';
      readonly chartType: 'bar' | 'line';
      /** Name of the one series. Default "Value". */
      readonly seriesName?: string;
      readonly valueFormat?: ValueFormat;
      readonly currency?: string;
    };

/** The kinds a conversion reads and produces. */
export const VIEW_CONVERSIONS: Readonly<
  Record<ViewConversion['type'], { from: WidgetKind; to: WidgetKind }>
> = {
  tableToBarList: { from: 'TABLE', to: 'BAR_LIST' },
  tableToGraph: { from: 'TABLE', to: 'GRAPH' },
  barListToTable: { from: 'BAR_LIST', to: 'TABLE' },
  graphToTable: { from: 'GRAPH', to: 'TABLE' },
  barListToGraph: { from: 'BAR_LIST', to: 'GRAPH' },
};

/** One alternate way to show a widget. */
export interface WidgetView {
  /** Unique within the widget; not `base`. Stored in the viewer's settings. */
  readonly key: string;
  /** What the viewer sees in the View field, e.g. "Bars". */
  readonly label: string;
  /** What this view renders; must match what the conversion produces. */
  readonly kind: WidgetKind;
  /** Builds this view from the widget's payload. */
  readonly convert: ViewConversion;
}

/** What these functions need from a definition. */
export type ViewsItem = Pick<WidgetDefinition, 'key' | 'kind'> &
  Partial<Pick<WidgetDefinition, 'views' | 'defaultView' | 'baseViewLabel'>>;

const KIND_LABELS: Readonly<Record<WidgetKind, string>> = {
  TEXT: 'Text',
  KPI: 'Number',
  GAUGE: 'Gauge',
  TABLE: 'Table',
  BAR_LIST: 'Bars',
  ALERT_LIST: 'List',
  GRAPH: 'Chart',
};

/** A kind's plain name, used for the base view unless `baseViewLabel` is set. */
export function kindLabel(kind: WidgetKind): string {
  return KIND_LABELS[kind];
}

/** Whether the definition offers a choice of views. */
export function hasViews(item: Pick<ViewsItem, 'views'>): boolean {
  return item.views !== undefined && item.views.length > 0;
}

/** The view with this key, or undefined (`base` is not a declared view). */
export function findView(
  item: Pick<ViewsItem, 'views'>,
  key: string
): WidgetView | undefined {
  return item.views?.find((view) => view.key === key);
}

/** Every view a viewer may pick: the base first, then the declared ones. */
export function viewChoices(
  item: ViewsItem
): readonly { key: string; label: string; kind: WidgetKind }[] {
  if (!hasViews(item)) return [];
  return [
    {
      key: BASE_VIEW_KEY,
      label: item.baseViewLabel ?? kindLabel(item.kind),
      kind: item.kind,
    },
    ...(item.views ?? []).map(({ key, label, kind }) => ({
      key,
      label,
      kind,
    })),
  ];
}

function isKnownView(item: ViewsItem, key: string | undefined): boolean {
  return (
    key !== undefined &&
    (key === BASE_VIEW_KEY || findView(item, key) !== undefined)
  );
}

/**
 * The view in effect: the viewer's pick when the definition declares it,
 * else `defaultView`, else the base. Always a valid key.
 */
export function effectiveViewKey(
  item: ViewsItem,
  chosen: string | undefined
): string {
  if (!hasViews(item)) return BASE_VIEW_KEY;
  if (isKnownView(item, chosen)) return chosen as string;
  if (isKnownView(item, item.defaultView)) return item.defaultView as string;
  return BASE_VIEW_KEY;
}

/** The kind the widget renders as under this view key. */
export function viewKind(
  item: ViewsItem,
  chosen: string | undefined
): WidgetKind {
  return findView(item, effectiveViewKey(item, chosen))?.kind ?? item.kind;
}

function cellValue(cell: TableCell | undefined): number | undefined {
  const value: string | number | undefined = cell?.value;
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function columnName(table: TableWidgetData, index: number): string {
  return table.columns[index]?.label ?? `#${index + 1}`;
}

interface ConversionContext {
  /** Names the widget and view in error messages. */
  readonly where: string;
  readonly locale?: Locale;
}

function checkColumn(
  table: TableWidgetData,
  index: number,
  field: string,
  context: ConversionContext
): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= table.columns.length) {
    return `${context.where}: ${field} column ${index} does not exist (the table has ${table.columns.length} columns, numbered from 0).`;
  }
  return undefined;
}

function numericColumn(
  table: TableWidgetData,
  index: number,
  context: ConversionContext
): Result<number[]> {
  const numbers: number[] = [];
  for (const [rowIndex, row] of table.rows.entries()) {
    const value: number | undefined = cellValue(row[index]);
    if (value === undefined) {
      return err(
        `${context.where}: row ${rowIndex + 1}, column ${index + 1} ("${columnName(table, index)}") has no numeric value. Add value to the cells.`
      );
    }
    numbers.push(value);
  }
  return ok(numbers);
}

function tableToBarList(
  table: TableWidgetData,
  conversion: Extract<ViewConversion, { type: 'tableToBarList' }>,
  context: ConversionContext
): Result<BarListWidgetData> {
  const bad: string | undefined =
    checkColumn(table, conversion.label, 'label', context) ??
    checkColumn(table, conversion.value, 'value', context);
  if (bad !== undefined) return err(bad);
  const numbers = numericColumn(table, conversion.value, context);
  if (!numbers.ok) return numbers;
  const items: BarListItem[] = table.rows.map((row, index) => ({
    label: row[conversion.label]?.text ?? '',
    value: numbers.value[index] as number,
    display: row[conversion.value]?.text ?? String(numbers.value[index]),
  }));
  return ok({ kind: 'BAR_LIST', items });
}

function tableToGraph(
  table: TableWidgetData,
  conversion: Extract<ViewConversion, { type: 'tableToGraph' }>,
  context: ConversionContext
): Result<GraphWidgetData> {
  if (
    conversion.values.length === 0 ||
    conversion.values.length > MAX_GRAPH_SERIES
  ) {
    return err(
      `${context.where}: a chart needs 1 to ${MAX_GRAPH_SERIES} series columns, got ${conversion.values.length}.`
    );
  }
  let bad: string | undefined = checkColumn(
    table,
    conversion.label,
    'label',
    context
  );
  for (const index of conversion.values) {
    bad ??= checkColumn(table, index, 'series', context);
  }
  if (bad !== undefined) return err(bad);
  const series: GraphSeries[] = [];
  for (const index of conversion.values) {
    const numbers = numericColumn(table, index, context);
    if (!numbers.ok) return numbers;
    series.push({
      name: columnName(table, index),
      points: table.rows.map((row, rowIndex) => ({
        label: row[conversion.label]?.text ?? '',
        value: numbers.value[rowIndex] as number,
      })),
    });
  }
  return ok({
    kind: 'GRAPH',
    series,
    chartType: conversion.chartType,
    valueFormat: conversion.valueFormat ?? 'number',
    ...(conversion.currency === undefined
      ? {}
      : { currency: conversion.currency }),
    xLabel: columnName(table, conversion.label),
  });
}

function barListToTable(
  list: BarListWidgetData,
  conversion: Extract<ViewConversion, { type: 'barListToTable' }>
): Result<TableWidgetData> {
  return ok({
    kind: 'TABLE',
    columns: [
      { label: conversion.labelHeading ?? 'Name' },
      { label: conversion.valueHeading ?? 'Value', numeric: true },
    ],
    rows: list.items.map((item) => [
      { text: item.label },
      { text: item.display ?? String(item.value), value: item.value },
    ]),
  });
}

function graphToTable(
  graph: GraphWidgetData,
  context: ConversionContext
): Result<TableWidgetData> {
  const first: GraphSeries | undefined = graph.series[0];
  if (first === undefined)
    return err(`${context.where}: the chart has no series.`);
  const format: FormatOptions = {
    ...(graph.currency === undefined ? {} : { currency: graph.currency }),
    ...(context.locale === undefined ? {} : { locale: context.locale }),
  };
  return ok({
    kind: 'TABLE',
    columns: [
      { label: graph.xLabel ?? 'Label' },
      ...graph.series.map((series) => ({ label: series.name, numeric: true })),
    ],
    rows: first.points.map((point, index) => [
      { text: point.label },
      ...graph.series.map((series): TableCell => {
        const value: number | undefined = series.points[index]?.value;
        return value === undefined
          ? { text: '—' }
          : { text: formatValue(value, graph.valueFormat, format), value };
      }),
    ]),
  });
}

function barListToGraph(
  list: BarListWidgetData,
  conversion: Extract<ViewConversion, { type: 'barListToGraph' }>
): Result<GraphWidgetData> {
  return ok({
    kind: 'GRAPH',
    series: [
      {
        name: conversion.seriesName ?? 'Value',
        points: list.items.map((item) => ({
          label: item.label,
          value: item.value,
        })),
      },
    ],
    chartType: conversion.chartType,
    valueFormat: conversion.valueFormat ?? 'number',
    ...(conversion.currency === undefined
      ? {}
      : { currency: conversion.currency }),
  });
}

/** Options for `convertView`. */
export interface ConvertViewOptions {
  /** Locale for numbers a conversion has to format (graph to table). */
  readonly locale?: Locale;
}

/**
 * Builds a view's payload from the widget's payload. The error names the
 * widget, the view and what to fix, for example `Widget "top-products" view
 * "bars": row 3, column 2 ("Sold") has no numeric value. Add value to the
 * cells.` Never throws.
 */
export function convertView(
  widgetKey: string,
  view: Pick<WidgetView, 'key' | 'convert'>,
  data: WidgetData,
  options: ConvertViewOptions = {}
): Result<WidgetData> {
  const conversion: ViewConversion = view.convert;
  const context: ConversionContext = {
    where: `Widget ${JSON.stringify(widgetKey)} view ${JSON.stringify(view.key)}`,
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  };
  const expected: WidgetKind | undefined =
    VIEW_CONVERSIONS[conversion.type]?.from;
  if (expected === undefined) {
    return err(
      `${context.where}: unknown conversion type ${JSON.stringify((conversion as { type: unknown }).type)}.`
    );
  }
  if (data.kind !== expected) {
    return err(
      `${context.where}: ${conversion.type} reads a ${expected} payload, but the widget returned ${data.kind}.`
    );
  }
  switch (conversion.type) {
    case 'tableToBarList':
      return tableToBarList(data as TableWidgetData, conversion, context);
    case 'tableToGraph':
      return tableToGraph(data as TableWidgetData, conversion, context);
    case 'barListToTable':
      return barListToTable(data as BarListWidgetData, conversion);
    case 'graphToTable':
      return graphToTable(data as GraphWidgetData, context);
    case 'barListToGraph':
      return barListToGraph(data as BarListWidgetData, conversion);
  }
}

/**
 * What a view keeps of a table, for the dialog: "Shows Name and Sold only."
 * Empty when the view loses nothing worth saying.
 */
export function viewNote(
  view: WidgetView,
  data: WidgetData | undefined
): string {
  if (data?.kind !== 'TABLE') return '';
  const conversion: ViewConversion = view.convert;
  let indexes: readonly number[];
  if (conversion.type === 'tableToBarList') {
    indexes = [conversion.label, conversion.value];
  } else if (conversion.type === 'tableToGraph') {
    indexes = [conversion.label, ...conversion.values];
  } else {
    return '';
  }
  const names: string[] = indexes.map(
    (index) => data.columns[index]?.label ?? `#${index + 1}`
  );
  return `Shows ${names.join(', ')} only.`;
}

/**
 * The widget as the chosen view shows it: the payload converted and the
 * definition's `kind` set to the view's kind, so renderers work unchanged.
 * A widget that isn't `ok`, or whose view is the base, comes back as is; a
 * failed conversion becomes an `error` widget naming the fix.
 */
export function applyView<W extends DashboardWidget>(
  widget: W,
  chosen: string | undefined,
  options: ConvertViewOptions = {}
): DashboardWidget {
  const key: string = effectiveViewKey(widget.definition, chosen);
  const view: WidgetView | undefined = findView(widget.definition, key);
  if (view === undefined) return widget;
  const definition: WidgetDefinition = {
    ...widget.definition,
    kind: view.kind,
  };
  if (widget.status === 'loading') return { ...widget, definition };
  if (widget.status === 'empty') return { ...widget, definition };
  if (widget.status === 'error') return { ...widget, definition };
  const converted = convertView(
    widget.definition.key,
    view,
    widget.data,
    options
  );
  if (!converted.ok) {
    return {
      definition,
      status: 'error',
      error: converted.error,
      ...(widget.options === undefined ? {} : { options: widget.options }),
    };
  }
  return { ...widget, definition, data: converted.value };
}
