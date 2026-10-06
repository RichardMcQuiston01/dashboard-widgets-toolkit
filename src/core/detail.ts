/**
 * Detail view, core part: the data and query types, sorting, filtering and
 * paging, query (de)serialisation for URLs, and validation. Pure functions;
 * nothing here renders, fetches or reads `location`. See
 * `docs/design/detail-view.md`.
 */

import type { WidgetDefinition } from './definition.js';
import { formatValue, type Locale } from './format.js';
import type { WidgetData } from './payload.js';
import type { ProviderOptions, WidgetContext } from './resolve.js';
import { err, ok, type Result } from './result.js';
import { isSafeHref } from './url.js';

/** `client`: the provider returns every row; `server`: it honors the query. */
export const DETAIL_MODES = ['client', 'server'] as const;
export type DetailMode = (typeof DETAIL_MODES)[number];

export const DEFAULT_DETAIL_PAGE_SIZE = 25;
export const MAX_DETAIL_PAGE_SIZE = 200;

/** The `detail` setting on a widget definition. `true` means all defaults. */
export interface WidgetDetailOptions {
  /** Heading of the detail view. Default: the widget's title. */
  readonly title?: string;
  /** Rows per page, 1 to 200. Default 25. */
  readonly pageSize?: number;
  /** Default `client`. */
  readonly mode?: DetailMode;
}

/** `WidgetDetailOptions` with every default filled in. */
export interface ResolvedDetailOptions {
  readonly title: string;
  readonly pageSize: number;
  readonly mode: DetailMode;
}

export interface DetailColumn {
  /** Stable id used by sort, filters and URLs. Unique within the data. */
  readonly key: string;
  readonly label: string;
  /** Right-aligned, and sorted as numbers when cell values are numbers. */
  readonly numeric?: boolean;
  /** Default true. */
  readonly sortable?: boolean;
  /** Default false: gets its own filter input when true. */
  readonly filterable?: boolean;
}

export interface DetailCell {
  /** What is shown. */
  readonly text: string;
  /** What sorts and filters. Default: `text`. */
  readonly value?: string | number;
  /** Renders the cell as a link (http, https, mailto or relative only). */
  readonly href?: string;
}

export interface DetailData {
  readonly columns: readonly DetailColumn[];
  /** One array of cells per row, each as long as `columns`. */
  readonly rows: readonly (readonly DetailCell[])[];
  /** Server mode: rows matching the query across all pages. */
  readonly totalRows?: number;
}

export type SortDirection = 'asc' | 'desc';

export interface DetailSort {
  readonly column: string;
  readonly direction: SortDirection;
}

