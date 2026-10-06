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
import {
  defaultDetailQuery,
  deriveDetailData,
  resolveDetailOptions,
  type DetailData,
  type DetailQuery,
} from '../core/detail.js';
import { ResolvedWidgetCard } from './card.js';
import {
  WidgetDetail,
  WidgetDetailDialog,
  useDetailData,
  type DetailLoader,
} from './detail.js';
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
   * Called with the next layout after a move, hide, show, minimize or
   * restore; persist it. Without it the layout is read-only (no controls).
   */
  readonly onLayoutChange?: (layout: DashboardLayout) => void;
  readonly onRetry?: (key: string) => void;
  /**
   * Loads the full data for a widget's detail view (widgets whose definition
   * sets `detail`). Close over your own context. Return `undefined` for a
   * widget you have no extra data for: a TABLE with no footer or a BAR_LIST
   * then shows its card data. Without `loadDetail`, those two still work and
   * other widgets get no View button.
   */
  readonly loadDetail?: DetailLoader;
  /**
   * Called with the widget key when the viewer opens a detail view, instead
   * of the built-in dialog: navigate to your own page.
   */
  readonly onOpenDetail?: (key: string) => void;
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  readonly className?: string;
}

/** The built-in dialog for one widget's detail view. */
function DetailHost({
  widget,
  loadDetail,
  onClose,
}: {
  readonly widget: DashboardWidget;
  readonly loadDetail: DetailLoader | undefined;
  readonly onClose: () => void;
}): ReactNode {
  const { locale } = useWidgetSettings();
  const { definition } = widget;
  const options = resolveDetailOptions(definition);
  const pageSize: number = options?.pageSize ?? 25;
  const [query, setQuery] = useState<DetailQuery>(defaultDetailQuery(pageSize));
  // Memoized: a fresh object each render would restart the load every time.
  const derived: DetailData | undefined = useMemo(
    () =>
      widget.status === 'ok'
        ? deriveDetailData(widget.data, locale)
        : undefined,
    [widget, locale]
  );
  const { state, reload } = useDetailData(
    definition,
    loadDetail,
    true,
    derived
  );
  const title: string = options?.title ?? definition.title;
  return (
    <WidgetDetailDialog title={title} open onClose={onClose}>
      <WidgetDetail
        title={title}
        query={query}
        onQueryChange={setQuery}
        status={state.status}
        {...(state.data === undefined ? {} : { data: state.data })}
        {...(state.error === undefined ? {} : { error: state.error })}
        onRetry={reload}
      />
    </WidgetDetailDialog>
  );
}

function DashboardInner({
  widgets,
  layout = EMPTY_LAYOUT,
  onLayoutChange,
  onRetry,
  loadDetail,
  onOpenDetail,
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
  // Minimized widgets leave the grid for their own bar, so they stop taking
  // space. Without layout controls there is no way to restore them, so a
  // read-only dashboard shows them as normal cards.
  const minimized: WidgetDefinition[] = editable
    ? visible.filter((definition) => isMinimized(layout, definition.key))
    : [];
  const shown: WidgetDefinition[] = editable
    ? visible.filter((definition) => !isMinimized(layout, definition.key))
    : visible;
  const [detailKey, setDetailKey] = useState<string | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);
  const twelve: boolean = usesWidthColumns(shown);
  const spans: ReadonlyMap<string, number> = useFillSpans(
    shown,
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
      {minimized.length > 0 && (
        <div
          className={slot('hiddenBar', 'dwt-hidden-bar', 'dwt-minimized-bar')}
        >
          <span className="dwt-hidden-label">{labels.minimizedWidgets}</span>
          {minimized.map((definition) => (
            <button
              key={definition.key}
              type="button"
              className={slot('button', 'dwt-button', 'dwt-show-button')}
              aria-label={labels.expand(definition.title)}
              onClick={() => change(toggleMinimized(layout, definition.key))}
            >
              <span aria-hidden="true">▸ </span>
              {definition.title}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className={slot('empty', 'dwt-empty', 'dwt-dashboard-empty')}>
          {definitions.length === 0 ? labels.noWidgets : labels.allHidden}
        </p>
      ) : shown.length === 0 ? null : (
        <div
          ref={gridRef}
          className={slot('grid', 'dwt-grid', twelve && 'dwt-grid--twelve')}
        >
          {shown.map((definition, index) => {
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
                  disabled={index === shown.length - 1}
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
            const viewable: boolean =
              resolveDetailOptions(definition) !== undefined &&
              (onOpenDetail !== undefined ||
                loadDetail !== undefined ||
                (widget.status === 'ok' &&
                  deriveDetailData(widget.data) !== undefined));
            return (
              <ResolvedWidgetCard
                key={key}
                widget={widget}
                {...(viewable
                  ? {
                      onView: () =>
                        onOpenDetail === undefined
                          ? setDetailKey(key)
                          : onOpenDetail(key),
                    }
                  : {})}
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
      {detailKey !== undefined && byKey.get(detailKey) !== undefined && (
        <DetailHost
          key={detailKey}
          widget={byKey.get(detailKey) as DashboardWidget}
          loadDetail={loadDetail}
          onClose={() => setDetailKey(undefined)}
        />
      )}
    </div>
  );
}

/**
 * A full dashboard: widgets ordered by the viewer's layout, with move,
 * hide/show and minimize controls when `onLayoutChange` is given. Settings
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
