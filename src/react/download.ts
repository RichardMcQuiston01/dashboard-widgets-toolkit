import type { DetailQuery } from '../core/detail.js';
import { exportFileName } from '../core/export.js';

/**
 * Hands a generated file to the browser as a download. The package builds the
 * text (see `widgetToCsv`); this is the one place that touches the DOM.
 */

/** Fields every generated file has. */
interface ExportFileBase {
  readonly widgetKey: string;
  /** The widget's title as shown. */
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
}

/** A CSV or SVG file: text. */
export interface TextExportFile extends ExportFileBase {
  readonly format: 'csv' | 'svg';
  readonly text: string;
}

/** A PNG file: bytes. */
export interface BinaryExportFile extends ExportFileBase {
  readonly format: 'png';
  readonly blob: Blob;
}

/** A file the dashboard has generated for the viewer. */
export type ExportFile = TextExportFile | BinaryExportFile;

/** The formats `exportFormats` accepts. CSV: tables, bar lists, charts; SVG and PNG: charts. */
export type ExportFormat = ExportFile['format'];

/** What the detail view asks your server for when server mode has more rows than the page. */
export interface DetailExportRequest {
  readonly widgetKey: string;
  readonly title: string;
  /** The viewer's search, filters and sort, from page 1, `pageSize` = `totalRows`. */
  readonly query: DetailQuery;
  /** Rows matching the query across all pages. */
  readonly totalRows: number;
}

/**
 * Gives a generated file to `onExport` when it is set, else to the browser.
 * Returns an error message, or null when it went through.
 */
export function deliverExportFile(
  file: ExportFile,
  onExport: ((file: ExportFile) => void) | undefined
): string | null {
  if (onExport === undefined) return downloadExportFile(file);
  try {
    onExport(file);
    return null;
  } catch (cause) {
    return `Could not export ${file.fileName}: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

/** A CSV `ExportFile` for a widget. */
export function csvExportFile(
  widgetKey: string,
  title: string,
  text: string
): TextExportFile {
  return {
    widgetKey,
    title,
    format: 'csv',
    fileName: exportFileName(title, 'csv'),
    mimeType: 'text/csv;charset=utf-8',
    text,
  };
}

/** An SVG `ExportFile` for a chart. */
export function svgExportFile(
  widgetKey: string,
  title: string,
  text: string
): TextExportFile {
  return {
    widgetKey,
    title,
    format: 'svg',
    fileName: exportFileName(title, 'svg'),
    mimeType: 'image/svg+xml;charset=utf-8',
    text,
  };
}

/** A PNG `ExportFile` for a chart. */
export function pngExportFile(
  widgetKey: string,
  title: string,
  blob: Blob
): BinaryExportFile {
  return {
    widgetKey,
    title,
    format: 'png',
    fileName: exportFileName(title, 'png'),
    mimeType: 'image/png',
    blob,
  };
}

/**
 * Downloads a file with a temporary object URL. Returns an error message
 * (never throws) when the browser blocks it or has no `URL.createObjectURL`.
 */
export function downloadExportFile(file: ExportFile): string | null {
  if (
    typeof document === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return `Could not download ${file.fileName}: this environment has no browser download support.`;
  }
  let url: string | undefined;
  try {
    url = URL.createObjectURL(
      file.format === 'png'
        ? file.blob
        : new Blob([file.text], { type: file.mimeType })
    );
    const link: HTMLAnchorElement = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.rel = 'noreferrer';
    document.body.append(link);
    link.click();
    link.remove();
    return null;
  } catch (cause) {
    return `Could not download ${file.fileName}: ${cause instanceof Error ? cause.message : String(cause)}`;
  } finally {
    if (url !== undefined) {
      const created: string = url;
      setTimeout(() => URL.revokeObjectURL(created), 0);
    }
  }
}
