import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  defaultDetailQuery,
  queryRows,
  validateDetailData,
  type DetailCell,
  type DetailColumn,
  type DetailData,
  type DetailProviderOptions,
  type DetailPage,
  type DetailQuery,
  type DetailSort,
} from '../core/detail.js';
import type { WidgetDefinition } from '../core/definition.js';
import type { OptionValues } from '../core/options.js';
import { WidgetLink } from './primitives.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

/**
 * Loads a widget's full detail data. Close over your own context (a Prisma
 * client, a fetch) here; the package never fetches. See `DetailProvider`.
 * Return `undefined` for a widget you have no extra data for: the card's own
 * data is used when it is complete (see `deriveDetailData`).
 */
export type DetailLoader = (
  definition: WidgetDefinition,
  options: DetailProviderOptions
) => DetailData | undefined | Promise<DetailData | undefined>;

export interface WidgetDetailProps {
  /** Table caption: the widget's title. */
  readonly title: string;
  /** The rows to show. Absent while `status` is `loading` or `error`. */
  readonly data?: DetailData;
  /** Controlled: you own the query, so you can keep it in the URL. */
  readonly query: DetailQuery;
  readonly onQueryChange: (query: DetailQuery) => void;
  /** Default `ok`. */
  readonly status?: 'ok' | 'loading' | 'error';
  readonly error?: string;
  readonly onRetry?: () => void;
  /** Heading level of the title, 2 to 6. Default 2. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Id of the heading, so a dialog can label itself with it. */
  readonly headingId?: string;
  readonly className?: string;
}

function nextSort(
  current: DetailSort | undefined,
  column: string
): DetailSort | undefined {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc'
    ? { column, direction: 'desc' }
    : undefined;
}

/** `query` with a new sort (or none), back on the first page. */
function withSort(
  query: DetailQuery,
  sort: DetailSort | undefined
): DetailQuery {
  const { sort: _previous, ...rest } = query;
  return sort === undefined ? { ...rest, page: 1 } : { ...rest, sort, page: 1 };
}

function SortGlyph({
  sort,
  column,
}: {
  readonly sort: DetailSort | undefined;
  readonly column: string;
}): ReactNode {
  if (sort?.column !== column) return <span aria-hidden="true"> ↕</span>;
  return (
    <span aria-hidden="true">{sort.direction === 'asc' ? ' ↑' : ' ↓'}</span>
  );
}

function Cell({
  cell,
  column,
}: {
  readonly cell: DetailCell;
  readonly column: DetailColumn | undefined;
}): ReactNode {
  return (
    <td className={column?.numeric === true ? 'dwt-numeric' : undefined}>
      {cell.href === undefined ? (
        cell.text
      ) : (
        <WidgetLink href={cell.href} className="dwt-link">
          {cell.text}
        </WidgetLink>
      )}
    </td>
  );
}

/**
 * The detail view of a widget: search and column filters, a sortable table
 * and paging, over data you give it (client mode: it filters, sorts and pages
 * in memory with `queryRows`). Controlled by `query`. Use it on its own as a
 * page, or inside `WidgetDetailDialog`.
 */
