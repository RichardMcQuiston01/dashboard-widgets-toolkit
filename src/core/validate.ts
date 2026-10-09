/**
 * Hand-written validators for widget payloads and definitions, so data from
 * an API can be checked in a client without a schema library. Problems name
 * the widget, the field path and what was wrong, e.g.
 * `Widget "top-products" (TABLE): rows[2][0].text must be a string, got number.`
 */

import {
  WIDGET_FILLS,
  WIDGET_SIZES,
  type WidgetDefinition,
} from './definition.js';
import {
  MAX_GRAPH_SERIES,
  VALUE_FORMATS,
  WIDGET_KINDS,
  isWidgetKind,
  type WidgetKind,
  type WidgetPayload,
} from './payload.js';
import { DETAIL_MODES, MAX_DETAIL_PAGE_SIZE } from './detail.js';
import {
  DATE_RANGE_PRESETS,
  MAX_TEXT_OPTION_LENGTH,
  MAX_WIDGET_OPTIONS,
  OPTION_KEY_PATTERN,
  WIDGET_OPTION_TYPES,
  isColumnKeyFor,
  isIsoInterval,
  parseSortValue,
} from './options.js';
import { MAX_WIDGET_WIDTH, MIN_WIDGET_WIDTH, isWidgetWidth } from './grid.js';
import { err, ok, type Result } from './result.js';
import { isSafeHref, isSafeImageUrl } from './url.js';

/** At most this many problems are listed in one error message. */
export const MAX_REPORTED_PROBLEMS = 10;

export interface ValidateWidgetDataOptions {
  /** Named in error messages, e.g. the widget key. */
  readonly widgetKey?: string;
  /** Fails unless the payload is this kind (an empty state always passes). */
  readonly expectedKind?: WidgetKind;
}

type Problems = string[];
type Record_ = Readonly<Record<string, unknown>>;

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  return typeof value;
}

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(path: string, field: string): string {
  return path === '' ? field : `${path}.${field}`;
}

function requireString(
  record: Record_,
  field: string,
  path: string,
  problems: Problems
): void {
  const value: unknown = record[field];
  if (typeof value !== 'string') {
    problems.push(
      `${join(path, field)} must be a string, got ${describeType(value)}.`
    );
  }
}

function optionalString(
  record: Record_,
  field: string,
  path: string,
  problems: Problems
): void {
  if (record[field] !== undefined) {
    requireString(record, field, path, problems);
  }
}

function requireNumber(
  record: Record_,
  field: string,
  path: string,
  problems: Problems
): void {
  const value: unknown = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(
      `${join(path, field)} must be a finite number, got ${describeType(value)}.`
    );
  }
}

function optionalNumber(
  record: Record_,
  field: string,
  path: string,
  problems: Problems
): void {
  if (record[field] !== undefined) {
    requireNumber(record, field, path, problems);
  }
}

/** A cell's optional sort `value`: a string or a finite number. */
function optionalSortValue(
  record: Record_,
  path: string,
  problems: Problems
): void {
  const value: unknown = record['value'];
  if (
    value !== undefined &&
    typeof value !== 'string' &&
    !(typeof value === 'number' && Number.isFinite(value))
  ) {
    problems.push(
      `${path}.value must be a string or a finite number, got ${describeType(value)}.`
    );
  }
}

function optionalBoolean(
  record: Record_,
  field: string,
  path: string,
  problems: Problems
): void {
  const value: unknown = record[field];
  if (value !== undefined && typeof value !== 'boolean') {
    problems.push(
      `${join(path, field)} must be a boolean, got ${describeType(value)}.`
    );
  }
}

function optionalUrl(
  record: Record_,
  field: string,
  path: string,
  problems: Problems,
  isSafe: (url: string) => boolean,
  allowed: string
): void {
  const value: unknown = record[field];
  if (value === undefined) return;
  if (typeof value !== 'string') {
    problems.push(
      `${join(path, field)} must be a string, got ${describeType(value)}.`
    );
  } else if (!isSafe(value)) {
    problems.push(
      `${join(path, field)} must be ${allowed}, got ${JSON.stringify(value.slice(0, 80))}.`
    );
  }
}

