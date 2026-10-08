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
  if (value['fill'] !== undefined) {
    requireOneOf(value, 'fill', WIDGET_FILLS, '', problems);
  }
  if (problems.length > 0) {
    return err(formatProblems(subject, problems));
  }
  return ok(value as unknown as WidgetDefinition);
}
