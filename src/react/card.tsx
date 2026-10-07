import { useId, type CSSProperties, type ReactNode } from 'react';

import type { WidgetFill, WidgetSize } from '../core/definition.js';
import { resolveTableControls } from '../core/detail.js';
import { fillsHeight, fillsWidth } from '../core/grid.js';
import type { DashboardWidget } from '../core/resolve.js';
import { WidgetContent } from './renderers.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface WidgetCardProps {
  readonly title: string;
  readonly description?: string;
  /** Extra controls in the header (move, hide...), before the minimize toggle. */
  readonly actions?: ReactNode;
  readonly minimized?: boolean;
  /** Shows the minimize/expand toggle when given. */
  readonly onToggleMinimized?: () => void;
  /**
   * Opens the widget's detail view. Adds a "View" icon button to the header
   * actions and makes the title clickable (for mouse and touch; the button is
   * the accessible control).
   */
  readonly onView?: () => void;
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
  /** 12-column width (see `WidgetDefinition.width`); sets `--dwt-width`. */
  readonly width?: number;
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
 * a minimize toggle, and loading, empty and error states.
 */
export function WidgetCard({
  title,
  description,
  actions,
  minimized = false,
  onToggleMinimized,
  onView,
  status = 'ok',
  emptyText,
  error,
  onRetry,
  footer,
  size,
  fill,
  columnSpan,
  width,
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
      {...(columnSpan === undefined && width === undefined
        ? {}
        : {
            style: {
              ...(width === undefined ? {} : { '--dwt-width': width }),
              ...(columnSpan === undefined
                ? {}
                : { gridColumn: `span ${columnSpan}` }),
            } as CSSProperties,
          })}
    >
      <header className={slot('cardHeader', 'dwt-card-header')}>
        <div className="dwt-card-heading">
          <Heading
            id={`${id}-title`}
            className={slot('cardTitle', 'dwt-card-title')}
          >
            {onView === undefined ? (
              title
            ) : (
              <button
                type="button"
                tabIndex={-1}
                className="dwt-card-title-button"
                onClick={onView}
              >
                {title}
              </button>
            )}
          </Heading>
          {description !== undefined && !minimized && (
            <p className={slot('cardDescription', 'dwt-card-description')}>
              {description}
            </p>
          )}
        </div>
        {(actions !== undefined ||
          onToggleMinimized !== undefined ||
          onView !== undefined) && (
          <div className={slot('cardActions', 'dwt-card-actions')}>
            {onView !== undefined && (
              <button
                type="button"
                className={slot('button', 'dwt-button', 'dwt-icon-button')}
                aria-label={labels.view(title)}
                title={labels.view(title)}
                onClick={onView}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="8" r="2.1" fill="currentColor" />
                </svg>
              </button>
            )}
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
  /** 12-column width (see `WidgetDefinition.width`); sets `--dwt-width`. */
  readonly width?: number;
  readonly actions?: ReactNode;
  readonly minimized?: boolean;
  readonly onToggleMinimized?: () => void;
  /** See `WidgetCardProps.onView`. */
  readonly onView?: () => void;
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
      {widget.status === 'ok' ? (
        <WidgetContent
          data={widget.data}
          tableControls={resolveTableControls(definition)}
        />
      ) : null}
    </WidgetCard>
  );
}