export interface DetailQuery {
  /** Free text, matched against every column. */
  readonly search?: string;
  /** Per-column text, keyed by column key. Blank entries are ignored. */
  readonly filters?: Readonly<Record<string, string>>;
  readonly sort?: DetailSort;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

/** What a detail provider receives beyond the usual arguments. */
export interface DetailProviderOptions extends ProviderOptions {
  readonly query: DetailQuery;
}

/**
 * Loads the full data for one widget's detail view. In client mode it may
 * ignore `options.query`; in server mode it returns one page and `totalRows`.
 */
export type DetailProvider<C = WidgetContext> = (
  context: C,
  definition: WidgetDefinition,
  options: DetailProviderOptions
) => DetailData | Promise<DetailData>;

/** Detail providers keyed by widget key. */
export type DetailProviders<C = WidgetContext> = Readonly<
  Record<string, DetailProvider<C>>
>;

export interface DetailPage {
  /** The rows of the requested page (after filtering and sorting). */
  readonly rows: readonly (readonly DetailCell[])[];
  /** Rows matching the query, across all pages. */
  readonly totalRows: number;
  /** The page shown: the requested one, clamped into range. */
  readonly page: number;
  readonly pageCount: number;
}

/** Reads `definition.detail` with defaults; undefined when there is none. */
export function resolveDetailOptions(
  definition: Pick<WidgetDefinition, 'title' | 'detail'>
): ResolvedDetailOptions | undefined {
  const detail: boolean | WidgetDetailOptions | undefined = definition.detail;
  if (detail === undefined || detail === false) return undefined;
  const options: WidgetDetailOptions = detail === true ? {} : detail;
  return {
    title: options.title ?? definition.title,
    pageSize: options.pageSize ?? DEFAULT_DETAIL_PAGE_SIZE,
    mode: options.mode ?? 'client',
  };
}

/** The first page, unsorted and unfiltered. */
export function defaultDetailQuery(
  pageSize: number = DEFAULT_DETAIL_PAGE_SIZE
): DetailQuery {
  return { page: 1, pageSize };
}

/** Lower case with accents removed, so "Café" matches "cafe". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function cellValue(cell: DetailCell): string | number {
  return cell.value ?? cell.text;
}

function cellMatches(cell: DetailCell, needle: string): boolean {
  return fold(String(cellValue(cell))).includes(needle);
}

function compareCells(
  a: DetailCell,
  b: DetailCell,
  collator: Intl.Collator
): number {
  const left: string | number = cellValue(a);
  const right: string | number = cellValue(b);
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  // Numbers sort before text when a column mixes them.
  if (typeof left === 'number') return -1;
  if (typeof right === 'number') return 1;
  return collator.compare(left, right);
}

/**
 * Filters, sorts and pages `data` in memory (client mode). Matching is
 * case- and accent-insensitive substring matching on each cell's `value`
 * (else `text`). Sorting is stable, locale-aware (`locale`, default the
 * runtime's) and numeric for number values. `page` is clamped into range.
 * Fails, naming the column, when the query names a column that does not
 * exist or cannot be sorted.
 */
export function queryRows(
  data: DetailData,
  query: DetailQuery,
  locale?: string
): Result<DetailPage> {
  const indexOf = new Map<string, number>(
    data.columns.map((column, index) => [column.key, index])
  );
  const filterEntries: { index: number; needle: string }[] = [];
  for (const [key, text] of Object.entries(query.filters ?? {})) {
    const index: number | undefined = indexOf.get(key);
    if (index === undefined) {
      return err(
        `Detail query: filter column "${key}" does not exist. Columns: ${listKeys(data)}.`
      );
    }
    const needle: string = fold(text.trim());
    if (needle !== '') filterEntries.push({ index, needle });
  }
  let sortIndex = -1;
  if (query.sort !== undefined) {
    const found: number | undefined = indexOf.get(query.sort.column);
    const column: DetailColumn | undefined =
      found === undefined ? undefined : data.columns[found];
    if (found === undefined || column === undefined) {
      return err(
        `Detail query: sort column "${query.sort.column}" does not exist. Columns: ${listKeys(data)}.`
      );
    }
    if (column.sortable === false) {
      return err(
        `Detail query: column "${column.key}" is not sortable (sortable: false).`
      );
    }
    sortIndex = found;
  }
  const search: string = fold((query.search ?? '').trim());

  let rows: (readonly DetailCell[])[] = data.rows.filter(
    (row) =>
      filterEntries.every(({ index, needle }) => {
        const cell: DetailCell | undefined = row[index];
        return cell !== undefined && cellMatches(cell, needle);
      }) &&
      (search === '' || row.some((cell) => cellMatches(cell, search)))
  );

  if (query.sort !== undefined && sortIndex >= 0) {
    const collator = new Intl.Collator(locale, {
      numeric: true,
      sensitivity: 'base',
    });
    const sign: number = query.sort.direction === 'desc' ? -1 : 1;
    rows = rows
      .map((row, position) => ({ row, position }))
      .sort((a, b) => {
        const left: DetailCell | undefined = a.row[sortIndex];
        const right: DetailCell | undefined = b.row[sortIndex];
        const order: number =
          left === undefined || right === undefined
            ? 0
            : sign * compareCells(left, right, collator);
        return order || a.position - b.position;
      })
      .map(({ row }) => row);
  }

  const pageSize: number = Math.max(1, Math.floor(query.pageSize));
  const pageCount: number = Math.max(1, Math.ceil(rows.length / pageSize));
  const page: number = Math.min(Math.max(1, Math.floor(query.page)), pageCount);
  return ok({
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    totalRows: rows.length,
    page,
    pageCount,
  });
}

function listKeys(data: DetailData): string {
  return data.columns.map((column) => `"${column.key}"`).join(', ');
}

/* URL query strings ------------------------------------------------------ */

const FILTER_PREFIX = 'f.';

/**
 * The query as a URL query string without the leading `?`: `q` (search),
 * `sort` (`column:asc|desc`), `page` and `f.<column>` filters. `pageSize` is
 * not included: the widget definition owns it. Defaults are left out.
 */
export function serializeDetailQuery(query: DetailQuery): string {
  const parts: string[] = [];
  const add = (key: string, value: string): void => {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  };
  if (query.search !== undefined && query.search !== '') {
    add('q', query.search);
  }
  if (query.sort !== undefined) {
    add('sort', `${query.sort.column}:${query.sort.direction}`);
  }
  for (const [column, text] of Object.entries(query.filters ?? {})) {
    if (text !== '') add(`${FILTER_PREFIX}${column}`, text);
  }
  if (query.page > 1) add('page', String(query.page));
  return parts.join('&');
}

/**
 * Reads a query string (with or without the leading `?`) written by
 * `serializeDetailQuery`. Unknown parameters are ignored, so it can share a
 * URL with the rest of an app. A malformed value fails with a message naming
 * the parameter. When `data` is given, column keys are checked against it.
 */
export function parseDetailQuery(
  queryString: string,
  pageSize: number = DEFAULT_DETAIL_PAGE_SIZE,
  data?: Pick<DetailData, 'columns'>
): Result<DetailQuery> {
  let search: string | undefined;
  let sort: DetailSort | undefined;
  let page = 1;
  const filters: Record<string, string> = {};
  const columnKeys: ReadonlySet<string> | undefined =
    data === undefined
      ? undefined
      : new Set(data.columns.map((column) => column.key));
  const text: string = queryString.startsWith('?')
    ? queryString.slice(1)
    : queryString;

  for (const pair of text.split('&')) {
    if (pair === '') continue;
    const equals: number = pair.indexOf('=');
    const rawKey: string = equals < 0 ? pair : pair.slice(0, equals);
    const rawValue: string = equals < 0 ? '' : pair.slice(equals + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      return err(
        `Detail query: "${pair}" is not valid percent-encoding in the URL.`
      );
    }
    if (key === 'q') {
      search = value;
    } else if (key === 'page') {
      if (!/^[1-9]\d*$/.test(value)) {
        return err(
          `Detail query: page must be a whole number from 1, got "${value}".`
        );
      }
      page = Number(value);
    } else if (key === 'sort') {
      const colon: number = value.lastIndexOf(':');
      const column: string = colon < 0 ? value : value.slice(0, colon);
      const direction: string = colon < 0 ? 'asc' : value.slice(colon + 1);
      if (column === '' || (direction !== 'asc' && direction !== 'desc')) {
        return err(
          `Detail query: sort must look like "column:asc" or "column:desc", got "${value}".`
        );
      }
      if (columnKeys !== undefined && !columnKeys.has(column)) {
        return err(`Detail query: sort column "${column}" does not exist.`);
      }
      sort = { column, direction };
    } else if (key.startsWith(FILTER_PREFIX)) {
      const column: string = key.slice(FILTER_PREFIX.length);
      if (columnKeys !== undefined && !columnKeys.has(column)) {
        return err(`Detail query: filter column "${column}" does not exist.`);
      }
      if (value !== '') filters[column] = value;
    }
  }
  return ok({
    ...(search === undefined || search === '' ? {} : { search }),
    ...(Object.keys(filters).length === 0 ? {} : { filters }),
    ...(sort === undefined ? {} : { sort }),
    page,
    pageSize,
  });
}

/* Validation ------------------------------------------------------------- */

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Checks data from a detail provider: unique non-empty column keys, labels,
 * every row as long as `columns`, cell `text` strings, `value` a string or
 * finite number, safe `href`s, and `totalRows` a non-negative integer.
 * Reports every problem, naming the column or row and cell.
 */
export function validateDetailData(
  data: unknown,
  subject = 'Detail data'
): Result<DetailData> {
  const problems: string[] = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return err(`${subject}: must be an object, got ${describeType(data)}.`);
  }
  const record = data as Readonly<Record<string, unknown>>;
  const columns: unknown = record['columns'];
  const rows: unknown = record['rows'];
  const keys = new Set<string>();
  let columnCount = 0;

