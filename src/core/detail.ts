/**
 * Detail view, core part: the data and query types, sorting, filtering and
 * paging, query (de)serialisation for URLs, and validation. Pure functions;
 * nothing here renders, fetches or reads `location`. See
 * `docs/design/detail-view.md`.
 */

import type { WidgetDefinition } from './definition.js';
import {
  fieldCellProblem,
  fieldColumnProblems,
  type FieldColumn,
} from './fields.js';
import { formatValue, type Locale } from './format.js';
import type { TableWidgetData, WidgetData } from './payload.js';
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
  /**
   * Rows-per-page choices (each 1 to 200). Two or more adds a "Rows per page"
   * select to the detail view; `pageSize` is added to the list when missing.
   */
  readonly pageSizes?: readonly number[];
  /** Adds a "Columns" menu to show and hide columns. Default false. */
  readonly columnVisibility?: boolean;
}

/** `WidgetDetailOptions` with every default filled in. */
export interface ResolvedDetailOptions {
  readonly title: string;
  readonly pageSize: number;
  readonly mode: DetailMode;
  /** Sorted, unique and including `pageSize`; empty when there is no choice. */
  readonly pageSizes: readonly number[];
  readonly columnVisibility: boolean;
}

/** The `tableControls` setting on a widget definition. `true` means both. */
export interface WidgetTableControls {
  /** A search box over every column. Default true. */
  readonly search?: boolean;
  /** Sortable column headers. Default true. */
  readonly sort?: boolean;
}

/** `WidgetTableControls` with every default filled in. */
export interface ResolvedTableControls {
  readonly search: boolean;
  readonly sort: boolean;
}

export interface DetailColumn extends FieldColumn {
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
  /**
   * Keys of columns the viewer hid. Display only: rows are still filtered,
   * sorted and searched across every column, and a server-mode provider is
   * not sent this. CSV exports leave these columns out.
   */
  readonly hidden?: readonly string[];
}

/** What a detail provider receives beyond the usual arguments. */
export interface DetailProviderOptions extends Omit<ProviderOptions, 'view'> {
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
  const pageSize: number = options.pageSize ?? DEFAULT_DETAIL_PAGE_SIZE;
  const choices: readonly number[] = options.pageSizes ?? [];
  return {
    title: options.title ?? definition.title,
    pageSize,
    mode: options.mode ?? 'client',
    pageSizes:
      choices.length < 2
        ? []
        : [...new Set([...choices, pageSize])].sort((a, b) => a - b),
    columnVisibility: options.columnVisibility === true,
  };
}

/**
 * Reads `definition.tableControls` with defaults; undefined when the widget
 * has none (or both are turned off).
 */
export function resolveTableControls(
  definition: Pick<WidgetDefinition, 'tableControls'>
): ResolvedTableControls | undefined {
  const setting: boolean | WidgetTableControls | undefined =
    definition.tableControls;
  if (setting === undefined || setting === false) return undefined;
  const options: WidgetTableControls = setting === true ? {} : setting;
  const resolved: ResolvedTableControls = {
    search: options.search ?? true,
    sort: options.sort ?? true,
  };
  return resolved.search || resolved.sort ? resolved : undefined;
}

/** The first page, unsorted and unfiltered. */
export function defaultDetailQuery(
  pageSize: number = DEFAULT_DETAIL_PAGE_SIZE
): DetailQuery {
  return { page: 1, pageSize };
}

/** `query` without `hidden`: what a server-mode provider is asked for. */
export function providerQuery(query: DetailQuery): DetailQuery {
  const { hidden: _hidden, ...rest } = query;
  return rest;
}

/** Indexes of the columns of `data` that `query.hidden` does not hide. */
export function visibleColumnIndexes(
  data: Pick<DetailData, 'columns'>,
  hidden: readonly string[] | undefined
): number[] {
  const hiddenKeys = new Set<string>(hidden ?? []);
  const indexes: number[] = [];
  for (const [index, column] of data.columns.entries()) {
    if (!hiddenKeys.has(column.key)) indexes.push(index);
  }
  return indexes;
}

/**
 * `data` without the columns named in `hidden`, in every row. Returns `data`
 * itself when nothing is hidden. Unknown keys are ignored.
 */
