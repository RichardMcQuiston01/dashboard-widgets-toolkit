import {
  computed,
  defineComponent,
  h,
  shallowRef,
  watch,
  type ComputedRef,
  type ShallowRef,
  type VNode,
} from 'vue';

import type { WidgetDefinition } from '../core/definition.js';
import {
  clampServerQuery,
  defaultDetailQuery,
  deriveDetailData,
  resolveDetailOptions,
  sanitizeDetailQuery,
  type DetailData,
  type DetailLoader,
  type DetailMode,
  type DetailQuery,
  type DetailSort,
  type ServerDetailOptions,
} from '../core/detail.js';
import { sortFromOptions, type OptionValues } from '../core/options.js';
import type { DashboardWidget } from '../core/resolve.js';
import type {
  DetailExportRequest,
  ExportFile,
  ExportFormat,
} from '../react/download.js';
import { WidgetDetail, WidgetDetailDialog, useDetailData } from './detail.js';
import { useWidgetSettings } from './settings.js';

/** A stable stand-in for a widget without options or filters (identity matters). */
const NO_VALUES: OptionValues = Object.freeze({});

/** What a detail view shows when it opens: the page size and the table's sort. */
export function initialDetailQuery(widget: DashboardWidget): DetailQuery {
  const pageSize: number =
    resolveDetailOptions(widget.definition)?.pageSize ?? 25;
  const optionSort: DetailSort | undefined = sortFromOptions(
    widget.definition,
    widget.options
  );
  return {
    ...defaultDetailQuery(pageSize),
    ...(optionSort === undefined ? {} : { sort: optionSort }),
  };
}

export interface DetailHostProps {
  readonly widget: DashboardWidget;
  /** The view the card loads: `base` or a view the provider supplies. */
  readonly view: string;
  readonly query: DetailQuery;
  readonly onQueryChange: (query: DetailQuery) => void;
  readonly loadDetail: DetailLoader | undefined;
  readonly onClose: () => void;
  readonly exportFormats: readonly ExportFormat[] | undefined;
  readonly onExport: ((file: ExportFile) => void) | undefined;
  readonly onExportError: ((message: string) => void) | undefined;
  readonly onExportDetail:
    | ((
        request: DetailExportRequest
      ) => DetailData | undefined | Promise<DetailData | undefined>)
    | undefined;
}

/** The built-in dialog for one widget's detail view. */
export const DetailHost = defineComponent(
  (props: DetailHostProps) => {
    const settings = useWidgetSettings();
    // Viewer settings and views rebuild the definition on every dashboard
    // render (typing in the search box included); reloading the detail each
    // time would flash a spinner. Definitions are plain JSON, so compare by
    // content.
    const definition: ShallowRef<WidgetDefinition> = shallowRef(
      props.widget.definition
    );
    watch(
      () => JSON.stringify(props.widget.definition),
      () => {
        definition.value = props.widget.definition;
      }
    );
    const options = computed(() => resolveDetailOptions(definition.value));
    // Derived from the card's data once per change of the data or the locale,
    // not once per dashboard render: a new object would restart the load.
    const derived: ShallowRef<DetailData | undefined> = shallowRef(undefined);
    watch(
      [
        () => (props.widget.status === 'ok' ? props.widget.data : undefined),
        () => settings.value.locale,
      ],
      ([cardData, locale]) => {
        derived.value =
          cardData === undefined
            ? undefined
            : deriveDetailData(cardData, locale);
      },
      { immediate: true }
    );
    const mode: ComputedRef<DetailMode> = computed(
      () => options.value?.mode ?? 'client'
    );
    const serverOptions: ComputedRef<ServerDetailOptions | undefined> =
      computed(() =>
        mode.value === 'server' ? { query: props.query } : undefined
      );
    const { state, reload } = useDetailData(
      definition,
      () => props.loadDetail,
      true,
      derived,
      () => props.widget.options ?? NO_VALUES,
      serverOptions,
      () => props.widget.filters ?? NO_VALUES,
      () => props.view
    );

    // Rows were removed while the viewer was on the last page: ask for the new
    // last page instead of showing an empty one.
    watch(
      () =>
        [
          mode.value,
          state.value.data,
          state.value.refreshing,
          props.query,
        ] as const,
      ([currentMode, data, refreshing, query]) => {
        if (
          currentMode !== 'server' ||
          data === undefined ||
          refreshing === true
        ) {
          return;
        }
        const corrected: DetailQuery | undefined = clampServerQuery(
          data,
          query
        );
        if (corrected !== undefined) props.onQueryChange(corrected);
      }
    );
    // A query that came from a URL can name columns the data does not have:
    // drop those parts instead of showing an error.
    watch(
      () => [state.value.data, props.query] as const,
      ([data, query]) => {
        if (data === undefined) return;
        const cleaned: DetailQuery = sanitizeDetailQuery(query, data.columns);
        if (cleaned !== query) props.onQueryChange(cleaned);
      }
    );

    return (): VNode => {
      const current = options.value;
      const title: string = current?.title ?? definition.value.title;
      const { data, error } = state.value;
      return h(
        WidgetDetailDialog,
        { title, open: true, onClose: props.onClose },
        {
          default: () =>
            h(WidgetDetail, {
              title,
              widgetKey: definition.value.key,
              query: props.query,
              onQueryChange: props.onQueryChange,
              status: state.value.status,
              data,
              error,
              onRetry: reload,
              mode: mode.value,
              busy: state.value.refreshing === true,
              pageSizes:
                current === undefined || current.pageSizes.length < 2
                  ? undefined
                  : current.pageSizes,
              columnVisibility: current?.columnVisibility === true,
              exportFormats: props.exportFormats,
              onExport: props.onExport,
              onExportError: props.onExportError,
              onExportAll: props.onExportDetail,
            }),
        }
      );
    };
  },
  {
    name: 'DetailHost',
    props: [
      'widget',
      'view',
      'query',
      'onQueryChange',
      'loadDetail',
      'onClose',
      'exportFormats',
      'onExport',
      'onExportError',
      'onExportDetail',
    ],
  }
);
