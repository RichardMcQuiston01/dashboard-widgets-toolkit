/**
 * What a viewer picked inside a widget: a table row, a bar, an alert, or a
 * position on a chart. Plain JSON-friendly data, so an app can route on it,
 * open its own detail page or filter other widgets. The renderers report it
 * through `onSelect`; the package never decides what a selection does.
 */

import type {
  AlertListItem,
  BarListItem,
  TableCell,
  WidgetKind,
} from './payload.js';

/** One chart position (a month, a day) with every series' value there. */
export interface PointSelection {
  readonly type: 'point';
  /** Position along the x axis, from 0. */
  readonly index: number;
  /** The x label at that position. */
  readonly label: string;
  readonly values: readonly {
    readonly series: string;
    readonly value: number | null;
  }[];
}

export type SelectionTarget =
  | {
      readonly type: 'row';
      /** Index in the payload's `rows`, whatever the table is sorted or filtered by. */
      readonly index: number;
      readonly cells: readonly TableCell[];
    }
  | {
      readonly type: 'bar';
      readonly index: number;
      readonly item: BarListItem;
    }
  | {
      readonly type: 'alert';
      readonly index: number;
      readonly item: AlertListItem;
    }
  | PointSelection;

/** A selection with the widget it came from. */
export interface WidgetSelection {
  /** The widget's key (a clone's own key for a clone). */
  readonly widgetKey: string;
  readonly kind: WidgetKind;
  readonly target: SelectionTarget;
}
