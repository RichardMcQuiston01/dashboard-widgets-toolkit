/**
 * Options a widget author declares and a viewer (or the consumer) can choose:
 * a default sort, "top N", a period, which columns show. The package never
 * decides what an option means for your data. It validates the chosen values,
 * hands them to your provider (`ProviderOptions.options`), keeps cached
 * payloads for different choices apart, and can sort or trim a payload itself
 * when the author says so (`apply: 'client'`).
 *
 * Definitions stay plain JSON: no functions, no regular expressions.
 */

import { queryRows, tableDetailData, type DetailSort } from './detail.js';
import type {
  BarListItem,
  TableCell,
  TableColumn,
  WidgetData,
} from './payload.js';

/** A chosen option value. Only a `columns` option holds more than a scalar. */
export type OptionValue = string | number | boolean | readonly string[];

/** Resolved option values by option key. */
export type OptionValues = Readonly<Record<string, OptionValue>>;

/** Fields every declared option has. */
interface OptionBase {
  /** Unique within the widget; letters, digits, `_` and `-`, starting with a letter. */
  readonly key: string;
  /** What the viewer sees, in your own words (and language). */
  readonly label: string;
}

/** A pick from a fixed list. */
export interface ChoiceOption extends OptionBase {
  readonly type: 'choice';
  readonly choices: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly default: string;
}

export interface NumberOption extends OptionBase {
  readonly type: 'number';
  readonly min: number;
  readonly max: number;
  /** Chosen values must be `min` plus a whole number of steps. */
  readonly step?: number;
  readonly default: number;
}

export interface BooleanOption extends OptionBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

/** Free text: a search term, a tag. Always plain text, never HTML. */
export interface TextOption extends OptionBase {
  readonly type: 'text';
  /** At most 500. */
  readonly maxLength: number;
  readonly default: string;
}

/** The named ranges a `dateRange` option can use (see `resolveDateRange`). */
export const DATE_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

/**
 * A range of calendar days. The value is a preset key (`last30`) or an ISO
 * interval `YYYY-MM-DD/YYYY-MM-DD`. Providers always receive the interval.
 */
export interface DateRangeOption extends OptionBase {
  readonly type: 'dateRange';
  /** The presets a viewer may pick. Default: every preset. */
  readonly presets?: readonly {
    readonly value: DateRangePreset;
    readonly label: string;
  }[];
  readonly default: string;
}

/** A `#rrggbb` color. A color alone should never carry meaning. */
export interface ColorOption extends OptionBase {
  readonly type: 'color';
  readonly default: string;
}

/**
 * How rows are ordered. The value is `column:asc` or `column:desc`, where
 * `column` is a column key: `c0`, `c1`, ... for a TABLE (by position) and
 * `label` or `value` for a BAR_LIST.
 */
export interface SortOption extends OptionBase {
  readonly type: 'sort';
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  /** Absent: no sort until the viewer picks one. */
  readonly default?: string;
  /**
   * `provider` (default): your provider returns the right rows, which a
   * truncated table needs. `client`: the toolkit sorts the payload it got.
   */
  readonly apply?: 'provider' | 'client';
}

/** Which TABLE columns show, and in what order. The value is column keys. */
export interface ColumnsOption extends OptionBase {
  readonly type: 'columns';
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  readonly default: readonly string[];
  /** `provider` (default) passes the keys on; `client` trims the payload here. */
  readonly apply?: 'provider' | 'client';
}

export type WidgetOption =
  | ChoiceOption
  | NumberOption
  | BooleanOption
  | TextOption
  | DateRangeOption
  | ColorOption
  | SortOption
  | ColumnsOption;

export const WIDGET_OPTION_TYPES = [
  'choice',
  'number',
  'boolean',
  'text',
  'dateRange',
  'color',
  'sort',
  'columns',
] as const;

/** The most options one widget may declare. */
export const MAX_WIDGET_OPTIONS = 20;
/** The most characters in a `text` option. */
export const MAX_TEXT_OPTION_LENGTH = 500;
/** Allowed option keys. */
export const OPTION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const INTERVAL_PATTERN = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/;
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** What option resolution needs from the outside world. */
export interface OptionContext {
  /** "Now" in epoch ms, for date range presets. Default `Date.now()`. */
  readonly now?: number;
  /** An IANA time zone for "today". Default `UTC`. */
  readonly timeZone?: string;
}

