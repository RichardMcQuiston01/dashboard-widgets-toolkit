import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';

import { cellField, type CellField, type FieldColumn } from '../core/fields.js';
import type { TableCell } from '../core/payload.js';
import { NewTabIndicator, WidgetLink } from './primitives.js';
import {
  useWidgetSettings,
  type CellFormatter,
  type CellFormatterProblem,
} from './settings.js';

export interface CellContentProps {
  /** The widget's key for the formatter and its problem report; may be empty. */
  readonly widgetKey: string;
  /** `c0`, `c1`, ... */
  readonly columnKey: string;
  readonly column: FieldColumn | undefined;
  readonly cell: TableCell;
  readonly row: readonly TableCell[];
}

/**
 * What a table cell contains: its text, a link, or what its column's field
 * type makes of it (`email`, `url`, `image`, `color`, `custom`). A cell with
 * its own `href` stays a link whatever the type. Anything a type can't use
 * falls back to the text.
 */
export function CellContent({
  widgetKey,
  columnKey,
  column,
  cell,
  row,
}: CellContentProps): ReactNode {
  if (cell.href !== undefined) {
    return (
      <WidgetLink href={cell.href} className="dwt-link">
        {cell.text}
      </WidgetLink>
    );
  }
  const field: CellField =
    column === undefined ? { kind: 'text' } : cellField(column, cell);
  switch (field.kind) {
    case 'text':
      return cell.text;
    case 'email':
      return (
        <a href={field.href} className="dwt-link">
          {cell.text}
        </a>
      );
    case 'url':
      return (
        <a
          href={field.href}
          target="_blank"
          rel="noopener noreferrer"
          className="dwt-link"
        >
          {cell.text}
          <NewTabIndicator />
        </a>
      );
    case 'image':
      return (
        <img
          className="dwt-cell-image"
          src={field.src}
          alt={cell.text}
          loading="lazy"
          decoding="async"
        />
      );
    case 'color':
      return (
        <span className="dwt-cell-color">
          <span
            className="dwt-swatch"
            style={{ backgroundColor: field.color }}
            aria-hidden="true"
          />
          {cell.text}
        </span>
      );
    case 'custom':
      return (
        <FormattedCell
          widgetKey={widgetKey}
          columnKey={columnKey}
          formatter={field.formatter}
          cell={cell}
          row={row}
        />
      );
  }
}

interface FormattedCellProps {
  readonly widgetKey: string;
  readonly columnKey: string;
  readonly formatter: string;
  readonly cell: TableCell;
  readonly row: readonly TableCell[];
}

function problemFor(
  props: FormattedCellProps,
  detail: string
): CellFormatterProblem {
  const where: string =
    props.widgetKey === '' ? 'table' : `widget "${props.widgetKey}"`;
  return {
    widgetKey: props.widgetKey,
    columnKey: props.columnKey,
    formatter: props.formatter,
    message: `The ${where} column ${props.columnKey} uses the formatter "${props.formatter}", ${detail}; its cells show their text.`,
  };
}

/** Catches a formatter's returned elements failing to render. */
class FormatterBoundary extends Component<
  {
    readonly props: FormattedCellProps;
    readonly report: ((problem: CellFormatterProblem) => void) | undefined;
    readonly children: ReactNode;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.report?.(
      problemFor(
        this.props.props,
        `which failed while drawing: ${error.message}`
      )
    );
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.props.cell.text : this.props.children;
  }
}

function FormattedCell(props: FormattedCellProps): ReactNode {
  const { formatters, onFormatterError } = useWidgetSettings();
  const formatter: CellFormatter | undefined = formatters[props.formatter];
  let node: ReactNode = null;
  let failure: string | undefined;
  if (formatter === undefined) {
    failure = 'which is not registered';
  } else {
    try {
      node = formatter({
        widgetKey: props.widgetKey,
        columnKey: props.columnKey,
        text: props.cell.text,
        value: props.cell.value,
        row: props.row,
      });
    } catch (cause) {
      failure = `which threw: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }
  useEffect(() => {
    if (failure !== undefined) {
      onFormatterError?.(problemFor(props, failure));
    }
    // The problem is reported once per failure, not on every render.
  }, [failure, props.widgetKey, props.columnKey, props.formatter]);
  if (failure !== undefined) return props.cell.text;
  return (
    <FormatterBoundary props={props} report={onFormatterError}>
      <span className="dwt-visually-hidden">{props.cell.text}</span>
      {node}
    </FormatterBoundary>
  );
}