function requireArray(
  record: Record_,
  field: string,
  path: string,
  problems: Problems
): readonly unknown[] | null {
  const value: unknown = record[field];
  if (!Array.isArray(value)) {
    problems.push(
      `${join(path, field)} must be an array, got ${describeType(value)}.`
    );
    return null;
  }
  return value;
}

function requireOneOf(
  record: Record_,
  field: string,
  options: readonly string[],
  path: string,
  problems: Problems
): void {
  const value: unknown = record[field];
  if (typeof value !== 'string' || !options.includes(value)) {
    problems.push(
      `${join(path, field)} must be one of ${options.map((o) => `"${o}"`).join(', ')}, got ${
        typeof value === 'string' ? JSON.stringify(value) : describeType(value)
      }.`
    );
  }
}

/** Runs `check` on each element that is an object, reporting the others. */
function eachRecord(
  items: readonly unknown[],
  path: string,
  problems: Problems,
  check: (item: Record_, itemPath: string) => void
): void {
  items.forEach((item: unknown, index: number) => {
    const itemPath = `${path}[${index}]`;
    if (isRecord(item)) {
      check(item, itemPath);
    } else {
      problems.push(
        `${itemPath} must be an object, got ${describeType(item)}.`
      );
    }
  });
}

const HREF_RULE = 'an http(s), mailto or relative URL';
const IMAGE_RULE = 'an http(s) or relative URL';

function checkPayloadFields(
  kind: WidgetKind,
  data: Record_,
  problems: Problems
): void {
  switch (kind) {
    case 'TEXT':
      requireString(data, 'value', '', problems);
      requireString(data, 'label', '', problems);
      return;
    case 'KPI':
      requireNumber(data, 'value', '', problems);
      if (data['previous'] !== null) {
        optionalNumber(data, 'previous', '', problems);
      }
      requireOneOf(data, 'format', VALUE_FORMATS, '', problems);
      optionalString(data, 'currency', '', problems);
      requireString(data, 'label', '', problems);
      optionalString(data, 'hint', '', problems);
      optionalBoolean(data, 'higherIsBetter', '', problems);
      return;
    case 'GAUGE':
      requireNumber(data, 'value', '', problems);
      requireNumber(data, 'max', '', problems);
      requireString(data, 'label', '', problems);
      if (typeof data['max'] === 'number' && data['max'] <= 0) {
        problems.push(`max must be greater than 0, got ${data['max']}.`);
      }
      return;
    case 'TABLE': {
      const columns = requireArray(data, 'columns', '', problems);
      if (columns !== null) {
        eachRecord(columns, 'columns', problems, (column, path) => {
          requireString(column, 'label', path, problems);
          optionalBoolean(column, 'numeric', path, problems);
        });
      }
      const rows = requireArray(data, 'rows', '', problems);
      if (rows !== null) {
        rows.forEach((row: unknown, rowIndex: number) => {
          const rowPath = `rows[${rowIndex}]`;
          if (!Array.isArray(row)) {
            problems.push(
              `${rowPath} must be an array of cells, got ${describeType(row)}.`
            );
            return;
          }
          if (columns !== null && row.length !== columns.length) {
            problems.push(
              `${rowPath} has ${row.length} cell(s) but there are ${columns.length} column(s).`
            );
          }
          eachRecord(row, rowPath, problems, (cell, cellPath) => {
            requireString(cell, 'text', cellPath, problems);
            optionalSortValue(cell, cellPath, problems);
            optionalUrl(
              cell,
              'href',
              cellPath,
              problems,
              isSafeHref,
              HREF_RULE
            );
          });
        });
      }
      optionalString(data, 'footer', '', problems);
      return;
    }
    case 'BAR_LIST': {
      const items = requireArray(data, 'items', '', problems);
      if (items !== null) {
        eachRecord(items, 'items', problems, (item, path) => {
          requireString(item, 'label', path, problems);
          requireNumber(item, 'value', path, problems);
          optionalString(item, 'display', path, problems);
        });
      }
      optionalNumber(data, 'total', '', problems);
      return;
    }
    case 'ALERT_LIST': {
      const items = requireArray(data, 'items', '', problems);
      if (items !== null) {
        eachRecord(items, 'items', problems, (item, path) => {
          requireString(item, 'title', path, problems);
          optionalUrl(item, 'href', path, problems, isSafeHref, HREF_RULE);
          optionalUrl(
            item,
            'thumbnailUrl',
            path,
            problems,
            isSafeImageUrl,
            IMAGE_RULE
          );
          requireString(item, 'valueLabel', path, problems);
          optionalString(item, 'detail', path, problems);
        });
      }
      requireNumber(data, 'total', '', problems);
      requireString(data, 'emptyText', '', problems);
      if (
        items !== null &&
        typeof data['total'] === 'number' &&
        data['total'] < items.length
      ) {
        problems.push(
          `total (${data['total']}) must be at least the number of items (${items.length}).`
        );
      }
      return;
    }
    case 'GRAPH': {
      const series = requireArray(data, 'series', '', problems);
      if (series !== null) {
        if (series.length > MAX_GRAPH_SERIES) {
          problems.push(
            `series has ${series.length} entries; at most ${MAX_GRAPH_SERIES} are allowed (fold the rest into "Other").`
          );
        }
        eachRecord(series, 'series', problems, (entry, path) => {
          requireString(entry, 'name', path, problems);
          const points = requireArray(entry, 'points', path, problems);
          if (points !== null) {
            eachRecord(
              points,
              `${path}.points`,
              problems,
              (point, pointPath) => {
                requireString(point, 'label', pointPath, problems);
                requireNumber(point, 'value', pointPath, problems);
              }
            );
          }
        });
      }
      requireOneOf(data, 'chartType', ['bar', 'line'], '', problems);
      requireOneOf(data, 'valueFormat', VALUE_FORMATS, '', problems);
      optionalString(data, 'currency', '', problems);
      optionalString(data, 'xLabel', '', problems);
      return;
    }
  }
}