  if (!Array.isArray(columns) || columns.length === 0) {
    problems.push(
      `columns must be a non-empty array, got ${describeType(columns)}.`
    );
  } else {
    columnCount = columns.length;
    columns.forEach((column: unknown, index: number) => {
      const at = `columns[${index}]`;
      if (typeof column !== 'object' || column === null) {
        problems.push(`${at} must be an object, got ${describeType(column)}.`);
        return;
      }
      const fields = column as Readonly<Record<string, unknown>>;
      const key: unknown = fields['key'];
      if (typeof key !== 'string' || key === '') {
        problems.push(`${at}.key must be a non-empty string.`);
      } else if (keys.has(key)) {
        problems.push(`${at}.key "${key}" is used by an earlier column.`);
      } else {
        keys.add(key);
      }
      if (typeof fields['label'] !== 'string') {
        problems.push(
          `${at}.label must be a string, got ${describeType(fields['label'])}.`
        );
      }
      for (const flag of ['numeric', 'sortable', 'filterable']) {
        const flagValue: unknown = fields[flag];
        if (flagValue !== undefined && typeof flagValue !== 'boolean') {
          problems.push(
            `${at}.${flag} must be a boolean, got ${describeType(flagValue)}.`
          );
        }
      }
    });
  }

  if (!Array.isArray(rows)) {
    problems.push(`rows must be an array, got ${describeType(rows)}.`);
  } else {
    rows.forEach((row: unknown, rowIndex: number) => {
      if (!Array.isArray(row)) {
        problems.push(
          `rows[${rowIndex}] must be an array of cells, got ${describeType(row)}.`
        );
        return;
      }
      if (columnCount > 0 && row.length !== columnCount) {
        problems.push(
          `rows[${rowIndex}] has ${row.length} cells but there are ${columnCount} columns.`
        );
      }
      row.forEach((cell: unknown, cellIndex: number) => {
        const at = `rows[${rowIndex}][${cellIndex}]`;
        if (typeof cell !== 'object' || cell === null) {
          problems.push(`${at} must be an object, got ${describeType(cell)}.`);
          return;
        }
        const fields = cell as Readonly<Record<string, unknown>>;
        if (typeof fields['text'] !== 'string') {
          problems.push(
            `${at}.text must be a string, got ${describeType(fields['text'])}.`
          );
        }
        const value: unknown = fields['value'];
        if (
          value !== undefined &&
          typeof value !== 'string' &&
          !(typeof value === 'number' && Number.isFinite(value))
        ) {
          problems.push(
            `${at}.value must be a string or a finite number, got ${describeType(value)}.`
          );
        }
        const href: unknown = fields['href'];
        if (href !== undefined) {
          if (typeof href !== 'string') {
            problems.push(
              `${at}.href must be a string, got ${describeType(href)}.`
            );
          } else if (!isSafeHref(href)) {
            problems.push(
              `${at}.href "${href}" is not allowed (only http, https, mailto and relative URLs).`
            );
          }
        }
      });
    });
  }

