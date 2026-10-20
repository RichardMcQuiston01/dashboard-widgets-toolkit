import {
  defineComponent,
  h,
  useId,
  type CSSProperties,
  type VNode,
  type VNodeChild,
} from 'vue';

import type { WidgetFill, WidgetSize } from '../core/definition.js';
import { resolveTableControls } from '../core/detail.js';
import { widgetToCsv } from '../core/export.js';
import { fillsHeight, fillsWidth } from '../core/grid.js';
import { sortFromOptions } from '../core/options.js';
import type { DashboardWidget } from '../core/resolve.js';
import type { SelectionTarget, WidgetSelection } from '../core/select.js';
import { chartToSvg, svgToPng } from '../react/chart-export.js';
import {
  csvExportFile,
  deliverExportFile,
  pngExportFile,
  svgExportFile,
  type ExportFile,
  type ExportFormat,
} from '../react/download.js';
import { FreshnessLine, RefreshButton } from './freshness.js';
import { WidgetContent } from './renderers.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface WidgetCardProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly minimized?: boolean | undefined;
  /** Shows the minimize/expand toggle when given. */
  readonly onToggleMinimized?: (() => void) | undefined;
  /**
   * Opens the widget's detail view. Adds a "View" icon button to the header
   * actions and makes the title clickable.
   */
  readonly onView?: (() => void) | undefined;
  /** Default 'ok', which renders the default slot. */
  readonly status?: 'ok' | 'loading' | 'empty' | 'error' | undefined;
  readonly emptyText?: string | undefined;
  readonly error?: string | undefined;
  /** Shows a Retry button on the error state when given. */
  readonly onRetry?: (() => void) | undefined;
  readonly size?: WidgetSize | undefined;
  /** Fill free space in the grid row (height, width or both). */
  readonly fill?: WidgetFill | undefined;
  /** Explicit grid column span, to give a width-filling card the columns left over. */
  readonly columnSpan?: number | undefined;
  /** 12-column width (see `WidgetDefinition.width`); sets `--dwt-width`. */
  readonly width?: number | undefined;
  /** Rendered as `data-widget-key` so `useWidgets` can tell which card is in view. */
  readonly widgetKey?: string | undefined;
  /** The author's title, rendered as `data-dwt-default-title`. */
  readonly defaultTitle?: string | undefined;
  /** Marks the card as being edited (dashed outline). */
  readonly editing?: boolean | undefined;
  /** 2 to 6; default 2. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined;
  readonly className?: string | undefined;
  /** Extra inline style, merged after the width and span. */
  readonly style?: CSSProperties | undefined;
}

const CARD_PROPS: (keyof WidgetCardProps)[] = [
  'title',
  'description',
  'minimized',
  'onToggleMinimized',
  'onView',
  'status',
  'emptyText',
  'error',
  'onRetry',
  'size',
  'fill',
  'columnSpan',
  'width',
  'widgetKey',
  'defaultTitle',
  'editing',
  'headingLevel',
  'className',
  'style',
];

/**
 * The frame every widget sits in: title, optional description and actions,
 * a minimize toggle, and loading, empty and error states. Slots: the default
 * slot is the body, `actions` adds header controls before the minimize toggle,
 * and `footer` sits under the body.
 */