export function hideColumns(
  data: DetailData,
  hidden: readonly string[] | undefined
): DetailData {
  const indexes: number[] = visibleColumnIndexes(data, hidden);
  if (indexes.length === data.columns.length) return data;
  const pick = <T>(items: readonly T[]): T[] =>
    indexes.flatMap((index) => {
      const item: T | undefined = items[index];
      return item === undefined ? [] : [item];
    });
  return {
    ...data,
    columns: pick(data.columns),
    rows: data.rows.map((row) => pick(row)),
  };
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

/**
 * The page a server-mode provider answered: `data.rows` is already the
 * requested page, so nothing is filtered, sorted or sliced. `totalRows` is
 * required (it drives the page count and the "Showing 1-25 of 312" line).
 * The page number is the requested one clamped into range; when it differs
 * from `query.page` the rows belong to a page that no longer exists (data
 * shrank), and `clampServerQuery` gives the query to ask again with.
 */
export function serverPage(
  data: DetailData,
  query: DetailQuery
): Result<DetailPage> {
  const totalRows: number | undefined = data.totalRows;
  if (totalRows === undefined) {
    return err(
      'Detail data: server mode needs totalRows (the rows matching the query across all pages), but the provider did not return it.'
    );
  }
  const pageSize: number = Math.max(1, Math.floor(query.pageSize));
  const pageCount: number = Math.max(1, Math.ceil(totalRows / pageSize));
  const page: number = Math.min(Math.max(1, Math.floor(query.page)), pageCount);
  return ok({ rows: data.rows, totalRows, page, pageCount });
}

/**
 * For server mode: the query to ask again with when `query.page` is past the
 * last page of `data` (rows were deleted, or a filter narrowed the result).
 * Undefined when the page is fine.
 */
export function clampServerQuery(
  data: DetailData,
  query: DetailQuery
): DetailQuery | undefined {
  const result: Result<DetailPage> = serverPage(data, query);
  if (!result.ok || result.value.page === query.page) return undefined;
  return { ...query, page: result.value.page };
}

function listKeys(data: DetailData): string {
  return data.columns.map((column) => `"${column.key}"`).join(', ');
}

/* URL query strings ------------------------------------------------------ */

const FILTER_PREFIX = 'f.';

/**
 * The query as a URL query string without the leading `?`: `q` (search),
 * `sort` (`column:asc|desc`), `page`, `f.<column>` filters, `hide` (hidden
 * column keys, comma separated) and `size` (rows per page) when it differs
 * from `defaultPageSize` (the widget definition's, which is left out).
 * Defaults are left out.
 */
export function serializeDetailQuery(
  query: DetailQuery,
  defaultPageSize: number = query.pageSize
): string {
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
  if (query.pageSize !== defaultPageSize) add('size', String(query.pageSize));
  if (query.hidden !== undefined && query.hidden.length > 0) {
    add('hide', query.hidden.map(encodeURIComponent).join(','));
  }
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
  data?: Pick<DetailData, 'columns'>,
  allowed: ParseDetailAllowed = {}
): Result<DetailQuery> {
  let size: number = pageSize;
  let hidden: string[] = [];
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
    } else if (key === 'size') {
      if (!/^[1-9]\d*$/.test(value) || Number(value) > MAX_DETAIL_PAGE_SIZE) {
        return err(
          `Detail query: size must be a whole number from 1 to ${MAX_DETAIL_PAGE_SIZE}, got "${value}".`
        );
      }
      const choices: readonly number[] | undefined = allowed.pageSizes;
      if (choices === undefined || choices.includes(Number(value))) {
        size = Number(value);
      } else if (choices.length > 0) {
        return err(
          `Detail query: size ${value} is not one of the page sizes the widget offers (${choices.join(', ')}).`
        );
      }
    } else if (key === 'hide') {
      if (allowed.columnVisibility === false) continue;
      hidden = value === '' ? [] : value.split(',').map(decodeKey);
      const unknown: string | undefined =
        columnKeys === undefined
          ? undefined
          : hidden.find((column) => !columnKeys.has(column));
      if (unknown !== undefined) {
        return err(`Detail query: hide column "${unknown}" does not exist.`);
      }
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
    ...(hidden.length === 0 ? {} : { hidden }),
    page,
    pageSize: size,
  });
}

/** What a widget allows, so `parseDetailQuery` can refuse the rest. */
export interface ParseDetailAllowed {
  /**
   * The offered page sizes. Undefined accepts any size from 1 to 200; an empty
   * list ignores `size` (the widget has no page-size choice).
   */
  readonly pageSizes?: readonly number[];
  /** False ignores `hide` (the widget has no column menu). Default true. */
  readonly columnVisibility?: boolean;
}

