/**
 * Hands a generated file to the browser as a download. The package builds the
 * text (see `widgetToCsv`); this is the one place that touches the DOM.
 */

/** A file the dashboard has generated for the viewer. */
export interface ExportFile {
  readonly widgetKey: string;
  /** The widget's title as shown. */
  readonly title: string;
  readonly format: 'csv';
  readonly fileName: string;
  readonly mimeType: string;
  readonly text: string;
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
    url = URL.createObjectURL(new Blob([file.text], { type: file.mimeType }));
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