/** Checks a definition's `detail` setting: a boolean or an options object. */
function checkDetailOption(detail: unknown, problems: Problems): void {
  if (detail === undefined || typeof detail === 'boolean') return;
  if (!isRecord(detail)) {
    problems.push(
      `detail must be true, false or an options object, got ${describeType(detail)}.`
    );
    return;
  }
  optionalString(detail, 'title', 'detail', problems);
  const pageSize: unknown = detail['pageSize'];
  if (
    pageSize !== undefined &&
    !(
      typeof pageSize === 'number' &&
      Number.isInteger(pageSize) &&
      pageSize >= 1 &&
      pageSize <= MAX_DETAIL_PAGE_SIZE
    )
  ) {
    problems.push(
      `detail.pageSize must be a whole number from 1 to ${MAX_DETAIL_PAGE_SIZE}, got ${typeof pageSize === 'number' ? String(pageSize) : describeType(pageSize)}.`
    );
  }
  if (detail['mode'] !== undefined) {
    requireOneOf(detail, 'mode', DETAIL_MODES, 'detail', problems);
  }
}

/** Checks a definition's `tableControls`: a boolean or `{ search, sort }`. */
function checkTableControlsOption(
  controls: unknown,
  kind: unknown,
  problems: Problems
): void {
  if (controls === undefined || controls === false) return;
  if (typeof controls !== 'boolean' && !isRecord(controls)) {
    problems.push(
      `tableControls must be true, false or an options object, got ${describeType(controls)}.`
    );
    return;
  }
  if (isRecord(controls)) {
    optionalBoolean(controls, 'search', 'tableControls', problems);
    optionalBoolean(controls, 'sort', 'tableControls', problems);
  }
  if (typeof kind === 'string' && kind !== 'TABLE') {
    problems.push(
      `tableControls only applies to TABLE widgets, but kind is "${kind}".`
    );
  }
}

