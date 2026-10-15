/**
 * CSV export for tables, bar lists, charts and the detail view. Pure string
 * building: the package never downloads or stores anything. A host (or the
 * React "Download CSV" button) hands the string to the browser or a server
 * response. See docs/design/export.md.
 */

import type { DetailCell, DetailColumn, DetailData } from './detail.js';
import { deriveDetailData, tableDetailData } from './detail.js';
import type { WidgetData } from './payload.js';
import { err, ok, type Result } from './result.js';

export interface CsvOptions {
  /** Field separator. Default `,`; use `;` for locales that write `1,5`. */
  readonly delimiter?: ',' | ';' | '\t';
  /** Row separator. Default `\r\n` (RFC 4180). */
  readonly newline?: '\r\n' | '\n';
  /**
   * What each cell exports: `'text'` (default) is what the viewer sees,
   * "$1,234.00"; `'value'` is the sort value behind it, 1234, when there is
   * one, so a spreadsheet can calculate.
   */
  readonly cells?: 'text' | 'value';
  /**
   * Prefix a `'` to text that a spreadsheet would run as a formula (starting
   * with `=`, `+`, `-`, `@`, a tab or a carriage return). Default true. Plain
   * numbers such as `-5` are left alone. Turn off only for data you trust.
   */
  readonly neutralizeFormulas?: boolean;
  /** Start with a UTF-8 byte order mark so Excel reads accents. Default false. */
  readonly byteOrderMark?: boolean;
}

const BYTE_ORDER_MARK: string = String.fromCharCode(0xfeff);
const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

function cellText(
  cell: DetailCell,
  mode: 'text' | 'value',
  neutralize: boolean
): string {
  if (mode === 'value' && typeof cell.value === 'number') {
    return String(cell.value);
  }
  const raw: string =
    mode === 'value' && cell.value !== undefined
      ? String(cell.value)
      : cell.text;
  return neutralize && FORMULA_START.test(raw) && !PLAIN_NUMBER.test(raw)
    ? `'${raw}`
    : raw;
}

function field(text: string, delimiter: string): string {
  return /["\r\n]/.test(text) || text.includes(delimiter)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/**
 * Detail data as CSV: a header of column labels, then one line per row.
 * Fields containing the delimiter, a quote or a line break are quoted.
 */
export function detailToCsv(
  data: DetailData,
  options: CsvOptions = {}
): Result<string> {
  const delimiter: string = options.delimiter ?? ',';
  const newline: string = options.newline ?? '\r\n';
  const mode: 'text' | 'value' = options.cells ?? 'text';
  const neutralize: boolean = options.neutralizeFormulas !== false;
  const columns: readonly DetailColumn[] = data.columns;
  if (columns.length === 0) {
    return err('Cannot export CSV: the data has no columns.');
  }
  const lines: string[] = [
    columns
      .map((column) =>
        field(cellText({ text: column.label }, 'text', neutralize), delimiter)
      )
      .join(delimiter),
  ];
  for (const [rowIndex, row] of data.rows.entries()) {
    if (row.length !== columns.length) {
      return err(
        `Cannot export CSV: row ${rowIndex + 1} has ${row.length} cells but there are ${columns.length} columns.`
      );
    }
    lines.push(
      row
        .map((cell) => field(cellText(cell, mode, neutralize), delimiter))
        .join(delimiter)
    );
  }
  const body: string = lines.join(newline) + newline;
  return ok(options.byteOrderMark === true ? BYTE_ORDER_MARK + body : body);
}

/**
 * A widget's card data as CSV, the same table its "View as table" shows: a
 * TABLE (its rows, footer left out), a BAR_LIST (name and value) or a GRAPH
 * (the x label and one column per series). Other kinds have nothing tabular
 * and return an error that names the kind.
 */
export function widgetToCsv(
  data: WidgetData,
  options: CsvOptions = {}
): Result<string> {
  if (data.kind === 'GRAPH') {
    const first = data.series[0];
    if (first === undefined) {
      return err('Cannot export CSV: the chart has no series.');
    }
    return detailToCsv(
      {
        columns: [
          { key: 'x', label: data.xLabel ?? 'Label' },
          ...data.series.map((series, index) => ({
            key: `s${index}`,
            label: series.name,
            numeric: true,
          })),
        ],
        rows: first.points.map((point, pointIndex) => [
          { text: point.label },
          ...data.series.map((series) => {
            const value: number | undefined = series.points[pointIndex]?.value;
            return value === undefined
              ? { text: '' }
              : { text: String(value), value };
          }),
        ]),
      },
      options
    );
  }
  const detail: DetailData | undefined =
    data.kind === 'TABLE' ? tableDetailData(data) : deriveDetailData(data);
  if (detail === undefined) {
    return err(
      `Cannot export CSV: a ${data.kind} widget has no rows. Export works for TABLE, BAR_LIST and GRAPH.`
    );
  }
  return detailToCsv(detail, options);
}

/**
 * A safe download name: the title lowercased, runs of other characters
 * replaced by `-`, then an optional ISO date and the extension. Always a
 * valid name, "export" when the title has no letters or digits.
 */
export function exportFileName(
  title: string,
  extension: 'csv' | 'svg' | 'png',
  date?: string
): string {
  const slug: string = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const stamp: string =
    date !== undefined && /^\d{4}-\d{2}-\d{2}/.test(date)
      ? `-${date.slice(0, 10)}`
      : '';
  return `${slug === '' ? 'export' : slug}${stamp}.${extension}`;
}
