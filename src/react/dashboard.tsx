import type { ReactNode } from 'react';

import type { WidgetDefinition } from '../core/definition.js';
import {
  EMPTY_LAYOUT,
  hiddenWidgets,
  isMinimized,
  moveWidgetBy,
  showWidget,
  hideWidget,
  toggleMinimized,
  visibleWidgets,
  type DashboardLayout,
} from '../core/layout.js';
import type { DashboardWidget } from '../core/resolve.js';
import { ResolvedWidgetCard } from './card.js';
import {
  WidgetSettingsProvider,
  useSlotClassName,
  useWidgetSettings,
  type WidgetSettings,
} from './settings.js';

export interface WidgetGridProps {
  /** Rendered in the order given. */
  readonly widgets: readonly DashboardWidget[];
  readonly onRetry?: (key: string) => void;
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  readonly className?: string;
}

/** A plain grid of widget cards, no layout controls. */
export function WidgetGrid({
  widgets,
  onRetry,
  headingLevel,
  className,
}: WidgetGridProps): ReactNode {
  const slot = useSlotClassName();
  return (
    <div className={slot('grid', 'dwt-grid', className)}>
      {widgets.map((widget) => (
        <ResolvedWidgetCard
          key={widget.definition.key}
          widget={widget}
          {...(headingLevel === undefined ? {} : { headingLevel })}
          {...(onRetry === undefined || widget.status !== 'error'
            ? {}
            : { onRetry: () => onRetry(widget.definition.key) })}
        />
      ))}
    </div>
  );
}

export interface DashboardProps extends WidgetSettings {
  /** Resolved (or loading) widgets, any order: the layout orders them. */
  readonly widgets: readonly DashboardWidget[];
  /** The viewer's saved layout. Default: none saved. */
  readonly layout?: DashboardLayout;
  /**
   * Called with the next layout after a move, hide, show, minimise or
   * restore; persist it. Without it the layout is read-only (no controls).
   */
  readonly onLayoutChange?: (layout: DashboardLayout) => void;
  readonly onRetry?: (key: string) => void;
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  readonly className?: string;
}

function DashboardInner({
  widgets,
  layout = EMPTY_LAYOUT,
  onLayoutChange,
  onRetry,
  headingLevel,
  className,
}: DashboardProps): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const definitions: WidgetDefinition[] = widgets.map((w) => w.definition);
  const byKey = new Map<string, DashboardWidget>(
    widgets.map((w) => [w.definition.key, w])
  );
  const visible: WidgetDefinition[] = visibleWidgets(definitions, layout);
  const hidden: WidgetDefinition[] = hiddenWidgets(definitions, layout);
  const editable: boolean = onLayoutChange !== undefined;

  function change(next: DashboardLayout): void {
    if (next !== layout) onLayoutChange?.(next);
  }

  return (
    <div className={slot('dashboard', 'dwt-dashboard', className)}>
      {editable && hidden.length > 0 && (
        <div className={slot('hiddenBar', 'dwt-hidden-bar')}>
          <span className="dwt-hidden-label">{labels.hiddenWidgets}</span>
          {hidden.map((definition) => (
            <button
              key={definition.key}
              type="button"
              className={slot('button', 'dwt-button', 'dwt-show-button')}
              aria-label={labels.show(definition.title)}
              onClick={() => change(showWidget(layout, definition.key))}
            >
              <span aria-hidden="true">+ </span>
              {definition.title}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className={slot('empty', 'dwt-empty', 'dwt-dashboard-empty')}>
          {definitions.length === 0 ? labels.noWidgets : labels.allHidden}
        </p>
      ) : (
        <div className={slot('grid', 'dwt-grid')}>
          {visible.map((definition, index) => {
            const widget: DashboardWidget | undefined = byKey.get(
              definition.key
            );
            if (widget === undefined) return null;
            const key: string = definition.key;
            const title: string = definition.title;
            const actions: ReactNode = editable ? (
              <>
                <button
                  type="button"
                  className={slot('button', 'dwt-button', 'dwt-icon-button')}
                  aria-label={labels.moveEarlier(title)}
                  title={labels.moveEarlier(title)}
                  disabled={index === 0}
                  onClick={() =>
                    change(moveWidgetBy(definitions, layout, key, -1))
                  }
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className={slot('button', 'dwt-button', 'dwt-icon-button')}
                  aria-label={labels.moveLater(title)}
                  title={labels.moveLater(title)}
                  disabled={index === visible.length - 1}
                  onClick={() =>
                    change(moveWidgetBy(definitions, layout, key, 1))
                  }
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  className={slot('button', 'dwt-button', 'dwt-icon-button')}
                  aria-label={labels.hide(title)}
                  title={labels.hide(title)}
                  onClick={() => change(hideWidget(layout, key))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </>
            ) : undefined;
            return (
              <ResolvedWidgetCard
                key={key}
                widget={widget}
                minimized={isMinimized(layout, key)}
                {...(actions === undefined ? {} : { actions })}
                {...(editable
                  ? {
                      onToggleMinimized: () =>
                        change(toggleMinimized(layout, key)),
                    }
                  : {})}
                {...(headingLevel === undefined ? {} : { headingLevel })}
                {...(onRetry === undefined || widget.status !== 'error'
                  ? {}
                  : { onRetry: () => onRetry(key) })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A full dashboard: widgets ordered by the viewer's layout, with move,
 * hide/show and minimise controls when `onLayoutChange` is given. Settings
 * (locale, link target, classNames, labels) apply to every widget inside.
 */
export function Dashboard({
  locale,
  linkTarget,
  classNames,
  labels,
  ...props
}: DashboardProps): ReactNode {
  const parent = useWidgetSettings();
  const resolvedLocale = locale ?? parent.locale;
  const resolvedTarget: string | undefined = linkTarget ?? parent.linkTarget;
  return (
    <WidgetSettingsProvider
      {...(resolvedLocale === undefined ? {} : { locale: resolvedLocale })}
      {...(resolvedTarget === undefined ? {} : { linkTarget: resolvedTarget })}
      classNames={{ ...parent.classNames, ...classNames }}
      labels={{ ...parent.labels, ...labels }}
    >
      <DashboardInner {...props} />
    </WidgetSettingsProvider>
  );
}