/** The value a column key refers to in a sort or columns option. */
export function isColumnKeyFor(kind: string, key: string): boolean {
  if (kind === 'TABLE') return /^c\d+$/.test(key);
  if (kind === 'BAR_LIST') return key === 'label' || key === 'value';
  return false;
}

/** Whether the toolkit (not your provider) applies this option. */
export function isClientApplied(option: WidgetOption): boolean {
  return (
    (option.type === 'sort' || option.type === 'columns') &&
    option.apply === 'client'
  );
}

// --- Date ranges -----------------------------------------------------------

interface CivilDate {
  readonly year: number;
  readonly month: number; // 1 to 12
  readonly day: number;
}

function civilToday(context: OptionContext): CivilDate {
  const now: number = context.now ?? Date.now();
  let timeZone: string = context.timeZone ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = 'UTC';
  }
  const parts: Intl.DateTimeFormatPart[] = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

function parseIsoDay(text: string): number | undefined {
  const match: RegExpMatchArray | null = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return undefined;
  const epoch: number = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  return toIso(epoch) === text ? epoch : undefined;
}

/** Whether `value` is `YYYY-MM-DD/YYYY-MM-DD` with real days, start not after end. */
export function isIsoInterval(value: string): boolean {
  const match: RegExpMatchArray | null = INTERVAL_PATTERN.exec(value);
  if (match === null) return false;
  const start: number | undefined = parseIsoDay(match[1] as string);
  const end: number | undefined = parseIsoDay(match[2] as string);
  return start !== undefined && end !== undefined && start <= end;
}

function isPreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

/**
 * The ISO interval a date range value stands for, or undefined when it is
 * neither a preset nor a valid interval. Presets, in calendar days of the
 * context's time zone: `today`, `yesterday`, `last7`, `last30` and `last90`
 * (ending today), `thisMonth` and `thisYear` (from the first day to today),
 * `lastMonth` and `lastYear` (the whole of it).
 */
export function resolveDateRange(
  value: string,
  context: OptionContext = {}
): string | undefined {
  if (isIsoInterval(value)) return value;
  if (!isPreset(value)) return undefined;
  const today: CivilDate = civilToday(context);
  const todayMs: number = Date.UTC(today.year, today.month - 1, today.day);
  const range = (startMs: number, endMs: number): string =>
    `${toIso(startMs)}/${toIso(endMs)}`;
  switch (value) {
    case 'today':
      return range(todayMs, todayMs);
    case 'yesterday':
      return range(todayMs - DAY_MS, todayMs - DAY_MS);
    case 'last7':
      return range(todayMs - 6 * DAY_MS, todayMs);
    case 'last30':
      return range(todayMs - 29 * DAY_MS, todayMs);
    case 'last90':
      return range(todayMs - 89 * DAY_MS, todayMs);
    case 'thisMonth':
      return range(Date.UTC(today.year, today.month - 1, 1), todayMs);
    case 'lastMonth':
      return range(
        Date.UTC(today.year, today.month - 2, 1),
        Date.UTC(today.year, today.month - 1, 1) - DAY_MS
      );
    case 'thisYear':
      return range(Date.UTC(today.year, 0, 1), todayMs);
    case 'lastYear':
      return range(
        Date.UTC(today.year - 1, 0, 1),
        Date.UTC(today.year, 0, 1) - DAY_MS
      );
  }
}

// --- Choosing values ---------------------------------------------------------