/** Checks a definition's `locked`: a boolean or `{ move, hide, minimize }`. */
function checkLockedOption(locked: unknown, problems: Problems): void {
  if (locked === undefined || typeof locked === 'boolean') return;
  if (!isRecord(locked)) {
    problems.push(
      `locked must be true, false or an object, got ${describeType(locked)}.`
    );
    return;
  }
  optionalBoolean(locked, 'move', 'locked', problems);
  optionalBoolean(locked, 'hide', 'locked', problems);
  optionalBoolean(locked, 'minimize', 'locked', problems);
}

/** Checks a list of column choices (`{ key, label }`) for a sort or columns option. */
function checkOptionColumns(
  option: Record_,
  path: string,
  kind: unknown,
  problems: Problems
): readonly string[] {
  const columns: unknown = option['columns'];
  if (!Array.isArray(columns) || columns.length === 0) {
    problems.push(
      `${join(path, 'columns')} must be a non-empty array of { key, label }, got ${describeType(columns)}.`
    );
    return [];
  }
  const keys: string[] = [];
  columns.forEach((entry: unknown, index: number) => {
    const entryPath = `${path}.columns[${index}]`;
    if (!isRecord(entry)) {
      problems.push(
        `${entryPath} must be an object, got ${describeType(entry)}.`
      );
      return;
    }
    requireString(entry, 'label', entryPath, problems);
    const key: unknown = entry['key'];
    if (typeof key !== 'string') {
      problems.push(
        `${entryPath}.key must be a string, got ${describeType(key)}.`
      );
    } else if (typeof kind === 'string' && !isColumnKeyFor(kind, key)) {
      problems.push(
        `${entryPath}.key "${key}" is not a column of a ${kind} widget (${
          kind === 'TABLE' ? '"c0", "c1", ...' : '"label" or "value"'
        }).`
      );
    } else if (keys.includes(key)) {
      problems.push(`${entryPath}.key "${key}" is used twice.`);
    } else {
      keys.push(key);
    }
  });
  return keys;
}