export const WidgetCard = defineComponent(
  (props: WidgetCardProps, { slots }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const id: string = useId();
    return (): VNode => {
      const { labels } = settings.value;
      const {
        title,
        description,
        onToggleMinimized,
        onView,
        emptyText,
        error,
        onRetry,
        size,
        fill,
        columnSpan,
        width,
        widgetKey,
        defaultTitle,
        className,
        style,
      } = props;
      const minimized: boolean = props.minimized ?? false;
      const status = props.status ?? 'ok';
      const editing: boolean = props.editing ?? false;
      const headingLevel = props.headingLevel ?? 2;
      const bodyId = `${id}-body`;

      let body: VNodeChild;
      switch (status) {
        case 'loading':
          body = h(
            'p',
            { role: 'status', class: slot('status', 'dwt-status') },
            labels.loading
          );
          break;
        case 'empty':
          body = h('p', { class: slot('empty', 'dwt-empty') }, emptyText ?? '');
          break;
        case 'error':
          body = h(
            'div',
            { role: 'alert', class: slot('error', 'dwt-error') },
            [
              h('p', { class: 'dwt-error-message' }, error ?? ''),
              onRetry === undefined
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      class: slot('button', 'dwt-button'),
                      onClick: onRetry,
                    },
                    labels.retry
                  ),
            ]
          );
          break;
        case 'ok':
          body = slots['default']?.();
          break;
      }

      const actions: VNodeChild[] | undefined = slots['actions']?.();
      const toggleLabel: string = minimized
        ? labels.expand(title)
        : labels.minimize(title);
      const footer: VNodeChild[] | undefined = slots['footer']?.();
      const hasStyle: boolean =
        columnSpan !== undefined || width !== undefined || style !== undefined;

      return h(
        'section',
        {
          'aria-labelledby': `${id}-title`,
          class: slot(
            'card',
            'dwt-card',
            `dwt-card--${status}`,
            minimized && 'dwt-card--minimized',
            editing && 'dwt-card--editing',
            size !== undefined && `dwt-card--size-${size}`,
            fillsHeight(fill) && 'dwt-card--fill-height',
            fillsWidth(fill) && 'dwt-card--fill-width',
            className
          ),
          ...(widgetKey === undefined ? {} : { 'data-widget-key': widgetKey }),
          ...(defaultTitle === undefined
            ? {}
            : { 'data-dwt-default-title': defaultTitle }),
          ...(hasStyle
            ? {
                style: {
                  ...(width === undefined ? {} : { '--dwt-width': width }),
                  ...(columnSpan === undefined
                    ? {}
                    : { gridColumn: `span ${columnSpan}` }),
                  ...style,
                },
              }
            : {}),
        },
        [
          h('header', { class: slot('cardHeader', 'dwt-card-header') }, [
            h('div', { class: 'dwt-card-heading' }, [
              h(
                `h${headingLevel}`,
                {
                  id: `${id}-title`,
                  class: slot('cardTitle', 'dwt-card-title'),
                },
                onView === undefined
                  ? title
                  : [
                      h(
                        'button',
                        {
                          type: 'button',
                          tabindex: -1,
                          class: 'dwt-card-title-button',
                          onClick: onView,
                        },
                        title
                      ),
                    ]
              ),
              description !== undefined && !minimized
                ? h(
                    'p',
                    { class: slot('cardDescription', 'dwt-card-description') },
                    description
                  )
                : null,
            ]),
            actions !== undefined ||
            onToggleMinimized !== undefined ||
            onView !== undefined
              ? h('div', { class: slot('cardActions', 'dwt-card-actions') }, [
                  onView === undefined
                    ? null
                    : h(
                        'button',
                        {
                          type: 'button',
                          class: slot(
                            'button',
                            'dwt-button',
                            'dwt-icon-button'
                          ),
                          'aria-label': labels.view(title),
                          title: labels.view(title),
                          onClick: onView,
                        },
                        [
                          h(
                            'svg',
                            {
                              viewBox: '0 0 16 16',
                              width: '16',
                              height: '16',
                              'aria-hidden': 'true',
                              focusable: 'false',
                            },
                            [
                              h('path', {
                                d: 'M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z',
                                fill: 'none',
                                stroke: 'currentColor',
                                'stroke-width': '1.4',
                                'stroke-linejoin': 'round',
                              }),
                              h('circle', {
                                cx: '8',
                                cy: '8',
                                r: '2.1',
                                fill: 'currentColor',
                              }),
                            ]
                          ),
                        ]
                      ),
                  actions,
                  onToggleMinimized === undefined
                    ? null
                    : h(
                        'button',
                        {
                          type: 'button',
                          class: slot(
                            'button',
                            'dwt-button',
                            'dwt-icon-button'
                          ),
                          'aria-expanded': !minimized,
                          'aria-controls': bodyId,
                          'aria-label': toggleLabel,
                          title: toggleLabel,
                          onClick: onToggleMinimized,
                        },
                        [
                          h(
                            'span',
                            { 'aria-hidden': 'true' },
                            minimized ? '▸' : '▾'
                          ),
                        ]
                      ),
                ])
              : null,
          ]),
          h(
            'div',
            {
              id: bodyId,
              class: slot('cardBody', 'dwt-card-body'),
              hidden: minimized,
            },
            minimized ? undefined : (body ?? undefined)
          ),
          footer !== undefined && !minimized
            ? h('div', { class: slot('cardFooter', 'dwt-card-footer') }, footer)
            : null,
        ]
      );
    };
  },
  { name: 'WidgetCard', props: CARD_PROPS }
);