function decodeKey(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/* Deep links ------------------------------------------------------------- */

/** The URL parameter that names the widget whose detail view is open. */
export const DETAIL_LINK_PARAM = 'widget';

/** Which detail view is open, and what it shows: what a deep link carries. */
export interface DetailLink {
  /** The widget's key (a clone's key works too). */
  readonly key: string;
  readonly query: DetailQuery;
  /**
   * The widget's own page size. `serializeDetailLink` writes `size` only when
   * `query.pageSize` differs from it; without it, `size` is never written.
   */
  readonly defaultPageSize?: number;
}

/**
 * The open detail view as a URL query string without the leading `?`:
 * `widget=<key>` followed by the query parameters of `serializeDetailQuery`
 * (`q`, `sort`, `f.<column>`, `page`). An empty string for no link. The page
 * size is not included: the widget definition owns it.
 */
export function serializeDetailLink(
  link: DetailLink | null | undefined
): string {
  if (link === null || link === undefined) return '';
  const query: string = serializeDetailQuery(
    link.query,
    link.defaultPageSize ?? link.query.pageSize
  );
  const widget = `${encodeURIComponent(DETAIL_LINK_PARAM)}=${encodeURIComponent(link.key)}`;
  return query === '' ? widget : `${widget}&${query}`;
}

function isDetailParam(rawKey: string): boolean {
  let key: string;
  try {
    key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
  } catch {
    return false;
  }
  return (
    key === DETAIL_LINK_PARAM ||
    key === 'q' ||
    key === 'sort' ||
    key === 'page' ||
    key === 'size' ||
    key === 'hide' ||
    key.startsWith(FILTER_PREFIX)
  );
}

/**
 * Puts `link` into an existing query string, replacing any detail parameters
 * it already has and keeping everything else (your own `tab=...`), so a page
 * can share its URL with the detail view. With no link, the detail parameters
 * are removed. Returns a query string without the leading `?`.
 */
export function withDetailLink(
  queryString: string,
  link: DetailLink | null | undefined
): string {
  const text: string = queryString.startsWith('?')
    ? queryString.slice(1)
    : queryString;
  const kept: string[] = text.split('&').filter((pair) => {
    if (pair === '') return false;
    const equals: number = pair.indexOf('=');
    return !isDetailParam(equals < 0 ? pair : pair.slice(0, equals));
  });
  const detail: string = serializeDetailLink(link);
  return [...kept, ...(detail === '' ? [] : [detail])].join('&');
}

/**
 * Reads the open detail view from a query string (with or without the leading
 * `?`). Ok with `undefined` when there is no `widget` parameter. Fails, with a
 * message naming the widget or parameter, when the widget is not one of
 * `definitions`, has no detail view, or a query parameter is malformed. The
 * page size comes from the widget's `detail` setting. Column keys are not
 * checked (the data is not loaded yet): use `sanitizeDetailQuery` once it is.
 */
export function parseDetailLink(
  queryString: string,
  definitions: readonly Pick<WidgetDefinition, 'key' | 'title' | 'detail'>[]
): Result<DetailLink | undefined> {
  const text: string = queryString.startsWith('?')
    ? queryString.slice(1)
    : queryString;
  let key: string | undefined;
  for (const pair of text.split('&')) {
    const equals: number = pair.indexOf('=');
    const rawKey: string = equals < 0 ? pair : pair.slice(0, equals);
    let name: string;
    try {
      name = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {
      continue;
    }
    if (name !== DETAIL_LINK_PARAM) continue;
    try {
      key = decodeURIComponent(
        (equals < 0 ? '' : pair.slice(equals + 1)).replace(/\+/g, ' ')
      );
    } catch {
      return err(
        `Detail link: "${pair}" is not valid percent-encoding in the URL.`
      );
    }
    break;
  }
  if (key === undefined) return ok(undefined);
  if (key === '') {
    return err(`Detail link: the "${DETAIL_LINK_PARAM}" parameter is empty.`);
  }
  const definition:
    Pick<WidgetDefinition, 'key' | 'title' | 'detail'> | undefined =
    definitions.find((candidate) => candidate.key === key);
  if (definition === undefined) {
    return err(
      `Detail link: widget "${key}" does not exist. Widgets: ${definitions.map((d) => `"${d.key}"`).join(', ')}.`
    );
  }
  const options: ResolvedDetailOptions | undefined =
    resolveDetailOptions(definition);
  if (options === undefined) {
    return err(
      `Detail link: widget "${key}" has no detail view (set detail on its definition).`
    );
  }
  const query: Result<DetailQuery> = parseDetailQuery(
    text,
    options.pageSize,
    undefined,
    {
      pageSizes: options.pageSizes,
      columnVisibility: options.columnVisibility,
    }
  );
  return query.ok
    ? ok({ key, query: query.value, defaultPageSize: options.pageSize })
    : query;
}

/**
 * Drops what the loaded data cannot honor: filters on unknown columns, a
 * sort on an unknown or unsortable column, unknown hidden columns, and a
 * `hidden` list that would hide every column. Returns the same object when
 * nothing needs dropping. For queries that came from a URL.
 */
export function sanitizeDetailQuery(
  query: DetailQuery,
  columns: readonly Pick<DetailColumn, 'key' | 'sortable'>[]
): DetailQuery {
  const known = new Map<string, Pick<DetailColumn, 'key' | 'sortable'>>(
    columns.map((column) => [column.key, column])
  );
  const filterKeys: string[] = Object.keys(query.filters ?? {});
  const goodFilters: string[] = filterKeys.filter((key) => known.has(key));
  const sortColumn: Pick<DetailColumn, 'key' | 'sortable'> | undefined =
    query.sort === undefined ? undefined : known.get(query.sort.column);
  const sortOk: boolean =
    query.sort === undefined ||
    (sortColumn !== undefined && sortColumn.sortable !== false);
  const hiddenKeys: readonly string[] = query.hidden ?? [];
  const goodHidden: string[] = hiddenKeys.filter((key) => known.has(key));
  const hiddenOk: boolean =
    goodHidden.length === hiddenKeys.length && goodHidden.length < known.size;
  if (goodFilters.length === filterKeys.length && sortOk && hiddenOk) {
    return query;
  }
  const { filters: _filters, sort: _sort, hidden: _hidden, ...rest } = query;
  return {
    ...rest,
    ...(goodHidden.length === 0 || goodHidden.length >= known.size
      ? {}
      : { hidden: goodHidden }),
    ...(goodFilters.length === 0
      ? {}
      : {
          filters: Object.fromEntries(
            goodFilters.map((key) => [key, (query.filters ?? {})[key] ?? ''])
          ),
        }),
    ...(sortOk && query.sort !== undefined ? { sort: query.sort } : {}),
  };
}

/* Validation ------------------------------------------------------------- */

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export interface ValidateDetailOptions {
  /**
   * `server`: also requires `totalRows`, no more rows than `totalRows`, and
   * (with `pageSize`) no more rows than one page. Default `client`.
   */
  readonly mode?: DetailMode;
  readonly pageSize?: number;
}

/**
 * Checks data from a detail provider: unique non-empty column keys, labels,
 * every row as long as `columns`, cell `text` strings, `value` a string or
 * finite number, safe `href`s, and `totalRows` a non-negative integer.
 * Reports every problem, naming the column or row and cell. In server mode
 * (`options.mode`) it also checks that the provider answered with one page.
 */
export function validateDetailData(
  data: unknown,
  subject = 'Detail data',
  options: ValidateDetailOptions = {}
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
      problems.push(...fieldColumnProblems(fields, at));
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
        const column: unknown = Array.isArray(columns)
          ? columns[cellIndex]
          : undefined;
        if (
          typeof column === 'object' &&
          column !== null &&
          typeof fields['text'] === 'string'
        ) {
          const fieldProblem: string | undefined = fieldCellProblem(
            column as FieldColumn,
            {
              text: fields['text'],
              ...(typeof value === 'string' || typeof value === 'number'
                ? { value }
                : {}),
            },
            at
          );
          if (fieldProblem !== undefined) problems.push(fieldProblem);
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

  if (options.mode === 'server') {
    if (totalRows === undefined) {
      problems.push(
        'server mode needs totalRows (the rows matching the query across all pages).'
      );
    } else if (typeof totalRows === 'number' && Array.isArray(rows)) {
      if (rows.length > totalRows) {
        problems.push(
          `totalRows is ${totalRows} but ${rows.length} rows were returned.`
        );
      }
      if (options.pageSize !== undefined && rows.length > options.pageSize) {
        problems.push(
          `server mode must return one page: ${rows.length} rows came back for a page size of ${options.pageSize} (honor query.page and query.pageSize).`
        );
      }
    }
  }

  if (problems.length > 0) {
    return err(`${subject}: ${problems.join(' ')}`);
  }
  return ok(data as DetailData);
}

/* Derived details --------------------------------------------------------- */

/**
 * A TABLE's columns and rows as detail data (column keys `c0`, `c1`, ...),
 * footer ignored, so the table can be searched and sorted with `queryRows`.
 */
export function tableDetailData(data: TableWidgetData): DetailData {
  return {
    columns: data.columns.map((column, index) => ({
      key: `c${index}`,
      label: column.label,
      ...(column.numeric === undefined ? {} : { numeric: column.numeric }),
      ...(column.type === undefined ? {} : { type: column.type }),
      ...(column.formatter === undefined
        ? {}
        : { formatter: column.formatter }),
    })),
    rows: data.rows,
  };
}

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
    return data.footer === undefined ? tableDetailData(data) : undefined;
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