function checkOption(
  option: unknown,
  path: string,
  kind: unknown,
  seenKeys: Set<string>,
  seenTypes: Set<string>,
  problems: Problems
): void {
  if (!isRecord(option)) {
    problems.push(`${path} must be an object, got ${describeType(option)}.`);
    return;
  }
  const type: unknown = option['type'];
  if (
    typeof type !== 'string' ||
    !WIDGET_OPTION_TYPES.includes(type as never)
  ) {
    requireOneOf(option, 'type', WIDGET_OPTION_TYPES, path, problems);
    return;
  }
  const key: unknown = option['key'];
  if (typeof key !== 'string' || !OPTION_KEY_PATTERN.test(key)) {
    problems.push(
      `${path}.key must be letters, digits, "_" or "-", starting with a letter (40 characters at most), got ${
        typeof key === 'string' ? JSON.stringify(key) : describeType(key)
      }.`
    );
  } else if (seenKeys.has(key)) {
    problems.push(`${path}.key "${key}" is used by another option.`);
  } else {
    seenKeys.add(key);
  }
  requireString(option, 'label', path, problems);

  const fallback: unknown = option['default'];
  switch (type) {
    case 'choice': {
      const choices: unknown = option['choices'];
      const values: string[] = [];
      if (!Array.isArray(choices) || choices.length === 0) {
        problems.push(
          `${path}.choices must be a non-empty array of { value, label }, got ${describeType(choices)}.`
        );
      } else {
        choices.forEach((choice: unknown, index: number) => {
          const choicePath = `${path}.choices[${index}]`;
          if (!isRecord(choice)) {
            problems.push(
              `${choicePath} must be an object, got ${describeType(choice)}.`
            );
            return;
          }
          requireString(choice, 'label', choicePath, problems);
          const value: unknown = choice['value'];
          if (typeof value !== 'string' || value === '') {
            problems.push(
              `${choicePath}.value must be a non-empty string, got ${describeType(value)}.`
            );
          } else if (values.includes(value)) {
            problems.push(`${choicePath}.value "${value}" is used twice.`);
          } else {
            values.push(value);
          }
        });
      }
      if (values.length > 0)
        requireOneOf(option, 'default', values, path, problems);
      break;
    }
    case 'number': {
      const { min, max, step } = option as {
        min?: unknown;
        max?: unknown;
        step?: unknown;
      };
      requireNumber(option, 'min', path, problems);
      requireNumber(option, 'max', path, problems);
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        problems.push(
          `${path}.min (${min}) must not be more than max (${max}).`
        );
      }
      if (
        step !== undefined &&
        !(typeof step === 'number' && Number.isFinite(step) && step > 0)
      ) {
        problems.push(
          `${path}.step must be a number above 0, got ${describeType(step)}.`
        );
      }
      if (typeof fallback !== 'number' || !Number.isFinite(fallback)) {
        problems.push(
          `${path}.default must be a finite number, got ${describeType(fallback)}.`
        );
      } else if (
        typeof min === 'number' &&
        typeof max === 'number' &&
        (fallback < min || fallback > max)
      ) {
        problems.push(
          `${path}.default (${fallback}) must be between min (${min}) and max (${max}).`
        );
      } else if (
        typeof min === 'number' &&
        typeof step === 'number' &&
        step > 0 &&
        Math.abs(
          (fallback - min) / step - Math.round((fallback - min) / step)
        ) > 1e-9
      ) {
        problems.push(
          `${path}.default (${fallback}) must be ${min} plus a whole number of steps of ${step}.`
        );
      }
      break;
    }
    case 'boolean':
      if (typeof fallback !== 'boolean') {
        problems.push(
          `${path}.default must be a boolean, got ${describeType(fallback)}.`
        );
      }
      break;
    case 'text': {
      const maxLength: unknown = option['maxLength'];
      if (
        typeof maxLength !== 'number' ||
        !Number.isInteger(maxLength) ||
        maxLength < 1 ||
        maxLength > MAX_TEXT_OPTION_LENGTH
      ) {
        problems.push(
          `${path}.maxLength must be a whole number from 1 to ${MAX_TEXT_OPTION_LENGTH}, got ${
            typeof maxLength === 'number' ? maxLength : describeType(maxLength)
          }.`
        );
      }
      if (typeof fallback !== 'string') {
        problems.push(
          `${path}.default must be a string, got ${describeType(fallback)}.`
        );
      } else if (typeof maxLength === 'number' && fallback.length > maxLength) {
        problems.push(
          `${path}.default is ${fallback.length} characters; maxLength is ${maxLength}.`
        );
      }
      break;
    }
    case 'dateRange': {
      const presets: unknown = option['presets'];
      const offered: string[] = [];
      if (presets !== undefined) {
        if (!Array.isArray(presets) || presets.length === 0) {
          problems.push(
            `${path}.presets must be a non-empty array of { value, label }, got ${describeType(presets)}.`
          );
        } else {
          presets.forEach((preset: unknown, index: number) => {
            const presetPath = `${path}.presets[${index}]`;
            if (!isRecord(preset)) {
              problems.push(
                `${presetPath} must be an object, got ${describeType(preset)}.`
              );
              return;
            }
            requireString(preset, 'label', presetPath, problems);
            requireOneOf(
              preset,
              'value',
              DATE_RANGE_PRESETS,
              presetPath,
              problems
            );
            if (typeof preset['value'] === 'string')
              offered.push(preset['value']);
          });
        }
      }
      const allowed: readonly string[] =
        offered.length > 0 ? offered : DATE_RANGE_PRESETS;
      if (
        typeof fallback !== 'string' ||
        !(allowed.includes(fallback) || isIsoInterval(fallback))
      ) {
        problems.push(
          `${path}.default must be one of ${allowed.map((p) => `"${p}"`).join(', ')} or an interval like "2026-01-01/2026-01-31", got ${
            typeof fallback === 'string'
              ? JSON.stringify(fallback)
              : describeType(fallback)
          }.`
        );
      }
      break;
    }
    case 'color':
      if (typeof fallback !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(fallback)) {
        problems.push(
          `${path}.default must be a color like "#1c5cab", got ${
            typeof fallback === 'string'
              ? JSON.stringify(fallback)
              : describeType(fallback)
          }.`
        );
      }
      break;
    case 'sort':
    case 'columns': {
      const supported: boolean =
        type === 'sort'
          ? kind === 'TABLE' || kind === 'BAR_LIST'
          : kind === 'TABLE';
      if (!supported && typeof kind === 'string') {
        problems.push(
          `${path} is a ${type} option, which only applies to ${
            type === 'sort' ? 'TABLE and BAR_LIST' : 'TABLE'
          } widgets, but kind is "${kind}".`
        );
      }
      if (seenTypes.has(type)) {
        problems.push(
          `${path} is a second ${type} option; a widget has at most one.`
        );
      }
      seenTypes.add(type);
      const columnKeys: readonly string[] = checkOptionColumns(
        option,
        path,
        supported ? kind : undefined,
        problems
      );
      if (option['apply'] !== undefined) {
        requireOneOf(option, 'apply', ['provider', 'client'], path, problems);
      }
      if (type === 'sort') {
        if (fallback !== undefined) {
          const sort =
            typeof fallback === 'string' ? parseSortValue(fallback) : undefined;
          if (sort === undefined) {
            problems.push(
              `${path}.default must look like "c1:desc" ("column:asc" or "column:desc"), got ${
                typeof fallback === 'string'
                  ? JSON.stringify(fallback)
                  : describeType(fallback)
              }.`
            );
          } else if (
            columnKeys.length > 0 &&
            !columnKeys.includes(sort.column)
          ) {
            requireOneOf(
              { default: sort.column },
              'default',
              columnKeys,
              path,
              problems
            );
          }
        }
      } else if (
        !Array.isArray(fallback) ||
        fallback.length === 0 ||
        fallback.some((k: unknown) => typeof k !== 'string')
      ) {
        problems.push(
          `${path}.default must be a non-empty array of column keys, got ${describeType(fallback)}.`
        );
      } else {
        const shown = new Set<string>();
        for (const columnKey of fallback as string[]) {
          if (columnKeys.length > 0 && !columnKeys.includes(columnKey)) {
            problems.push(
              `${path}.default has "${columnKey}", which is not one of the columns (${columnKeys.map((c) => `"${c}"`).join(', ')}).`
            );
          } else if (shown.has(columnKey)) {
            problems.push(`${path}.default lists "${columnKey}" twice.`);
          }
          shown.add(columnKey);
        }
      }
      break;
    }
  }
}