function onStepGrid(option: NumberOption, value: number): boolean {
  if (option.step === undefined) return true;
  const steps: number = (value - option.min) / option.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** `column:asc|desc` as a detail sort, or undefined when malformed. */
export function parseSortValue(value: string): DetailSort | undefined {
  const separator: number = value.lastIndexOf(':');
  if (separator <= 0) return undefined;
  const column: string = value.slice(0, separator);
  const direction: string = value.slice(separator + 1);
  if (direction !== 'asc' && direction !== 'desc') return undefined;
  return { column, direction };
}

/**
 * The sort the widget's `sort` option currently selects, or undefined when
 * the widget has no sort option or no sort is chosen. Use it to seed table
 * headers and the detail view.
 */
export function sortFromOptions(
  definition: { readonly options?: readonly WidgetOption[] },
  values: OptionValues | undefined
): DetailSort | undefined {
  if (values === undefined) return undefined;
  const sortOption: WidgetOption | undefined = definition.options?.find(
    (option) => option.type === 'sort'
  );
  if (sortOption === undefined) return undefined;
  const chosen: OptionValue | undefined = values[sortOption.key];
  return typeof chosen === 'string' ? parseSortValue(chosen) : undefined;
}

/**
 * A chosen value made valid for `option`, or undefined when it isn't one the
 * option allows. Text is trimmed, colors lower-cased, date ranges resolved to
 * an interval.
 */
export function coerceOptionValue(
  option: WidgetOption,
  value: unknown,
  context: OptionContext = {}
): OptionValue | undefined {
  switch (option.type) {
    case 'choice':
      return typeof value === 'string' &&
        option.choices.some((choice) => choice.value === value)
        ? value
        : undefined;
    case 'number':
      return typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= option.min &&
        value <= option.max &&
        onStepGrid(option, value)
        ? value
        : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'text': {
      if (typeof value !== 'string') return undefined;
      const trimmed: string = value.trim();
      return trimmed.length <= option.maxLength &&
        !CONTROL_CHARACTERS.test(trimmed)
        ? trimmed
        : undefined;
    }
    case 'dateRange': {
      if (typeof value !== 'string') return undefined;
      if (
        isPreset(value) &&
        option.presets !== undefined &&
        !option.presets.some((preset) => preset.value === value)
      ) {
        return undefined;
      }
      return resolveDateRange(value, context);
    }
    case 'color':
      return typeof value === 'string' && COLOR_PATTERN.test(value)
        ? value.toLowerCase()
        : undefined;
    case 'sort': {
      if (typeof value !== 'string') return undefined;
      const sort: DetailSort | undefined = parseSortValue(value);
      return sort !== undefined &&
        option.columns.some((column) => column.key === sort.column)
        ? value
        : undefined;
    }
    case 'columns': {
      if (!Array.isArray(value) || value.length === 0) return undefined;
      const keys: readonly unknown[] = value;
      const allowed = new Set<string>(option.columns.map((c) => c.key));
      const seen = new Set<string>();
      for (const key of keys) {
        if (typeof key !== 'string' || !allowed.has(key) || seen.has(key)) {
          return undefined;
        }
        seen.add(key);
      }
      return [...seen];
    }
  }
}

/** The value an option has when nothing valid was chosen. */
export function defaultOptionValue(
  option: WidgetOption,
  context: OptionContext = {}
): OptionValue | undefined {
  switch (option.type) {
    case 'dateRange':
      return resolveDateRange(option.default, context);
    case 'sort':
      return option.default;
    case 'columns':
      return [...option.default];
    default:
      return option.default;
  }
}

const NO_VALUES: OptionValues = Object.freeze({});

/**
 * The value of every option a definition declares: the chosen one when it is
 * valid for that option, else the default. Keys that aren't declared and
 * values that aren't valid are ignored (never an error), so a layout saved
 * before an option changed still loads. A `sort` option with no default and
 * no valid choice is left out. Empty when the definition declares none.
 */
export function resolveOptionValues(
  definition: { readonly options?: readonly WidgetOption[] },
  chosen: Readonly<Record<string, unknown>> | undefined,
  context: OptionContext = {}
): OptionValues {
  const options: readonly WidgetOption[] | undefined = definition.options;
  if (options === undefined || options.length === 0) return NO_VALUES;
  const values: Record<string, OptionValue> = {};
  for (const option of options) {
    const picked: unknown = chosen?.[option.key];
    const value: OptionValue | undefined =
      (picked === undefined
        ? undefined
        : coerceOptionValue(option, picked, context)) ??
      defaultOptionValue(option, context);
    if (value !== undefined) values[option.key] = value;
  }
  return values;
}

function sameValue(
  a: OptionValue | undefined,
  b: OptionValue | undefined
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

/** Whether two sets of resolved values are the same. */
export function sameOptionValues(a: OptionValues, b: OptionValues): boolean {
  const keys: string[] = Object.keys({ ...a, ...b });
  return keys.every((key) => sameValue(a[key], b[key]));
}

/**
 * Text that tells apart the payloads different choices produce, for cache
 * keys: the values that differ from the default, in key order, and only the
 * options your provider sees (`apply: 'client'` ones don't change the data it
 * returns). Empty when everything is on its default, so a widget on defaults
 * keeps its plain key.
 */
export function optionsCacheSuffix(
  definition: { readonly options?: readonly WidgetOption[] },
  values: OptionValues,
  context: OptionContext = {}
): string {
  const parts: string[] = [];
  for (const option of definition.options ?? []) {
    if (isClientApplied(option)) continue;
    const value: OptionValue | undefined = values[option.key];
    if (sameValue(value, defaultOptionValue(option, context))) continue;
    parts.push(
      `${option.key}=${encodeURIComponent(JSON.stringify(value ?? null))}`
    );
  }
  parts.sort();
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

// --- Applying client-side options ---------------------------------------------

function tableColumnIndex(key: string): number | undefined {
  const match: RegExpMatchArray | null = /^c(\d+)$/.exec(key);
  return match === null ? undefined : Number(match[1]);
}

function sortBarItems(
  items: readonly BarListItem[],
  sort: DetailSort
): BarListItem[] {
  const sign: number = sort.direction === 'desc' ? -1 : 1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const order: number =
        sort.column === 'value'
          ? a.item.value - b.item.value
          : a.item.label.localeCompare(b.item.label);
      return order * sign || a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * Applies the options the author marked `apply: 'client'` to a payload: sorts
 * the rows of a TABLE or the items of a BAR_LIST, and trims and reorders the
 * columns of a TABLE. Other payloads, and options whose columns don't fit the
 * payload, come back unchanged. Sorting happens before trimming, so a sort
 * can use a column that is then hidden.
 */
export function applyClientOptions(
  definition: { readonly options?: readonly WidgetOption[] },
  data: WidgetData,
  values: OptionValues
): WidgetData {
  const options: readonly WidgetOption[] = definition.options ?? [];
  const sortOption: WidgetOption | undefined = options.find(
    (o) => o.type === 'sort' && o.apply === 'client'
  );
  const columnsOption: WidgetOption | undefined = options.find(
    (o) => o.type === 'columns' && o.apply === 'client'
  );
  const sortValue: OptionValue | undefined =
    sortOption === undefined ? undefined : values[sortOption.key];
  const columnsValue: OptionValue | undefined =
    columnsOption === undefined ? undefined : values[columnsOption.key];
  let next: WidgetData = data;

  if (typeof sortValue === 'string') {
    const sort: DetailSort | undefined = parseSortValue(sortValue);
    if (sort !== undefined && next.kind === 'BAR_LIST') {
      if (sort.column === 'label' || sort.column === 'value') {
        next = { ...next, items: sortBarItems(next.items, sort) };
      }
    } else if (sort !== undefined && next.kind === 'TABLE') {
      const index: number | undefined = tableColumnIndex(sort.column);
      if (index !== undefined && index < next.columns.length) {
        const sorted = queryRows(tableDetailData(next), {
          page: 1,
          pageSize: Math.max(1, next.rows.length),
          sort,
        });
        if (sorted.ok) next = { ...next, rows: sorted.value.rows };
      }
    }
  }

  if (Array.isArray(columnsValue) && next.kind === 'TABLE') {
    const table = next;
    const indexes: number[] = (columnsValue as readonly string[])
      .map(tableColumnIndex)
      .filter(
        (index): index is number =>
          index !== undefined && index < table.columns.length
      );
    if (indexes.length > 0) {
      next = {
        ...table,
        columns: indexes.map((i) => table.columns[i] as TableColumn),
        rows: table.rows.map((row) => indexes.map((i) => row[i] as TableCell)),
      };
    }
  }
  return next;
}