/** The title to show: alert lists add their total, e.g. "Low stock (3)". */
export function widgetTitle(widget: DashboardWidget): string {
  if (
    widget.status === 'ok' &&
    widget.data.kind === 'ALERT_LIST' &&
    widget.data.total > 0
  ) {
    return `${widget.definition.title} (${widget.data.total})`;
  }
  return widget.definition.title;
}

export interface ResolvedWidgetCardProps {
  readonly widget: DashboardWidget;
  readonly defaultTitle?: string | undefined;
  readonly columnSpan?: number | undefined;
  readonly width?: number | undefined;
  readonly minimized?: boolean | undefined;
  readonly onToggleMinimized?: (() => void) | undefined;
  readonly onView?: (() => void) | undefined;
  /**
   * Adds download buttons to a card that has loaded: `'csv'` for a TABLE,
   * BAR_LIST or GRAPH, `'svg'` and `'png'` for a GRAPH. Off unless listed.
   */
  readonly exportFormats?: readonly ExportFormat[] | undefined;
  /** Receives the generated file instead of the browser downloading it. */
  readonly onExport?: ((file: ExportFile) => void) | undefined;
  /** Called with a readable message when an export fails. */
  readonly onExportError?: ((message: string) => void) | undefined;
  /** Shows "Updated 2 minutes ago" under a loaded card. */
  readonly freshness?: boolean | undefined;
  /** Adds a refresh button to a loaded card (pass `useWidgets`'s `refresh` for its key). */
  readonly onRefresh?: (() => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
  /** Makes rows, bars, alert items or chart positions selectable. */
  readonly onSelect?: ((selection: WidgetSelection) => void) | undefined;
  readonly editing?: boolean | undefined;
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

const ICON_BUTTON_PATH_CSV = 'M8 2v8m0 0L5 7m3 3 3-3M3 13h10';

/**
 * A WidgetCard for a resolved (or loading) widget, with its renderer. The
 * `actions` slot adds header controls after the built-in ones.
 */
export const ResolvedWidgetCard = defineComponent(
  (props: ResolvedWidgetCardProps, { slots }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { widget, onSelect, exportFormats, onExport, onExportError } =
        props;
      const { definition } = widget;
      const { labels } = settings.value;
      const title: string = widgetTitle(widget);
      const loaded: boolean = widget.status === 'ok';
      const kind: string | undefined =
        widget.status === 'ok' ? widget.data.kind : undefined;
      const canExportCsv: boolean =
        exportFormats?.includes('csv') === true &&
        loaded &&
        (kind === 'TABLE' || kind === 'BAR_LIST' || kind === 'GRAPH');
      const canExportSvg: boolean =
        exportFormats?.includes('svg') === true && kind === 'GRAPH';
      const canExportPng: boolean =
        exportFormats?.includes('png') === true && kind === 'GRAPH';
      const exportCsv = (): void => {
        if (widget.status !== 'ok') return;
        const csv = widgetToCsv(widget.data);
        if (!csv.ok) {
          onExportError?.(csv.error);
          return;
        }
        const failure: string | null = deliverExportFile(
          csvExportFile(definition.key, definition.title, csv.value),
          onExport
        );
        if (failure !== null) onExportError?.(failure);
      };
      const exportChart = async (
        button: HTMLElement,
        format: 'svg' | 'png'
      ): Promise<void> => {
        const figure: Element | null | undefined = button
          .closest('section')
          ?.querySelector('figure.dwt-chart');
        if (figure === null || figure === undefined) {
          onExportError?.(
            `Cannot export "${definition.title}": its chart is not on the page.`
          );
          return;
        }
        const drawn = chartToSvg(figure);
        if (!drawn.ok) {
          onExportError?.(drawn.error);
          return;
        }
        let file: ExportFile;
        if (format === 'svg') {
          file = svgExportFile(
            definition.key,
            definition.title,
            drawn.value.svg
          );
        } else {
          const png = await svgToPng(drawn.value);
          if (!png.ok) {
            onExportError?.(png.error);
            return;
          }
          file = pngExportFile(definition.key, definition.title, png.value);
        }
        const failure: string | null = deliverExportFile(file, onExport);
        if (failure !== null) onExportError?.(failure);
      };
      const iconButton = (
        label: string,
        onClick: (event: MouseEvent) => void,
        content: VNode
      ): VNode =>
        h(
          'button',
          {
            type: 'button',
            class: slot('button', 'dwt-button', 'dwt-icon-button'),
            'aria-label': label,
            title: label,
            onClick,
          },
          [content]
        );
      const formatLabel = (name: string): VNode =>
        h('span', { 'aria-hidden': 'true', class: 'dwt-export-format' }, name);

      const refreshable: boolean =
        props.onRefresh !== undefined && widget.status === 'ok';
      const extra: VNodeChild[] | undefined = slots['actions']?.();
      const hasActions: boolean =
        canExportCsv ||
        canExportSvg ||
        canExportPng ||
        refreshable ||
        extra !== undefined;

      const actionSlot = hasActions
        ? (): VNodeChild[] => [
            refreshable && props.onRefresh !== undefined
              ? h(RefreshButton, {
                  title,
                  busy: widget.status === 'ok' && widget.stale === true,
                  onRefresh: props.onRefresh,
                })
              : null,
            canExportCsv
              ? iconButton(
                  labels.downloadCsv(title),
                  exportCsv,
                  h(
                    'svg',
                    {
                      viewBox: '0 0 16 16',
                      width: '16',
                      height: '16',
                      'aria-hidden': 'true',
                      focusable: 'false',
                    },
                    [
                      h('path', {
                        d: ICON_BUTTON_PATH_CSV,
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': '1.4',
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                      }),
                    ]
                  )
                )
              : null,
            canExportSvg
              ? iconButton(
                  labels.downloadSvg(title),
                  (event) =>
                    void exportChart(event.currentTarget as HTMLElement, 'svg'),
                  formatLabel('SVG')
                )
              : null,
            canExportPng
              ? iconButton(
                  labels.downloadPng(title),
                  (event) =>
                    void exportChart(event.currentTarget as HTMLElement, 'png'),
                  formatLabel('PNG')
                )
              : null,
            extra,
          ]
        : undefined;

      const footerSlot =
        props.freshness === true &&
        widget.status === 'ok' &&
        widget.updatedAt !== undefined
          ? (): VNode => {
              const updatedAt: number = widget.updatedAt ?? 0;
              return h(FreshnessLine, {
                updatedAt,
                refreshError:
                  widget.status === 'ok' ? widget.refreshError : undefined,
              });
            }
          : undefined;

      return h(
        WidgetCard,
        {
          columnSpan: props.columnSpan,
          width: props.width,
          minimized: props.minimized,
          onToggleMinimized: props.onToggleMinimized,
          onView: props.onView,
          onRetry: props.onRetry,
          defaultTitle: props.defaultTitle,
          editing: props.editing,
          headingLevel: props.headingLevel,
          className: props.className,
          style: props.style,
          widgetKey: definition.key,
          title,
          status: widget.status,
          description: definition.description,
          size: definition.defaultSize,
          fill: definition.fill,
          emptyText: widget.status === 'empty' ? widget.emptyText : undefined,
          error: widget.status === 'error' ? widget.error : undefined,
        },
        {
          default: (): VNode | null =>
            widget.status === 'ok'
              ? h(WidgetContent, {
                  data: widget.data,
                  widgetKey: definition.key,
                  onSelect:
                    onSelect === undefined
                      ? undefined
                      : (target: SelectionTarget) =>
                          onSelect({
                            widgetKey: definition.key,
                            kind: widget.data.kind,
                            target,
                          }),
                  tableControls: resolveTableControls(definition),
                  initialSort: sortFromOptions(definition, widget.options),
                })
              : null,
          ...(actionSlot === undefined ? {} : { actions: actionSlot }),
          ...(footerSlot === undefined ? {} : { footer: footerSlot }),
        }
      );
    };
  },
  {
    name: 'ResolvedWidgetCard',
    props: [
      'widget',
      'defaultTitle',
      'columnSpan',
      'width',
      'minimized',
      'onToggleMinimized',
      'onView',
      'exportFormats',
      'onExport',
      'onExportError',
      'freshness',
      'onRefresh',
      'onRetry',
      'onSelect',
      'editing',
      'headingLevel',
      'className',
      'style',
    ],
  }
);