/** Checks a definition's `options` list. */
function checkOptions(
  options: unknown,
  kind: unknown,
  problems: Problems
): void {
  if (options === undefined) return;
  if (!Array.isArray(options)) {
    problems.push(`options must be an array, got ${describeType(options)}.`);
    return;
  }
  if (options.length > MAX_WIDGET_OPTIONS) {
    problems.push(
      `options lists ${options.length} options; the most a widget may declare is ${MAX_WIDGET_OPTIONS}.`
    );
    return;
  }
  const seenKeys = new Set<string>();
  const seenTypes = new Set<string>();
  options.forEach((option: unknown, index: number) => {
    checkOption(
      option,
      `options[${index}]`,
      kind,
      seenKeys,
      seenTypes,
      problems
    );
  });
}

function formatProblems(prefix: string, problems: Problems): string {
  const shown: Problems = problems.slice(0, MAX_REPORTED_PROBLEMS);
  const more: number = problems.length - shown.length;
  return `${prefix}: ${shown.join(' ')}${more > 0 ? ` (and ${more} more problem(s))` : ''}`;
}

/**
 * Checks that `value` is a valid widget payload (any kind, or an empty
 * state). Returns it typed, or an error naming every problem found (up to
 * `MAX_REPORTED_PROBLEMS`). Unknown extra fields are allowed and ignored.
 */
