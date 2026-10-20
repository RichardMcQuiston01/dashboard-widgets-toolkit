import {
  defineComponent,
  h,
  onErrorCaptured,
  ref,
  type VNode,
  type VNodeChild,
} from 'vue';

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

/** A `custom` column's cell: the formatter's output, or the text on failure. */
const FormattedCell = defineComponent(
  (props: FormattedCellProps) => {
    const settings = useWidgetSettings();
    const drawFailed = ref<boolean>(false);
    let reported: string | undefined;
    const report = (detail: string): void => {
      if (reported === detail) return;
      reported = detail;
      settings.value.onFormatterError?.(problemFor(props, detail));
    };
    // The formatter's returned elements failed while rendering.
    onErrorCaptured((error: unknown) => {
      drawFailed.value = true;
      report(
        `which failed while drawing: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    });
    return (): VNodeChild => {
      const formatter: CellFormatter | undefined =
        settings.value.formatters[props.formatter];
      if (formatter === undefined) {
        report('which is not registered');
        return props.cell.text;
      }
      let node: VNodeChild;
      try {
        node = formatter({
          widgetKey: props.widgetKey,
          columnKey: props.columnKey,
          text: props.cell.text,
          value: props.cell.value,
          row: props.row,
        });
      } catch (cause) {
        report(
          `which threw: ${cause instanceof Error ? cause.message : String(cause)}`
        );
        return props.cell.text;
      }
      if (drawFailed.value) return props.cell.text;
      return [
        h('span', { class: 'dwt-visually-hidden' }, props.cell.text),
        node,
      ];
    };
  },
  {
    name: 'FormattedCell',
    props: ['widgetKey', 'columnKey', 'formatter', 'cell', 'row'],
  }
);

/**
 * What a table cell contains: its text, a link, or what its column's field
 * type makes of it (`email`, `url`, `image`, `color`, `custom`). A cell with
 * its own `href` stays a link whatever the type. Anything a type can't use
 * falls back to the text.
 */
export const CellContent = defineComponent(
  (props: CellContentProps) => (): VNodeChild => {
    const { widgetKey, columnKey, column, cell, row } = props;
    if (cell.href !== undefined) {
      return h(
        WidgetLink,
        { href: cell.href, className: 'dwt-link' },
        () => cell.text
      );
    }
    const field: CellField =
      column === undefined ? { kind: 'text' } : cellField(column, cell);
    switch (field.kind) {
      case 'text':
        return cell.text;
      case 'email':
        return h('a', { href: field.href, class: 'dwt-link' }, cell.text);
      case 'url':
        return h(
          'a',
          {
            href: field.href,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'dwt-link',
          },
          [cell.text, h(NewTabIndicator)]
        );
      case 'image':
        return h('img', {
          class: 'dwt-cell-image',
          src: field.src,
          alt: cell.text,
          loading: 'lazy',
          decoding: 'async',
        });
      case 'color':
        return h('span', { class: 'dwt-cell-color' }, [
          h('span', {
            class: 'dwt-swatch',
            style: { backgroundColor: field.color },
            'aria-hidden': 'true',
          }),
          cell.text,
        ]);
      case 'custom':
        return h(FormattedCell, {
          widgetKey,
          columnKey,
          formatter: field.formatter,
          cell,
          row,
        }) as VNode;
    }
  },
  {
    name: 'CellContent',
    props: ['widgetKey', 'columnKey', 'column', 'cell', 'row'],
  }
);
