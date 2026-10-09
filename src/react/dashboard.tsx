import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  resolveWidgetLock,
  type ResolvedWidgetLock,
  type WidgetDefinition,
} from '../core/definition.js';
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
  enforceLocks,
  hiddenWidgets,
  isMinimized,
  moveWidgetBy,
  showWidget,
  hideWidget,
  toggleMinimized,
  visibleWidgets,
  MAX_PAGE_TITLE_LENGTH,
  type DashboardLayout,
  type LayoutPage,
} from '../core/layout.js';
import {
  addPage,
  assignPages,
  hasPages,
  movePage,
  moveWidgetToPage,
  pageLayout,
  pageList,
  pageRoom,
  removePage,
  renamePage,
  withPageLayout,
  type PageOptions,
} from '../core/pages.js';
import { sortFromOptions } from '../core/options.js';
import type { DashboardWidget } from '../core/resolve.js';
import {
  defaultDetailQuery,
  deriveDetailData,
  resolveDetailOptions,
  type DetailData,
  type DetailQuery,
  type DetailSort,
} from '../core/detail.js';
import { ResolvedWidgetCard } from './card.js';
import { MoveToPageMenu } from './move-menu.js';
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

/** The "New page…" choice of a card's move-to-page select. */
const NEW_PAGE_VALUE = '__new-page__';

/** The tab panel of a paged dashboard; a plain wrapper-free fragment otherwise. */
function PagePanel({
  paged,
  id,
  labelledBy,
  children,
}: {
  readonly paged: boolean;
  readonly id: string;
  readonly labelledBy: string;
  readonly children: ReactNode;
}): ReactNode {
  if (!paged) return <>{children}</>;
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      className="dwt-page-panel"
    >
      {children}
    </div>
  );
}

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
  /**
   * Ignore widget `locked` settings, so locked widgets can be moved, hidden
   * and minimized. For administrators editing the default layout: pass it
   * only for roles you trust, and enforce locks again on the server for
   * everyone else (`enforceLocks`). It never changes the locks themselves.
   */
  readonly overrideLocks?: boolean;
  /**
   * `always` (default): move and hide controls show whenever `onLayoutChange`
   * is set. `toggle`: they show only while editing, behind a Customize
   * button, so a stray click can't rearrange the page. Minimize and its bar
   * work in both modes.
   */
  readonly editMode?: 'always' | 'toggle';
  /** Controlled editing state (`editMode="toggle"`). */
  readonly editing?: boolean;
  /** Initial editing state when uncontrolled. Default false. */
  readonly defaultEditing?: boolean;
  /** Called when the viewer starts or finishes editing. */
  readonly onEditingChange?: (editing: boolean) => void;
  /** What Reset layout restores. Default: the empty layout (sortOrder order). */
  readonly defaultLayout?: DashboardLayout;
  /** Show the built-in Customize/Done/Reset toolbar (toggle mode). Default true. */
  readonly toolbar?: boolean;
  /**
   * The page in view (a page key) when the layout has pages. Controlled with
   * `onActivePageChange`; without it the dashboard keeps its own, starting on
   * `defaultActivePage` or the first page. Pages never listed fall back to
   * the first.
   */
  readonly activePage?: string;
  readonly defaultActivePage?: string;
  readonly onActivePageChange?: (pageKey: string) => void;
  /** Rows a page holds unless the page says otherwise. Default 4. */
  readonly maxRows?: number;
  /** Most pages the viewer can add while editing. Default: no limit. */
  readonly maxPages?: number;
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
  const optionSort: DetailSort | undefined = sortFromOptions(
    definition,
    widget.options
  );
  const [query, setQuery] = useState<DetailQuery>({
    ...defaultDetailQuery(pageSize),
    ...(optionSort === undefined ? {} : { sort: optionSort }),
  });
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
    derived,
    widget.options
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

/**
 * "Reset the layout?" with "✓" and "X" buttons, inline in the toolbar. Focus
 * starts on the safe choice, and Escape answers no.
 */
