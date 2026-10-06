import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import type { WidgetDefinition } from '../core/definition.js';
import {
  WIDTH_COLUMNS,
  fillColumnSpans,
  fillWidthSpans,
  fillsWidth,
  itemWidth,
  usesWidthColumns,
} from '../core/grid.js';
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

/** Viewport width at or below which the stylesheet stops spanning `large`. */
const NARROW_VIEWPORT_QUERY = '(max-width: 640px)';

/** Grid width above which a 12-column grid uses each widget's own width. */
const WIDE_GRID_PX = 900;

interface GridMetrics {
  readonly columns: number;
  readonly largeSpan: number;
}

/**
 * Column spans for widgets that `fill` their width. The number of columns
 * comes from the rendered grid (so it follows your CSS and the container
 * width); until it is measured, and on the server, no spans are set and the
 * grid lays out normally. Returns an empty map when no widget fills width.
 */
function useFillSpans(
  definitions: readonly WidgetDefinition[],
  gridRef: RefObject<HTMLDivElement | null>,
  twelve: boolean
): ReadonlyMap<string, number> {
  const [metrics, setMetrics] = useState<GridMetrics | undefined>(undefined);
  const needsSpans: boolean = definitions.some((definition) =>
    fillsWidth(definition.fill)
  );

  useEffect(() => {
    const grid: HTMLDivElement | null = gridRef.current;
    if (!needsSpans || grid === null || typeof ResizeObserver === 'undefined') {
      setMetrics(undefined);
      return undefined;
    }
    function measure(): void {
      if (grid === null) return;
      if (twelve) {
        // Narrow grids reflow in CSS; only fill when widths apply as set.
        const wide: boolean = grid.clientWidth > WIDE_GRID_PX;
        setMetrics((previous) =>
          !wide
            ? undefined
            : previous?.columns === WIDTH_COLUMNS
              ? previous
              : { columns: WIDTH_COLUMNS, largeSpan: 2 }
        );
        return;
      }
      const tracks: string = getComputedStyle(grid).gridTemplateColumns;
      const columns: number =
        tracks === '' || tracks === 'none'
          ? 0
          : tracks.trim().split(/\s+/).length;
      const largeSpan: number = window.matchMedia(NARROW_VIEWPORT_QUERY).matches
        ? 1
        : 2;
      setMetrics((previous) =>
        columns === 0
          ? undefined
          : previous?.columns === columns && previous.largeSpan === largeSpan
            ? previous
            : { columns, largeSpan }
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [needsSpans, gridRef, twelve]);

  return useMemo(
    () =>
      metrics === undefined
        ? new Map<string, number>()
        : twelve
          ? fillWidthSpans(definitions)
          : fillColumnSpans(definitions, metrics.columns, metrics.largeSpan),
    [definitions, metrics, twelve]
  );
}

function widthProps(
  twelve: boolean,
  definition: WidgetDefinition
): { width?: number } {
  return twelve ? { width: itemWidth(definition) } : {};
}

function spanProps(
  spans: ReadonlyMap<string, number>,
  key: string
): { columnSpan?: number } {
  const columnSpan: number | undefined = spans.get(key);
  return columnSpan === undefined ? {} : { columnSpan };
}

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
  const gridRef = useRef<HTMLDivElement>(null);
  const definitions: WidgetDefinition[] = widgets.map((w) => w.definition);
  const twelve: boolean = usesWidthColumns(definitions);
  const spans: ReadonlyMap<string, number> = useFillSpans(
    definitions,
    gridRef,
    twelve
  );
  return (
    <div
      ref={gridRef}
      className={slot(
        'grid',
        'dwt-grid',
        twelve && 'dwt-grid--twelve',
        className
      )}
    >
      {widgets.map((widget) => (
        <ResolvedWidgetCard
          key={widget.definition.key}
          widget={widget}
          {...spanProps(spans, widget.definition.key)}
          {...widthProps(twelve, widget.definition)}
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
  const gridRef = useRef<HTMLDivElement>(null);
  const twelve: boolean = usesWidthColumns(visible);
  const spans: ReadonlyMap<string, number> = useFillSpans(
    visible,
    gridRef,
    twelve
  );

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
        <div
          ref={gridRef}
          className={slot('grid', 'dwt-grid', twelve && 'dwt-grid--twelve')}
        >
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
                {...spanProps(spans, key)}
                {...widthProps(twelve, definition)}
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