export function validateWidgetData(
  value: unknown,
  options: ValidateWidgetDataOptions = {}
): Result<WidgetPayload> {
  const subject: string =
    options.widgetKey === undefined
      ? 'Widget data'
      : `Widget ${JSON.stringify(options.widgetKey)}`;
  if (!isRecord(value)) {
    return err(`${subject}: must be an object, got ${describeType(value)}.`);
  }
  if (value['empty'] === true) {
    if (typeof value['text'] !== 'string') {
      return err(
        `${subject} (empty): text must be a string, got ${describeType(value['text'])}.`
      );
    }
    return ok(value as unknown as WidgetPayload);
  }
  const kind: unknown = value['kind'];
  if (!isWidgetKind(kind)) {
    return err(
      `${subject}: kind must be one of ${WIDGET_KINDS.join(', ')} (or the payload must be {"empty": true, "text": ...}), got ${
        typeof kind === 'string' ? JSON.stringify(kind) : describeType(kind)
      }.`
    );
  }
  if (options.expectedKind !== undefined && kind !== options.expectedKind) {
    return err(
      `${subject}: expected kind ${options.expectedKind} from its definition, got ${kind}.`
    );
  }
  const problems: Problems = [];
  checkPayloadFields(kind, value, problems);
  if (problems.length > 0) {
    return err(formatProblems(`${subject} (${kind})`, problems));
  }
  return ok(value as unknown as WidgetPayload);
}

/**
 * Checks that `value` is a valid widget definition. Returns it typed, or an
 * error naming every problem found.
 */
export function validateWidgetDefinition(
  value: unknown
): Result<WidgetDefinition> {
  if (!isRecord(value)) {
    return err(
      `Widget definition: must be an object, got ${describeType(value)}.`
    );
  }
  const subject: string =
    typeof value['key'] === 'string'
      ? `Widget definition ${JSON.stringify(value['key'])}`
      : 'Widget definition';
  const problems: Problems = [];
  requireString(value, 'key', '', problems);
  if (value['key'] === '') {
    problems.push('key must not be empty.');
  }
  requireString(value, 'title', '', problems);
  optionalString(value, 'description', '', problems);
  requireOneOf(value, 'kind', WIDGET_KINDS, '', problems);
  optionalNumber(value, 'sortOrder', '', problems);
  if (value['roles'] !== undefined) {
    const roles = requireArray(value, 'roles', '', problems);
    roles?.forEach((role: unknown, index: number) => {
      if (typeof role !== 'string') {
        problems.push(
          `roles[${index}] must be a string, got ${describeType(role)}.`
        );
      }
    });
  }
  optionalBoolean(value, 'active', '', problems);
  if (value['defaultSize'] !== undefined) {
    requireOneOf(value, 'defaultSize', WIDGET_SIZES, '', problems);
  }
  if (value['width'] !== undefined && !isWidgetWidth(value['width'])) {
    problems.push(
      `width must be an integer from ${MIN_WIDGET_WIDTH} to ${MAX_WIDGET_WIDTH} (twelfths of the row), got ${typeof value['width'] === 'number' ? String(value['width']) : describeType(value['width'])}.`
    );
  }
  checkDetailOption(value['detail'], problems);
  checkTableControlsOption(value['tableControls'], value['kind'], problems);
  checkLockedOption(value['locked'], problems);
  checkOptions(value['options'], value['kind'], problems);
  if (value['page'] !== undefined) {
    if (typeof value['page'] !== 'string' || value['page'].trim() === '') {
      problems.push(
        `page must be a non-empty page key or title, got ${describeType(value['page'])}.`
      );
    }
  }
  if (value['fill'] !== undefined) {
    requireOneOf(value, 'fill', WIDGET_FILLS, '', problems);
  }
  if (problems.length > 0) {
    return err(formatProblems(subject, problems));
  }
  return ok(value as unknown as WidgetDefinition);
}
