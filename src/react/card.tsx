import { useId, type ReactNode } from 'react';

import type { WidgetFill, WidgetSize } from '../core/definition.js';
import { fillsHeight, fillsWidth } from '../core/grid.js';
import type { DashboardWidget } from '../core/resolve.js';
import { WidgetContent } from './renderers.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface WidgetCardProps {
  readonly title: string;
  readonly description?: string;
  /** Extra controls in the header (move, hide...), before the minimise toggle. */
  readonly actions?: ReactNode;
  readonly minimized?: boolean;
  /** Shows the minimise/expand toggle when given. */
  readonly onToggleMinimized?: () => void;
  /** Default 'ok', which renders `children`. */
  readonly status?: 'ok' | 'loading' | 'empty' | 'error';
  readonly emptyText?: string;
  readonly error?: string;
  /** Shows a Retry button on the error state when given. */
  readonly onRetry?: () => void;
  readonly footer?: ReactNode;
  readonly size?: WidgetSize;
  /** Fill free space in the grid row (height, width or both). */
  readonly fill?: WidgetFill;
  /**
   * Explicit grid column span, set by `Dashboard` and `WidgetGrid` to give a
   * width-filling card the columns left over in its row.
   */
  readonly columnSpan?: number;
  /**
   * The widget's key, rendered as `data-widget-key` so `useWidgets` can tell
   * which card scrolled into view. `ResolvedWidgetCard` sets it for you.
   */
  readonly widgetKey?: string;
  /** 2 to 6; default 2. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * The frame every widget sits in: title, optional description and actions,
 * a minimise toggle, and loading, empty and error states.
 */
export function WidgetCard({
  title,
  description,
  actions,
  minimized = false,
  onToggleMinimized,
  status = 'ok',
  emptyText,
  error,
  onRetry,
  footer,
  size,
  fill,
  columnSpan,
  widgetKey,
  headingLevel = 2,
  className,
  children,
}: WidgetCardProps): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const id: string = useId();
  const Heading = `h${headingLevel}` as const;
  const bodyId = `${id}-body`;

  let body: ReactNode;
  switch (status) {
    case 'loading':
      body = (
        <p role="status" className={slot('status', 'dwt-status')}>
          {labels.loading}
        </p>
      );
      break;
    case 'empty':
      body = <p className={slot('empty', 'dwt-empty')}>{emptyText ?? ''}</p>;
      break;
    case 'error':
      body = (
        <div role="alert" className={slot('error', 'dwt-error')}>
          <p className="dwt-error-message">{error ?? ''}</p>
          {onRetry !== undefined && (
            <button
              type="button"
              className={slot('button', 'dwt-button')}
              onClick={onRetry}
            >
              {labels.retry}
            </button>
          )}
        </div>
      );
      break;
    case 'ok':
      body = children;
      break;
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={slot(
        'card',
        'dwt-card',
        `dwt-card--${status}`,
        minimized && 'dwt-card--minimized',
        size !== undefined && `dwt-card--size-${size}`,
        fillsHeight(fill) && 'dwt-card--fill-height',
        fillsWidth(fill) && 'dwt-card--fill-width',
        className
      )}
      {...(widgetKey === undefined ? {} : { 'data-widget-key': widgetKey })}
      {...(columnSpan === undefined
        ? {}
        : { style: { gridColumn: `span ${columnSpan}` } })}
    >
      <header className={slot('cardHeader', 'dwt-card-header')}>
        <div className="dwt-card-heading">
          <Heading
            id={`${id}-title`}
            className={slot('cardTitle', 'dwt-card-title')}
          >
            {title}
          </Heading>
          {description !== undefined && !minimized && (
            <p className={slot('cardDescription', 'dwt-card-description')}>
              {description}
            </p>
          )}
        </div>
        {(actions !== undefined || onToggleMinimized !== undefined) && (
          <div className={slot('cardActions', 'dwt-card-actions')}>
            {actions}
            {onToggleMinimized !== undefined && (
              <button
                type="button"
                className={slot('button', 'dwt-button', 'dwt-icon-button')}
                aria-expanded={!minimized}
                aria-controls={bodyId}
                aria-label={
                  minimized ? labels.expand(title) : labels.minimize(title)
                }
                title={
                  minimized ? labels.expand(title) : labels.minimize(title)
                }
                onClick={onToggleMinimized}
              >
                <span aria-hidden="true">{minimized ? '▸' : '▾'}</span>
              </button>
            )}
          </div>
        )}
      </header>
      <div
        id={bodyId}
        className={slot('cardBody', 'dwt-card-body')}
        hidden={minimized}
      >
        {minimized ? null : body}
      </div>
      {footer !== undefined && footer !== null && !minimized && (
        <div className={slot('cardFooter', 'dwt-card-footer')}>{footer}</div>
      )}
    </section>
  );
}

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
  /** See `WidgetCardProps.columnSpan`. */
  readonly columnSpan?: number;
  readonly actions?: ReactNode;
  readonly minimized?: boolean;
  readonly onToggleMinimized?: () => void;
  readonly onRetry?: () => void;
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  readonly className?: string;
}

/** A WidgetCard for a resolved (or loading) widget, with its renderer. */
export function ResolvedWidgetCard({
  widget,
  ...props
}: ResolvedWidgetCardProps): ReactNode {
  const { definition } = widget;
  return (
    <WidgetCard
      {...props}
      widgetKey={definition.key}
      title={widgetTitle(widget)}
      status={widget.status}
      {...(definition.description === undefined
        ? {}
        : { description: definition.description })}
      {...(definition.defaultSize === undefined
        ? {}
        : { size: definition.defaultSize })}
      {...(definition.fill === undefined ? {} : { fill: definition.fill })}
      {...(widget.status === 'empty' ? { emptyText: widget.emptyText } : {})}
      {...(widget.status === 'error' ? { error: widget.error } : {})}
    >
      {widget.status === 'ok' ? <WidgetContent data={widget.data} /> : null}
    </WidgetCard>
  );
}