export function WidgetDetail({
  title,
  data,
  query,
  onQueryChange,
  status = 'ok',
  error,
  onRetry,
  headingLevel = 2,
  headingId,
  className,
}: WidgetDetailProps): ReactNode {
  const slot = useSlotClassName();
  const { labels, locale } = useWidgetSettings();
  const id: string = useId();
  const Heading = `h${headingLevel}` as const;
  const localeTag: string | undefined =
    typeof locale === 'string' ? locale : locale?.[0];

  let page: DetailPage | undefined;
  let problem: string | undefined;
  if (status === 'ok' && data !== undefined) {
    const result = queryRows(data, query, localeTag);
    if (result.ok) page = result.value;
    else problem = result.error;
  }

  function change(patch: Partial<DetailQuery>): void {
    onQueryChange({ ...query, ...patch, page: patch.page ?? 1 });
  }

  let body: ReactNode;
  if (status === 'loading') {
    body = (
      <p role="status" className={slot('status', 'dwt-status')}>
        {labels.loading}
      </p>
    );
  } else if (status === 'error' || problem !== undefined) {
    body = (
      <div role="alert" className={slot('error', 'dwt-error')}>
        <p className="dwt-error-message">{error ?? problem ?? ''}</p>
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
  } else if (data !== undefined && page !== undefined) {
    const columns: readonly DetailColumn[] = data.columns;
    const from: number = (page.page - 1) * query.pageSize + 1;
    const to: number = from + page.rows.length - 1;
    body = (
      <>
        <div className="dwt-detail-controls">
          <label className="dwt-detail-field">
            <span>{labels.search}</span>
            <input
              type="search"
              value={query.search ?? ''}
              onChange={(event) => change({ search: event.target.value })}
            />
          </label>
          {columns
            .filter((column) => column.filterable === true)
            .map((column) => (
              <label key={column.key} className="dwt-detail-field">
                <span>{labels.filterBy(column.label)}</span>
                <input
                  type="search"
                  value={query.filters?.[column.key] ?? ''}
                  onChange={(event) =>
                    change({
                      filters: {
                        ...query.filters,
                        [column.key]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
        </div>
        <p
          className="dwt-detail-summary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {page.totalRows === 0
            ? labels.noResults
            : labels.showingRows(from, to, page.totalRows)}
        </p>
        <div className="dwt-table-wrap">
          <table className={slot('table', 'dwt-table', 'dwt-detail-table')}>
            <caption className="dwt-visually-hidden">{title}</caption>
            <thead>
              <tr>
                {columns.map((column) => {
                  const sorted: boolean = query.sort?.column === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={
                        column.numeric === true ? 'dwt-numeric' : undefined
                      }
                      aria-sort={
                        sorted
                          ? query.sort?.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {column.sortable === false ? (
                        column.label
                      ) : (
                        <button
                          type="button"
                          className="dwt-detail-sort"
                          aria-label={labels.sortBy(column.label)}
                          onClick={() =>
                            onQueryChange(
                              withSort(query, nextSort(query.sort, column.key))
                            )
                          }
                        >
                          {column.label}
                          <SortGlyph sort={query.sort} column={column.key} />
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Cell
                      key={cellIndex}
                      cell={cell}
                      column={columns[cellIndex]}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {page.pageCount > 1 && (
          <nav className="dwt-detail-pager" aria-label={labels.pagination}>
            <button
              type="button"
              className={slot('button', 'dwt-button')}
              disabled={page.page <= 1}
              onClick={() => onQueryChange({ ...query, page: page.page - 1 })}
            >
              {labels.previousPage}
            </button>
            <span>{labels.pageOf(page.page, page.pageCount)}</span>
            <button
              type="button"
              className={slot('button', 'dwt-button')}
              disabled={page.page >= page.pageCount}
              onClick={() => onQueryChange({ ...query, page: page.page + 1 })}
            >
              {labels.nextPage}
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby={headingId ?? `${id}-title`}
      className={slot('detail', 'dwt-detail', className)}
    >
      <Heading
        id={headingId ?? `${id}-title`}
        className={slot('cardTitle', 'dwt-card-title', 'dwt-detail-title')}
      >
        {title}
      </Heading>
      {body}
    </section>
  );
}

export interface WidgetDetailDialogProps {
  readonly title: string;
  readonly open: boolean;
  /** Called on Esc, the Close button and a click on the backdrop. */
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A native modal `<dialog>`: focus is trapped, Esc closes it, the page behind
 * is inert, and focus returns to the control that opened it.
 */
export function WidgetDetailDialog({
  title,
  open,
  onClose,
  children,
}: WidgetDetailDialogProps): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const dialogRef: RefObject<HTMLDialogElement | null> =
    useRef<HTMLDialogElement>(null);
  const titleId: string = useId();

  useEffect(() => {
    const dialog: HTMLDialogElement | null = dialogRef.current;
    if (dialog === null || !open) return undefined;
    // Remember what had focus so closing (or unmounting) can give it back.
    const opener: Element | null = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dwt-detail-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      {open && (
        <div className="dwt-detail-dialog-body">
          <button
            type="button"
            className={slot('button', 'dwt-button', 'dwt-detail-close')}
            onClick={onClose}
          >
            {labels.close}
          </button>
          <span id={titleId} className="dwt-visually-hidden">
            {title}
          </span>
          {children}
        </div>
      )}
    </dialog>
  );
}

const NO_OPTION_VALUES: OptionValues = Object.freeze({});

export interface DetailLoadState {
  readonly status: 'loading' | 'ok' | 'error';
  readonly data?: DetailData;
  readonly error?: string;
}

/**
 * Loads a widget's detail data while `enabled`: calls `load` with an abort
 * signal (aborted on close, retry or unmount), validates the result and
 * reports loading, ok or error. When `load` is missing or returns
 * `undefined`, `fallback` (for example the card's own complete data) is used
 * instead. `reload` runs it again. Keep `load` and `fallback` referentially
 * stable (`useCallback` / `useMemo`): a new value restarts the load.
 * `optionValues` (the widget's resolved options) go to the loader as
 * `options.options`.
 */
export function useDetailData(
  definition: WidgetDefinition,
  load: DetailLoader | undefined,
  enabled: boolean,
  fallback?: DetailData,
  optionValues: OptionValues = NO_OPTION_VALUES
): { readonly state: DetailLoadState; readonly reload: () => void } {
  const [state, setState] = useState<DetailLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState({ status: 'loading' });
    Promise.resolve()
      .then(() =>
        load === undefined
          ? undefined
          : load(definition, {
              signal: controller.signal,
              options: optionValues,
              query: defaultDetailQuery(),
            })
      )
      .then((raw) => {
        if (controller.signal.aborted) return;
        const data: DetailData | undefined = raw ?? fallback;
        if (data === undefined) {
          setState({
            status: 'error',
            error: `Widget "${definition.key}" detail: no data. The loader returned nothing for this widget and its card does not hold the full data (use a loader that returns rows, or a TABLE without a footer or a BAR_LIST).`,
          });
          return;
        }
        const checked = validateDetailData(
          data,
          `Widget "${definition.key}" detail`
        );
        setState(
          checked.ok
            ? { status: 'ok', data: checked.value }
            : { status: 'error', error: checked.error }
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: `Widget "${definition.key}" detail: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        });
      });
    return () => controller.abort();
  }, [enabled, load, fallback, definition, optionValues, attempt]);

  return { state, reload: () => setAttempt((count) => count + 1) };
}
