/**
 * Field types for table columns: how a cell is shown. A column declares one
 * `type`; the renderers (and the detail view) apply it. Everything here is
 * pure, and none of it fetches anything: an `email`, `url`, `image` or
 * `color` cell is checked, and an unsafe or malformed value falls back to the
 * cell's plain text. See `docs/design/widget-options-views-clones.md`.
 */

import { err, ok, type Result } from './result.js';
import { isSafeImageUrl } from './url.js';

/** The built-in field types. `text` is the default. */
export const FIELD_TYPES = [
  'text',
  'email',
  'url',
  'image',
  'color',
  'custom',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** The longest `formatter` name a `custom` column may use. */
export const MAX_FORMATTER_NAME_LENGTH = 64;

/** Letters, digits, `_`, `-` and `.`; starts with a letter. */
const FORMATTER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;

/** The longest address, per RFC 5321. */
const MAX_EMAIL_LENGTH = 254;

// No whitespace, quotes, brackets, `?`, `&` (header parameters), `,` or `;`
// (a list of addresses) or `<>` (a display name).
const EMAIL_PATTERN =
  /^[^\s@"'<>()[\]\\,;:?&#]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** The part of a column that says how its cells are shown. */
export interface FieldColumn {
  /** How the cells are shown. Default `text`. */
  readonly type?: FieldType;
  /**
   * For `type: 'custom'`: the name of a formatter you pass to
   * `WidgetSettingsProvider`'s `formatters`. The definition stays JSON; the
   * function lives in code.
   */
  readonly formatter?: string;
}

/** The part of a cell the field types read. */
export interface FieldCell {
  readonly text: string;
  readonly value?: string | number;
}

/** Whether `address` is a plain address: no display name, list or header parameters. */
export function isSafeEmail(address: string): boolean {
  return address.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(address);
}

/** Whether `url` is an absolute http(s) URL with no whitespace. */
export function isSafeWebUrl(url: string): boolean {
  return HTTP_URL_PATTERN.test(url);
}

/** Whether `color` is a `#rgb` or `#rrggbb` color. */
export function isSafeCellColor(color: string): boolean {
  return COLOR_PATTERN.test(color);
}

/** Whether `name` can name a formatter. */
export function isFormatterName(name: string): boolean {
  return (
    name.length <= MAX_FORMATTER_NAME_LENGTH &&
    FORMATTER_NAME_PATTERN.test(name)
  );
}

/**
 * The string a typed cell is read from: its `value` when that is a string
 * (the address, URL or color behind the text), else its `text`.
 */
export function fieldSource(cell: FieldCell): string {
  return typeof cell.value === 'string' ? cell.value : cell.text;
}

/** What to draw for a cell. */
export type CellField =
  | { readonly kind: 'text' }
  | { readonly kind: 'email'; readonly href: string }
  | { readonly kind: 'url'; readonly href: string }
  | { readonly kind: 'image'; readonly src: string }
  | { readonly kind: 'color'; readonly color: string }
  | { readonly kind: 'custom'; readonly formatter: string };

/**
 * How to draw `cell` in `column`. A value the type can't use (a bad address,
 * a `javascript:` URL, a `data:` image) gives `text`, so the cell shows its
 * plain text instead. A cell with its own `href` stays a link whatever the
 * column's type.
 */
export function cellField(column: FieldColumn, cell: FieldCell): CellField {
  switch (column.type) {
    case 'email': {
      const address: string = fieldSource(cell).trim();
      return isSafeEmail(address)
        ? { kind: 'email', href: `mailto:${address}` }
        : { kind: 'text' };
    }
    case 'url': {
      const url: string = fieldSource(cell).trim();
      return isSafeWebUrl(url) ? { kind: 'url', href: url } : { kind: 'text' };
    }
    case 'image': {
      const src: string = fieldSource(cell).trim();
      return isSafeImageUrl(src) ? { kind: 'image', src } : { kind: 'text' };
    }
    case 'color': {
      const color: string = fieldSource(cell).trim();
      return isSafeCellColor(color)
        ? { kind: 'color', color }
        : { kind: 'text' };
    }
    case 'custom':
      return column.formatter === undefined
        ? { kind: 'text' }
        : { kind: 'custom', formatter: column.formatter };
    default:
      return { kind: 'text' };
  }
}

/**
 * The problems with a column's `type` and `formatter`, as sentences that start
 * with `at` (for example `columns[2]`).
 */
export function fieldColumnProblems(
  column: Readonly<Record<string, unknown>>,
  at: string
): string[] {
  const problems: string[] = [];
  const type: unknown = column['type'];
  const formatter: unknown = column['formatter'];
  if (type !== undefined) {
    if (typeof type !== 'string' || !FIELD_TYPES.some((t) => t === type)) {
      problems.push(
        `${at}.type must be one of ${FIELD_TYPES.join(', ')}, got ${JSON.stringify(type)}.`
      );
    }
  }
  if (formatter !== undefined) {
    if (typeof formatter !== 'string' || !isFormatterName(formatter)) {
      problems.push(
        `${at}.formatter must be a name of letters, digits, "_", "-" and "." starting with a letter (at most ${MAX_FORMATTER_NAME_LENGTH} characters), got ${JSON.stringify(formatter)}.`
      );
    } else if (type !== 'custom') {
      problems.push(
        `${at}.formatter "${formatter}" needs ${at}.type "custom".`
      );
    }
  }
  if (type === 'custom' && formatter === undefined) {
    problems.push(
      `${at}.type "custom" needs ${at}.formatter, a formatter name.`
    );
  }
  return problems;
}

/**
 * The problem with a typed cell's value, or undefined when it is fine (or the
 * column isn't a type that reads the value). Used by the payload validators;
 * the renderers show such a cell's text instead.
 */
export function fieldCellProblem(
  column: FieldColumn,
  cell: FieldCell,
  at: string
): string | undefined {
  if (
    column.type !== 'email' &&
    column.type !== 'url' &&
    column.type !== 'image' &&
    column.type !== 'color'
  ) {
    return undefined;
  }
  if (cellField(column, cell).kind !== 'text') return undefined;
  const source: string = fieldSource(cell);
  const where: string =
    typeof cell.value === 'string' ? `${at}.value` : `${at}.text`;
  switch (column.type) {
    case 'email':
      return `${where} "${source}" is not a plain email address (no display name, list or "?" parameters).`;
    case 'url':
      return `${where} "${source}" is not an absolute http or https URL.`;
    case 'image':
      return `${where} "${source}" is not an http, https or relative image URL.`;
    default:
      return `${where} "${source}" is not a #rgb or #rrggbb color.`;
  }
}

/**
 * Checks ahead of time that every `custom` column in `columns` names a
 * formatter in `registered` (the keys of the `formatters` you give
 * `WidgetSettingsProvider`). Use it at startup or in a test; a missing
 * formatter otherwise just shows the cell's text.
 */
export function validateFormatters(
  columns: readonly (FieldColumn & { readonly label?: string })[],
  registered: readonly string[],
  subject = 'table'
): Result<null> {
  const problems: string[] = [];
  columns.forEach((column, index) => {
    if (
      column.type === 'custom' &&
      column.formatter !== undefined &&
      !registered.includes(column.formatter)
    ) {
      problems.push(
        `columns[${index}]${column.label === undefined ? '' : ` ("${column.label}")`} uses the formatter "${column.formatter}", which is not registered (registered: ${registered.length === 0 ? 'none' : registered.join(', ')}).`
      );
    }
  });
  return problems.length === 0
    ? ok(null)
    : err(`${subject}: ${problems.join(' ')}`);
}