function InlineConfirm({
  message,
  onAnswer,
}: {
  readonly message: string;
  readonly onAnswer: (yes: boolean) => void;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    noRef.current?.focus();
  }, []);
  return (
    <span
      role="group"
      aria-label={message}
      className="dwt-confirm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onAnswer(false);
        }
      }}
    >
      <span role="alert" className="dwt-confirm-message">
        {message}
      </span>
      <button
        type="button"
        className={slot('button', 'dwt-button', 'dwt-icon-button')}
        aria-label={labels.confirmYes}
        title={labels.confirmYes}
        onClick={() => onAnswer(true)}
      >
        <span aria-hidden="true">✓</span>
      </button>
      <button
        ref={noRef}
        type="button"
        className={slot('button', 'dwt-button', 'dwt-icon-button')}
        aria-label={labels.confirmNo}
        title={labels.confirmNo}
        onClick={() => onAnswer(false)}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </span>
  );
}

/** The tab list of a paged dashboard: tabs on wide screens, dots on narrow. */
function PageTabs({
  pages,
  activeKey,
  idPrefix,
  panelId,
  announcement,
  onSelect,
}: {
  readonly pages: readonly LayoutPage[];
  readonly activeKey: string;
  readonly idPrefix: string;
  readonly panelId: string;
  readonly announcement: string;
  readonly onSelect: (pageKey: string) => void;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const activeIndex: number = pages.findIndex((p) => p.key === activeKey);

  function onKeyDown(event: KeyboardEvent, index: number): void {
    const last: number = pages.length - 1;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target: LayoutPage | undefined = pages[next];
    if (target === undefined) return;
    onSelect(target.key);
    tabs.current.get(target.key)?.focus();
  }

  return (
    <div className={slot('pageBar', 'dwt-pages')}>
      <button
        type="button"
        className={slot(
          'button',
          'dwt-button',
          'dwt-icon-button',
          'dwt-page-nav'
        )}
        aria-label={labels.previousPageButton}
        disabled={activeIndex <= 0}
        onClick={() => onSelect((pages[activeIndex - 1] as LayoutPage).key)}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div role="tablist" aria-label={labels.pageBar} className="dwt-page-tabs">
        {pages.map((page, index) => {
          const selected: boolean = page.key === activeKey;
          return (
            <button
              key={page.key}
              ref={(element) => {
                if (element === null) tabs.current.delete(page.key);
                else tabs.current.set(page.key, element);
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${index}`}
              aria-selected={selected}
              aria-controls={panelId}
              aria-label={labels.pageTabName(
                index + 1,
                pages.length,
                page.title
              )}
              title={page.title}
              tabIndex={selected ? 0 : -1}
              className={slot('button', 'dwt-page-tab')}
              onClick={() => onSelect(page.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="dwt-page-tab-title">{page.title}</span>
              <span className="dwt-page-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={slot(
          'button',
          'dwt-button',
          'dwt-icon-button',
          'dwt-page-nav'
        )}
        aria-label={labels.nextPageButton}
        disabled={activeIndex === pages.length - 1}
        onClick={() => onSelect((pages[activeIndex + 1] as LayoutPage).key)}
      >
        <span aria-hidden="true">›</span>
      </button>
      <span className="dwt-visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

/** A small form to rename a page. `onSubmit` returns an error to show. */
function PageRenameForm({
  initial,
  onSubmit,
  onCancel,
}: {
  readonly initial: string;
  readonly onSubmit: (title: string) => string | undefined;
  readonly onCancel: () => void;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const [title, setTitle] = useState<string>(initial);
  const [error, setError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <form
      className="dwt-page-rename"
      onSubmit={(event) => {
        event.preventDefault();
        setError(onSubmit(title));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="dwt-page-title-input"
        aria-label={labels.pageTitle}
        aria-invalid={error !== undefined}
        maxLength={MAX_PAGE_TITLE_LENGTH}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button
        type="submit"
        className={slot('button', 'dwt-button', 'dwt-icon-button')}
        aria-label={labels.savePageTitle}
        title={labels.savePageTitle}
      >
        <span aria-hidden="true">✓</span>
      </button>
      <button
        type="button"
        className={slot('button', 'dwt-button', 'dwt-icon-button')}
        aria-label={labels.cancelPageTitle}
        title={labels.cancelPageTitle}
        onClick={onCancel}
      >
        <span aria-hidden="true">✕</span>
      </button>
      {error !== undefined && (
        <span role="alert" className="dwt-page-error">
          {error}
        </span>
      )}
    </form>
  );
}

/** The definition without its lock, for `overrideLocks`. */
function withoutLock(definition: WidgetDefinition): WidgetDefinition {
  if (definition.locked === undefined) return definition;
  const copy: { -readonly [K in keyof WidgetDefinition]: WidgetDefinition[K] } =
    { ...definition };
  delete copy.locked;
  return copy;
}

function DashboardInner({
  widgets,
  layout: savedLayout = EMPTY_LAYOUT,
  onLayoutChange,
  overrideLocks = false,
  editMode = 'always',
  editing: editingProp,
  defaultEditing = false,
  onEditingChange,
  defaultLayout,
  toolbar = true,
  activePage: activePageProp,
  defaultActivePage,
  onActivePageChange,
  maxRows,
  maxPages,
  onRetry,
  loadDetail,
  onOpenDetail,
  headingLevel,
  className,
}: DashboardProps): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const definitions: WidgetDefinition[] = widgets.map((w) =>
    overrideLocks ? withoutLock(w.definition) : w.definition
  );
  // A saved layout can predate a lock (or be edited by hand), so what a lock
  // forbids is removed before anything is shown.
  const layout: DashboardLayout = enforceLocks(definitions, savedLayout);
  const byKey = new Map<string, DashboardWidget>(
    widgets.map((w) => [w.definition.key, w])
  );
  // Pages: with none, the layout is one implicit page and `view` is the layout
  // itself, so everything below works on one page's widgets and lists.
  const pages: readonly LayoutPage[] = pageList(layout);
  const paged: boolean = pages.length >= 2;
  const [activeState, setActiveState] = useState<string | undefined>(
    defaultActivePage
  );
  const requested: string | undefined = activePageProp ?? activeState;
  const activePage: LayoutPage =
    pages.find((page) => page.key === requested) ?? (pages[0] as LayoutPage);
  const activeKey: string = activePage.key;
  const pageDefs: WidgetDefinition[] =
    assignPages(definitions, layout).get(activeKey) ?? [];
  const view: DashboardLayout = pageLayout(layout, activeKey) ?? layout;
  const roomOptions: PageOptions = maxRows === undefined ? {} : { maxRows };
  const visible: WidgetDefinition[] = visibleWidgets(pageDefs, view);
  const hidden: WidgetDefinition[] = hiddenWidgets(pageDefs, view);
  const editable: boolean = onLayoutChange !== undefined;
  const toggleMode: boolean = editMode === 'toggle';
  const [editingState, setEditingState] = useState<boolean>(defaultEditing);
  const editing: boolean = editingProp ?? editingState;
  // Move, hide and the other layout controls: always, or only while editing.
  const controlsShown: boolean = editable && (!toggleMode || editing);
  // Editing keeps a snapshot of the layout from when it began, for Revert.
  const [snapshot, setSnapshot] = useState<DashboardLayout | undefined>(
    undefined
  );
  if (toggleMode && editable && editing) {
    if (snapshot === undefined) setSnapshot(savedLayout);
  } else if (snapshot !== undefined) {
    setSnapshot(undefined);
  }
  const [confirming, setConfirming] = useState<'reset' | 'revert' | undefined>(
    undefined
  );
  const pending: 'reset' | 'revert' | undefined = editing
    ? confirming
    : undefined;
  const [announcement, setAnnouncement] = useState<string>('');
  const [pageAnnouncement, setPageAnnouncement] = useState<string>('');
  const [pageError, setPageError] = useState<string | undefined>(undefined);
  /** A page just added through Add page and still being named: cancelling removes it. */
  const [newPage, setNewPage] = useState<
    { readonly key: string; readonly activeBefore: string } | undefined
  >(undefined);
  const [pageEditor, setPageEditor] = useState<
    { readonly mode: 'rename' | 'delete'; readonly key: string } | undefined
  >(undefined);
  const editorMode: 'rename' | 'delete' | undefined =
    pageEditor?.key === activeKey ? pageEditor.mode : undefined;
  const instanceId: string = useId();
  const panelId = `${instanceId}-panel`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  // Minimized widgets leave the grid for their own bar, so they stop taking
  // space. Without layout controls there is no way to restore them, so a
  // read-only dashboard shows them as normal cards.
  const minimized: WidgetDefinition[] = editable
    ? visible.filter((definition) => isMinimized(view, definition.key))
    : [];
  const shown: WidgetDefinition[] = editable
    ? visible.filter((definition) => !isMinimized(view, definition.key))
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

  /** Applies a change made to the page in view (a page-level layout). */
  function changePage(next: DashboardLayout): void {
    setPageError(undefined);
    change(withPageLayout(layout, activeKey, next));
  }

  function selectPage(pageKey: string): void {
    const index: number = pages.findIndex((page) => page.key === pageKey);
    if (index === -1) return;
    if (activePageProp === undefined) setActiveState(pageKey);
    onActivePageChange?.(pageKey);
    setPageError(undefined);
    setPageEditor(undefined);
    setNewPage(undefined);
    setPageAnnouncement(
      labels.pageTabName(
        index + 1,
        pages.length,
        (pages[index] as LayoutPage).title
      )
    );
  }

  function addPageAction(): void {
    const added = addPage(layout);
    if (!added.ok) {
      setPageError(added.error);
      return;
    }
    change(added.value);
    const created: LayoutPage | undefined = added.value.pages?.at(-1);
    if (created !== undefined) {
      setNewPage({ key: created.key, activeBefore: activeKey });
      if (activePageProp === undefined) setActiveState(created.key);
      onActivePageChange?.(created.key);
      setPageError(undefined);
      setPageEditor({ mode: 'rename', key: created.key });
    }
  }

  function renamePageAction(title: string): string | undefined {
    const renamed = renamePage(layout, activeKey, title);
    if (!renamed.ok) return renamed.error;
    change(renamed.value);
    setPageEditor(undefined);
    setNewPage(undefined);
    return undefined;
  }

  /** Escape or ✕ in the page name form: a page that was just added goes away again. */
  function cancelPageEditor(): void {
    const fresh = newPage;
    setPageEditor(undefined);
    setNewPage(undefined);
    if (fresh === undefined || fresh.key !== activeKey) return;
    // The page is brand new and empty, so dropping it is exact: nothing moves.
    const pagesWithout: LayoutPage[] = pages.filter(
      (page) => page.key !== fresh.key
    );
    if (pagesWithout.length === pages.length) return;
    change({ ...layout, pages: pagesWithout });
    selectPage(fresh.activeBefore);
  }

  function deletePageAction(): void {
    const index: number = pages.findIndex((page) => page.key === activeKey);
    const removed = removePage(definitions, layout, activeKey, roomOptions);
    setPageEditor(undefined);
    if (!removed.ok) {
      setPageError(removed.error);
      return;
    }
    const neighbor: LayoutPage | undefined = pages[index > 0 ? index - 1 : 1];
    change(removed.value);
    if (neighbor !== undefined) selectPage(neighbor.key);
  }

  function moveWidgetAction(widgetKey: string, targetKey: string): void {
    let target: string = targetKey;
    let base: DashboardLayout = layout;
    if (targetKey === NEW_PAGE_VALUE) {
      const added = addPage(layout);
      if (!added.ok) {
        setPageError(added.error);
        return;
      }
      base = added.value;
      target = (added.value.pages?.at(-1) as LayoutPage).key;
    }
    const moved = moveWidgetToPage(
      definitions,
      base,
      widgetKey,
      target,
      roomOptions
    );
    if (!moved.ok) {
      setPageError(moved.error);
      return;
    }
    setPageError(undefined);
    change(moved.value);
    const destination: LayoutPage | undefined = moved.value.pages?.find(
      (page) => page.key === target
    );
    setPageAnnouncement(
      labels.movedToPage(
        byKey.get(widgetKey)?.definition.title ?? widgetKey,
        destination?.title ?? target
      )
    );
  }

  /** Restores a hidden widget, unless that would overflow a paged page. */
  function showAction(widgetKey: string): void {
    const next: DashboardLayout = withPageLayout(
      layout,
      activeKey,
      showWidget(view, widgetKey)
    );
    if (hasPages(next)) {
      const room = pageRoom(definitions, next, activeKey, roomOptions);
      if (room !== undefined && room.rowsUsed > room.maxRows) {
        setPageError(labels.pageFull(activePage.title, room.maxRows));
        return;
      }
    }
    setPageError(undefined);
    change(next);
  }

  function setEditing(next: boolean): void {
    if (editingProp === undefined) setEditingState(next);
    onEditingChange?.(next);
    setAnnouncement(next ? labels.editingOn : labels.editingOff);
    setConfirming(undefined);
  }

  function answerConfirmation(yes: boolean): void {
    const which: 'reset' | 'revert' | undefined = pending;
    setConfirming(undefined);
    if (yes && which === 'reset') {
      change(enforceLocks(definitions, defaultLayout ?? EMPTY_LAYOUT));
    } else if (yes && which === 'revert' && snapshot !== undefined) {
      change(snapshot);
    }
    // Focus goes back to the control that asked.
    (which === 'revert' ? toggleRef : resetRef).current?.focus();
  }

  return (
    <div
      className={slot(
        'dashboard',
        'dwt-dashboard',
        toggleMode && controlsShown && 'dwt-dashboard--editing',
        className
      )}
    >
      {editable && toggleMode && toolbar && (
        <div
          role="group"
          aria-label={labels.dashboardControls}
          className={slot('toolbar', 'dwt-toolbar')}
        >
          <button
            ref={toggleRef}
            type="button"
            aria-pressed={editing}
            className={slot('button', 'dwt-button', 'dwt-toolbar-toggle')}
            onClick={() => setEditing(!editing)}
          >
            {editing ? labels.done : labels.customize}
          </button>
          {editing && (
            <>
              <button
                ref={resetRef}
                type="button"
                className={slot('button', 'dwt-button')}
                onClick={() => setConfirming('reset')}
              >
                {labels.reset}
              </button>
              <button
                type="button"
                className={slot('button', 'dwt-button')}
                disabled={snapshot === undefined || savedLayout === snapshot}
                onClick={() => setConfirming('revert')}
              >
                {labels.revertChanges}
              </button>
            </>
          )}
          {pending !== undefined && (
            <InlineConfirm
              message={
                pending === 'reset' ? labels.confirmReset : labels.confirmRevert
              }
              onAnswer={answerConfirmation}
            />
          )}
          <span className="dwt-visually-hidden" aria-live="polite">
            {announcement}
          </span>
        </div>
      )}
      {paged && (
        <PageTabs
          pages={pages}
          activeKey={activeKey}
          idPrefix={instanceId}
          panelId={panelId}
          announcement={pageAnnouncement}
          onSelect={selectPage}
        />
      )}
      {controlsShown && (
        <div
          role="group"
          aria-label={labels.managePages}
          className="dwt-page-manage"
        >
          <button
            type="button"
            className={slot('button', 'dwt-button')}
            disabled={maxPages !== undefined && pages.length >= maxPages}
            onClick={addPageAction}
          >
            {labels.addPage}
          </button>
          {paged && editorMode === 'rename' && (
            <PageRenameForm
              key={activeKey}
              initial={activePage.title}
              onSubmit={renamePageAction}
              onCancel={cancelPageEditor}
            />
          )}
          {paged && editorMode !== 'rename' && (
            <>
              <button
                type="button"
                className={slot('button', 'dwt-button', 'dwt-icon-button')}
                aria-label={labels.renamePage(activePage.title)}
                title={labels.renamePage(activePage.title)}
                onClick={() =>
                  setPageEditor({ mode: 'rename', key: activeKey })
                }
              >
                <span aria-hidden="true">✎</span>
              </button>
              <button
                type="button"
                className={slot('button', 'dwt-button', 'dwt-icon-button')}
                aria-label={labels.movePageLeft(activePage.title)}
                title={labels.movePageLeft(activePage.title)}
                disabled={pages[0]?.key === activeKey}
                onClick={() => change(movePage(layout, activeKey, -1))}
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                type="button"
                className={slot('button', 'dwt-button', 'dwt-icon-button')}
                aria-label={labels.movePageRight(activePage.title)}
                title={labels.movePageRight(activePage.title)}
                disabled={pages.at(-1)?.key === activeKey}
                onClick={() => change(movePage(layout, activeKey, 1))}
              >
                <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className={slot('button', 'dwt-button', 'dwt-icon-button')}
                aria-label={labels.deletePage(activePage.title)}
                title={labels.deletePage(activePage.title)}
                onClick={() =>
                  setPageEditor({ mode: 'delete', key: activeKey })
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
          {paged && editorMode === 'delete' && (
            <InlineConfirm
              message={labels.confirmDeletePage(activePage.title)}
              onAnswer={(yes) =>
                yes ? deletePageAction() : setPageEditor(undefined)
              }
            />
          )}
          {pageError !== undefined && (
            <span role="alert" className="dwt-page-error">
              {pageError}
            </span>
          )}
        </div>
      )}
      <PagePanel
        paged={paged}
        id={panelId}
        labelledBy={`${instanceId}-tab-${pages.findIndex((p) => p.key === activeKey)}`}
      >
        {controlsShown && hidden.length > 0 && (
          <div className={slot('hiddenBar', 'dwt-hidden-bar')}>
            <span className="dwt-hidden-label">{labels.hiddenWidgets}</span>
            {hidden.map((definition) => (
              <button
                key={definition.key}
                type="button"
                className={slot('button', 'dwt-button', 'dwt-show-button')}
                aria-label={labels.show(definition.title)}
                onClick={() => showAction(definition.key)}
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
                onClick={() =>
                  changePage(toggleMinimized(view, definition.key))
                }
              >
                <span aria-hidden="true">▸ </span>
                {definition.title}
              </button>
            ))}
          </div>
        )}
        {visible.length === 0 ? (
          <p className={slot('empty', 'dwt-empty', 'dwt-dashboard-empty')}>
            {paged && pageDefs.length === 0
              ? labels.emptyPage
              : definitions.length === 0
                ? labels.noWidgets
                : labels.allHidden}
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
              const lock: ResolvedWidgetLock = resolveWidgetLock(definition);
              // The widget's own lock, shown even when `overrideLocks` ignores it.
              const ownLock: ResolvedWidgetLock = resolveWidgetLock(
                widget.definition
              );
              const isLocked: boolean =
                ownLock.move || ownLock.hide || ownLock.minimize;
              const lockLabel: string = overrideLocks
                ? labels.lockedForViewers(title)
                : labels.locked(title);
              const canMoveEarlier: boolean =
                !lock.move && moveWidgetBy(pageDefs, view, key, -1) !== view;
              const canMoveLater: boolean =
                !lock.move && moveWidgetBy(pageDefs, view, key, 1) !== view;
              const actions: ReactNode = controlsShown ? (
                <>
                  {isLocked && (
                    <span
                      role="img"
                      className="dwt-lock"
                      aria-label={lockLabel}
                      title={lockLabel}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect
                          x="3"
                          y="7"
                          width="10"
                          height="7"
                          rx="1.5"
                          fill="currentColor"
                        />
                        <path
                          d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                      </svg>
                    </span>
                  )}
                  {!lock.move && (
                    <>
                      <button
                        type="button"
                        className={slot(
                          'button',
                          'dwt-button',
                          'dwt-icon-button'
                        )}
                        aria-label={labels.moveEarlier(title)}
                        title={labels.moveEarlier(title)}
                        disabled={index === 0 || !canMoveEarlier}
                        onClick={() =>
                          changePage(moveWidgetBy(pageDefs, view, key, -1))
                        }
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        className={slot(
                          'button',
                          'dwt-button',
                          'dwt-icon-button'
                        )}
                        aria-label={labels.moveLater(title)}
                        title={labels.moveLater(title)}
                        disabled={index === shown.length - 1 || !canMoveLater}
                        onClick={() =>
                          changePage(moveWidgetBy(pageDefs, view, key, 1))
                        }
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      {paged && (
                        <MoveToPageMenu
                          label={labels.moveToPage(title)}
                          heading={labels.moveToPagePlaceholder}
                          onPick={(pageKey) => moveWidgetAction(key, pageKey)}
                          options={[
                            ...pages
                              .filter((page) => page.key !== activeKey)
                              .map((page) => ({
                                value: page.key,
                                label: labels.moveToPageOption(
                                  page.title,
                                  pageRoom(
                                    definitions,
                                    layout,
                                    page.key,
                                    roomOptions
                                  )?.rowsFree ?? 0
                                ),
                              })),
                            ...(maxPages === undefined ||
                            pages.length < maxPages
                              ? [
                                  {
                                    value: NEW_PAGE_VALUE,
                                    label: labels.newPageOption,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      )}
                    </>
                  )}
                  {!lock.hide && (
                    <button
                      type="button"
                      className={slot(
                        'button',
                        'dwt-button',
                        'dwt-icon-button'
                      )}
                      aria-label={labels.hide(title)}
                      title={labels.hide(title)}
                      onClick={() => changePage(hideWidget(view, key))}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
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
                  minimized={isMinimized(view, key)}
                  editing={toggleMode && controlsShown}
                  {...(actions === undefined ? {} : { actions })}
                  {...(editable && !lock.minimize
                    ? {
                        onToggleMinimized: () =>
                          changePage(toggleMinimized(view, key)),
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
      </PagePanel>
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