  const totalRows: unknown = record['totalRows'];
  if (
    totalRows !== undefined &&
    !(
      typeof totalRows === 'number' &&
      Number.isInteger(totalRows) &&
      totalRows >= 0
    )
  ) {
    problems.push(
      `totalRows must be a non-negative whole number, got ${describeType(totalRows)}.`
    );
  }

  if (problems.length > 0) {
    return err(`${subject}: ${problems.join(' ')}`);
  }
  return ok(data as DetailData);
}

/* Derived details --------------------------------------------------------- */

/**
 * The detail data for a widget whose card payload is already complete, so a
 * detail view needs no provider: a TABLE without a `footer` (a footer means
 * rows were left out) and a BAR_LIST. Returns undefined for everything else
 * (alert lists, gauges, KPIs, text and charts): those need a detail provider.
 */
export function deriveDetailData(
  data: WidgetData,
  locale?: Locale
): DetailData | undefined {
  if (data.kind === 'TABLE') {
    if (data.footer !== undefined) return undefined;
    return {
      columns: data.columns.map((column, index) => ({
        key: `c${index}`,
        label: column.label,
        ...(column.numeric === undefined ? {} : { numeric: column.numeric }),
      })),
      rows: data.rows,
    };
  }
  if (data.kind === 'BAR_LIST') {
    return {
      columns: [
        { key: 'label', label: 'Name' },
        { key: 'value', label: 'Value', numeric: true },
      ],
      rows: data.items.map((item) => [
        { text: item.label },
        {
          text: item.display ?? formatValue(item.value, 'number', { locale }),
          value: item.value,
        },
      ]),
    };
  }
  return undefined;
}
