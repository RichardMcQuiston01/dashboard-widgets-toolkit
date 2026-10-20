import {
  computed,
  defineComponent,
  h,
  onMounted,
  ref,
  shallowRef,
  useId,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
  type VNode,
  type VNodeChild,
} from 'vue';

import {
  resolveWidgetLock,
  type ResolvedWidgetLock,
  type WidgetDefinition,
} from '../core/definition.js';
import { usesWidthColumns } from '../core/grid.js';
import {
  EMPTY_LAYOUT,
  MAX_PAGE_TITLE_LENGTH,
  enforceLocks,
  hiddenWidgets,
  hideWidget,
  isMinimized,
  moveWidgetBy,
  showWidget,
  toggleMinimized,
  visibleWidgets,
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
import type { DashboardWidget } from '../core/resolve.js';
import type { WidgetSelection } from '../core/select.js';
import { applySettings, isOptionsLocked } from '../core/settings.js';
import type { WidgetThemeStyles } from '../core/theme.js';
import { applyView } from '../core/views.js';
import type { ExportFile, ExportFormat } from '../react/download.js';
import { ResolvedWidgetCard } from './card.js';
import { InlineConfirm } from './confirm.js';
import { WidgetEditMenu, type EditMenuItem } from './edit-menu.js';
import { spanProps, useFillSpans, widthProps } from './grid-spans.js';
import {
  WidgetSettingsProvider,
  useSlotClassName,
  useWidgetSettings,
  type WidgetSettings,
} from './settings.js';
import { WidgetTheme } from './theme.js';

/** The "New page…" choice of a card's move-to-page menu. */
const NEW_PAGE_VALUE = '__new-page__';

/** The props both grids hand to each card. */
interface CardPassThrough {
  readonly onRetry?: ((key: string) => void) | undefined;
  readonly onSelect?: ((selection: WidgetSelection) => void) | undefined;
  readonly exportFormats?: readonly ExportFormat[] | undefined;
  readonly onExport?: ((file: ExportFile) => void) | undefined;
  readonly onExportError?: ((message: string) => void) | undefined;
  readonly freshness?: boolean | undefined;
  readonly onRefresh?: ((key: string) => void) | undefined;
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined;
}

const CARD_PASS_THROUGH_PROPS: (keyof CardPassThrough)[] = [
  'onRetry',
  'onSelect',
  'exportFormats',
  'onExport',
  'onExportError',
  'freshness',
  'onRefresh',
  'headingLevel',
];

function cardPassThrough(
  props: CardPassThrough,
  widget: DashboardWidget
): Record<string, unknown> {
  const key: string = widget.definition.key;
  return {
    onSelect: props.onSelect,
    exportFormats: props.exportFormats,
    onExport: props.onExport,
    onExportError: props.onExportError,
    freshness: props.freshness,
    headingLevel: props.headingLevel,
    onRefresh:
      props.onRefresh === undefined ? undefined : () => props.onRefresh?.(key),
    onRetry:
      props.onRetry === undefined || widget.status !== 'error'
        ? undefined
        : () => props.onRetry?.(key),
  };
}

export interface WidgetGridProps extends CardPassThrough {
  /** Rendered in the order given. */
  readonly widgets: readonly DashboardWidget[];
  readonly className?: string | undefined;
}

/** A plain grid of widget cards, no layout controls. */
export const WidgetGrid = defineComponent(
  (props: WidgetGridProps) => {
    const slot = useSlotClassName();
    const gridRef: Ref<HTMLElement | null> = ref(null);
    const definitions = (): WidgetDefinition[] =>
      props.widgets.map((w) => w.definition);
    const spans = useFillSpans(definitions, gridRef, () =>
      usesWidthColumns(definitions())
    );
    return (): VNode => {
      const twelve: boolean = usesWidthColumns(definitions());
      return h(
        'div',
        {
          ref: gridRef,
          class: slot(
            'grid',
            'dwt-grid',
            twelve && 'dwt-grid--twelve',
            props.className
          ),
        },
        props.widgets.map((widget) =>
          h(ResolvedWidgetCard, {
            key: widget.definition.key,
            widget,
            ...spanProps(spans.value, widget.definition.key),
            ...widthProps(twelve, widget.definition),
            ...cardPassThrough(props, widget),
          })
        )
      );
    };
  },
  {
    name: 'WidgetGrid',
    props: ['widgets', 'className', ...CARD_PASS_THROUGH_PROPS],
  }
);

/** The tab list of a paged dashboard: tabs on wide screens, dots on narrow. */
const PageTabs = defineComponent(
  (props: {
    readonly pages: readonly LayoutPage[];
    readonly activeKey: string;
    readonly idPrefix: string;
    readonly panelId: string;
    readonly announcement: string;
    readonly onSelect: (pageKey: string) => void;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const tabs = new Map<string, HTMLElement>();

    function onKeyDown(event: KeyboardEvent, index: number): void {
      const last: number = props.pages.length - 1;
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
      const target: LayoutPage | undefined = props.pages[next];
      if (target === undefined) return;
      props.onSelect(target.key);
      tabs.get(target.key)?.focus();
    }

    return (): VNode => {
      const { labels } = settings.value;
      const { pages, activeKey, idPrefix, panelId } = props;
      const activeIndex: number = pages.findIndex((p) => p.key === activeKey);
      return h('div', { class: slot('pageBar', 'dwt-pages') }, [
        h(
          'button',
          {
            type: 'button',
            class: slot(
              'button',
              'dwt-button',
              'dwt-icon-button',
              'dwt-page-nav'
            ),
            'aria-label': labels.previousPageButton,
            disabled: activeIndex <= 0,
            onClick: () =>
              props.onSelect((pages[activeIndex - 1] as LayoutPage).key),
          },
          [h('span', { 'aria-hidden': 'true' }, '‹')]
        ),
        h(
          'div',
          {
            role: 'tablist',
            'aria-label': labels.pageBar,
            class: 'dwt-page-tabs',
          },
          pages.map((page, index) => {
            const selected: boolean = page.key === activeKey;
            return h(
              'button',
              {
                key: page.key,
                ref: (element: unknown) => {
                  if (element === null) tabs.delete(page.key);
                  else tabs.set(page.key, element as HTMLElement);
                },
                type: 'button',
                role: 'tab',
                id: `${idPrefix}-tab-${index}`,
                'aria-selected': selected,
                'aria-controls': panelId,
                'aria-label': labels.pageTabName(
                  index + 1,
                  pages.length,
                  page.title
                ),
                title: page.title,
                tabindex: selected ? 0 : -1,
                'data-page-key': page.key,
                class: slot('button', 'dwt-page-tab'),
                onClick: () => props.onSelect(page.key),
                onKeydown: (event: KeyboardEvent) => onKeyDown(event, index),
              },
              [
                h('span', { class: 'dwt-page-tab-title' }, page.title),
                h('span', { class: 'dwt-page-dot', 'aria-hidden': 'true' }),
              ]
            );
          })
        ),
        h(
          'button',
          {
            type: 'button',
            class: slot(
              'button',
              'dwt-button',
              'dwt-icon-button',
              'dwt-page-nav'
            ),
            'aria-label': labels.nextPageButton,
            disabled: activeIndex === pages.length - 1,
            onClick: () =>
              props.onSelect((pages[activeIndex + 1] as LayoutPage).key),
          },
          [h('span', { 'aria-hidden': 'true' }, '›')]
        ),
        h(
          'span',
          { class: 'dwt-visually-hidden', 'aria-live': 'polite' },
          props.announcement
        ),
      ]);
    };
  },
  {
    name: 'PageTabs',
    props: [
      'pages',
      'activeKey',
      'idPrefix',
      'panelId',
      'announcement',
      'onSelect',
    ],
  }
);

/** A small form to rename a page. `onSubmit` returns an error to show. */
const PageRenameForm = defineComponent(
  (props: {
    readonly initial: string;
    readonly onSubmit: (title: string) => string | undefined;
    readonly onCancel: () => void;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const title: Ref<string> = ref(props.initial);
    const error: Ref<string | undefined> = ref(undefined);
    const input: Ref<HTMLInputElement | null> = ref(null);
    onMounted(() => {
      input.value?.focus();
      input.value?.select();
    });
    return (): VNode => {
      const { labels } = settings.value;
      return h(
        'form',
        {
          class: 'dwt-page-rename',
          onSubmit: (event: Event) => {
            event.preventDefault();
            error.value = props.onSubmit(title.value);
          },
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              props.onCancel();
            }
          },
        },
        [
          h('input', {
            ref: input,
            type: 'text',
            class: 'dwt-page-title-input',
            'aria-label': labels.pageTitle,
            'aria-invalid': error.value !== undefined,
            maxlength: MAX_PAGE_TITLE_LENGTH,
            value: title.value,
            onInput: (event: Event) => {
              title.value = (event.target as HTMLInputElement).value;
            },
          }),
          h(
            'button',
            {
              type: 'submit',
              class: slot('button', 'dwt-button', 'dwt-icon-button'),
              'aria-label': labels.savePageTitle,
              title: labels.savePageTitle,
            },
            [h('span', { 'aria-hidden': 'true' }, '✓')]
          ),
          h(
            'button',
            {
              type: 'button',
              class: slot('button', 'dwt-button', 'dwt-icon-button'),
              'aria-label': labels.cancelPageTitle,
              title: labels.cancelPageTitle,
              onClick: props.onCancel,
            },
            [h('span', { 'aria-hidden': 'true' }, '✕')]
          ),
          error.value === undefined
            ? null
            : h(
                'span',
                { role: 'alert', class: 'dwt-page-error' },
                error.value
              ),
        ]
      );
    };
  },
  { name: 'PageRenameForm', props: ['initial', 'onSubmit', 'onCancel'] }
);

/** The definition without its lock, for `overrideLocks`. */
function withoutLock(definition: WidgetDefinition): WidgetDefinition {
  if (definition.locked === undefined) return definition;
  const copy: { -readonly [K in keyof WidgetDefinition]: WidgetDefinition[K] } =
    { ...definition };
  delete copy.locked;
  return copy;
}

export interface DashboardProps extends WidgetSettings, CardPassThrough {
  /**
   * A theme from `createTheme`: the dashboard renders its `<style>` and sits
   * inside its scope (see `WidgetTheme`), so this one prop themes it.
   */
  readonly theme?: WidgetThemeStyles | undefined;
  /** Resolved (or loading) widgets, any order: the layout orders them. */
  readonly widgets: readonly DashboardWidget[];
  /** The viewer's saved layout. Default: none saved. */
  readonly layout?: DashboardLayout | undefined;
  /**
   * Called with the next layout after a move, hide, show, minimize or
   * restore; persist it. Without it the layout is read-only (no controls).
   */
  readonly onLayoutChange?: ((layout: DashboardLayout) => void) | undefined;
  /** Ignore widget `locked` settings (for administrators editing the default layout). */
  readonly overrideLocks?: boolean | undefined;
  /**
   * `always` (default): move and hide controls show whenever `onLayoutChange`
   * is set. `toggle`: they show only while editing, behind a Customize button.
   */
  readonly editMode?: 'always' | 'toggle' | undefined;
  /** Controlled editing state (`editMode="toggle"`). */
  readonly editing?: boolean | undefined;
  /** Initial editing state when uncontrolled. Default false. */
  readonly defaultEditing?: boolean | undefined;
  /** Called when the viewer starts or finishes editing. */
  readonly onEditingChange?: ((editing: boolean) => void) | undefined;
  /** What Reset layout restores. Default: the empty layout (sortOrder order). */
  readonly defaultLayout?: DashboardLayout | undefined;
  /** Show the built-in Customize/Done/Reset toolbar (toggle mode). Default true. */
  readonly toolbar?: boolean | undefined;
  /** The page in view (a page key) when the layout has pages. */
  readonly activePage?: string | undefined;
  readonly defaultActivePage?: string | undefined;
  readonly onActivePageChange?: ((pageKey: string) => void) | undefined;
  /** The layout from before the current edit session, for Revert. */
  readonly backup?: DashboardLayout | null | undefined;
  /** Called with the layout at the start of an edit session, and with null when it ends. */
  readonly onBackup?: ((backup: DashboardLayout | null) => void) | undefined;
  /** Rows a page holds unless the page says otherwise. Default 4. */
  readonly maxRows?: number | undefined;
  /** Most pages the viewer can add while editing. Default: no limit. */
  readonly maxPages?: number | undefined;
  readonly className?: string | undefined;
}

const DASHBOARD_PROPS: (keyof DashboardProps)[] = [
  'locale',
  'linkTarget',
  'classNames',
  'labels',
  'formatters',
  'onFormatterError',
  'theme',
  'widgets',
  'layout',
  'onLayoutChange',
  'overrideLocks',
  'editMode',
  'editing',
  'defaultEditing',
  'onEditingChange',
  'defaultLayout',
  'toolbar',
  'activePage',
  'defaultActivePage',
  'onActivePageChange',
  'backup',
  'onBackup',
  'maxRows',
  'maxPages',
  'className',
  ...CARD_PASS_THROUGH_PROPS,
];

/** Everything the render function needs, derived from the props and state. */
interface DashboardModel {
  readonly definitions: WidgetDefinition[];
  readonly layout: DashboardLayout;
  readonly byKey: ReadonlyMap<string, DashboardWidget>;
  readonly pages: readonly LayoutPage[];
  readonly paged: boolean;
  readonly activePage: LayoutPage;
  readonly activeKey: string;
  readonly pageDefs: WidgetDefinition[];
  readonly view: DashboardLayout;
  readonly visible: WidgetDefinition[];
  readonly hidden: WidgetDefinition[];
  readonly minimized: WidgetDefinition[];
  readonly shown: WidgetDefinition[];
  readonly twelve: boolean;
  readonly roomOptions: PageOptions;
}

const DashboardInner = defineComponent(
  (props: DashboardProps) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const instanceId: string = useId();
    const panelId = `${instanceId}-panel`;

    const activeState: Ref<string | undefined> = ref(props.defaultActivePage);
    const editingState: Ref<boolean> = ref(props.defaultEditing ?? false);
    // A shallow ref, so Revert's identity check sees the layout itself, not a proxy.
    const snapshot: ShallowRef<DashboardLayout | undefined> =
      shallowRef(undefined);
    const confirming: Ref<'reset' | 'revert' | undefined> = ref(undefined);
    const announcement: Ref<string> = ref('');
    const pageAnnouncement: Ref<string> = ref('');
    const pageError: Ref<string | undefined> = ref(undefined);
    /** A page just added through Add page and still being named: cancelling removes it. */
    const newPage: Ref<
      { readonly key: string; readonly activeBefore: string } | undefined
    > = ref(undefined);
    const pageEditor: Ref<
      { readonly mode: 'rename' | 'delete'; readonly key: string } | undefined
    > = ref(undefined);
    const toggleButton: Ref<HTMLButtonElement | null> = ref(null);
    const resetButton: Ref<HTMLButtonElement | null> = ref(null);
    const gridRef: Ref<HTMLElement | null> = ref(null);

    const editable: ComputedRef<boolean> = computed(
      () => props.onLayoutChange !== undefined
    );
    const toggleMode: ComputedRef<boolean> = computed(
      () => (props.editMode ?? 'always') === 'toggle'
    );
    const editing: ComputedRef<boolean> = computed(
      () => props.editing ?? editingState.value
    );
    // Move, hide and the other layout controls: always, or only while editing.
    const controlsShown: ComputedRef<boolean> = computed(
      () => editable.value && (!toggleMode.value || editing.value)
    );

    const model: ComputedRef<DashboardModel> = computed(() => {
      const savedLayout: DashboardLayout = props.layout ?? EMPTY_LAYOUT;
      const overrideLocks: boolean = props.overrideLocks ?? false;
      const { locale } = settings.value;
      // The viewer's titles, widths and view choices are applied on top of each
      // definition, except for widgets locked against options.
      const effectiveWidgets: DashboardWidget[] = props.widgets.map((w) => {
        const viewer =
          !overrideLocks && isOptionsLocked(w.definition)
            ? undefined
            : savedLayout.settings?.[w.definition.key];
        const styled: DashboardWidget =
          viewer === undefined
            ? w
            : { ...w, definition: applySettings(w.definition, viewer) };
        return applyView(styled, viewer?.view, {
          ...(locale === undefined ? {} : { locale }),
        });
      });
      const definitions: WidgetDefinition[] = effectiveWidgets.map((w) =>
        overrideLocks ? withoutLock(w.definition) : w.definition
      );
      // A saved layout can predate a lock (or be edited by hand), so what a
      // lock forbids is removed before anything is shown.
      const layout: DashboardLayout = enforceLocks(definitions, savedLayout);
      const pages: readonly LayoutPage[] = pageList(layout);
      const requested: string | undefined =
        props.activePage ?? activeState.value;
      const activePage: LayoutPage =
        pages.find((page) => page.key === requested) ??
        (pages[0] as LayoutPage);
      const activeKey: string = activePage.key;
      const pageDefs: WidgetDefinition[] =
        assignPages(definitions, layout).get(activeKey) ?? [];
      const view: DashboardLayout = pageLayout(layout, activeKey) ?? layout;
      const visible: WidgetDefinition[] = visibleWidgets(pageDefs, view);
      // Minimized widgets leave the grid for their own bar. Without layout
      // controls there is no way to restore them, so a read-only dashboard
      // shows them as normal cards.
      const minimized: WidgetDefinition[] = editable.value
        ? visible.filter((definition) => isMinimized(view, definition.key))
        : [];
      const shown: WidgetDefinition[] = editable.value
        ? visible.filter((definition) => !isMinimized(view, definition.key))
        : visible;
      return {
        definitions,
        layout,
        byKey: new Map(effectiveWidgets.map((w) => [w.definition.key, w])),
        pages,
        paged: pages.length >= 2,
        activePage,
        activeKey,
        pageDefs,
        view,
        visible,
        hidden: hiddenWidgets(pageDefs, view),
        minimized,
        shown,
        twelve: usesWidthColumns(shown),
        roomOptions:
          props.maxRows === undefined ? {} : { maxRows: props.maxRows },
      };
    });

    const spans = useFillSpans(
      () => model.value.shown,
      gridRef,
      () => model.value.twelve
    );

    // Editing keeps a snapshot of the layout from when it began, for Revert.
    watch(
      () => toggleMode.value && editable.value && editing.value,
      (on) => {
        if (!on) snapshot.value = undefined;
        else if (snapshot.value === undefined) {
          snapshot.value = props.backup ?? props.layout ?? EMPTY_LAYOUT;
        }
      },
      { immediate: true }
    );
    // Tell the store about the snapshot once per session, and clear it at the end.
    let reportedBackup: DashboardLayout | null = null;
    function reportBackup(): void {
      const current: DashboardLayout | undefined = snapshot.value;
      if (current === undefined) {
        if (reportedBackup !== null) {
          reportedBackup = null;
          props.onBackup?.(null);
        }
        return;
      }
      if (reportedBackup === current) return;
      reportedBackup = current;
      if (current !== props.backup) props.onBackup?.(current);
    }
    onMounted(reportBackup);
    watch(snapshot, reportBackup);

    function change(next: DashboardLayout): void {
      if (next !== model.value.layout) props.onLayoutChange?.(next);
    }

    /** Applies a change made to the page in view (a page-level layout). */
    function changePage(next: DashboardLayout): void {
      pageError.value = undefined;
      change(withPageLayout(model.value.layout, model.value.activeKey, next));
    }

    function selectPage(pageKey: string): void {
      const { pages } = model.value;
      const index: number = pages.findIndex((page) => page.key === pageKey);
      if (index === -1) return;
      if (props.activePage === undefined) activeState.value = pageKey;
      props.onActivePageChange?.(pageKey);
      pageError.value = undefined;
      pageEditor.value = undefined;
      newPage.value = undefined;
      pageAnnouncement.value = settings.value.labels.pageTabName(
        index + 1,
        pages.length,
        (pages[index] as LayoutPage).title
      );
    }

    function addPageAction(): void {
      const added = addPage(model.value.layout);
      if (!added.ok) {
        pageError.value = added.error;
        return;
      }
      change(added.value);
      const created: LayoutPage | undefined = added.value.pages?.at(-1);
      if (created !== undefined) {
        newPage.value = {
          key: created.key,
          activeBefore: model.value.activeKey,
        };
        if (props.activePage === undefined) activeState.value = created.key;
        props.onActivePageChange?.(created.key);
        pageError.value = undefined;
        pageEditor.value = { mode: 'rename', key: created.key };
      }
    }

    function renamePageAction(title: string): string | undefined {
      const renamed = renamePage(
        model.value.layout,
        model.value.activeKey,
        title
      );
      if (!renamed.ok) return renamed.error;
      change(renamed.value);
      pageEditor.value = undefined;
      newPage.value = undefined;
      return undefined;
    }

    /** Escape or ✕ in the page name form: a page that was just added goes away again. */
    function cancelPageEditor(): void {
      const fresh = newPage.value;
      pageEditor.value = undefined;
      newPage.value = undefined;
      if (fresh === undefined || fresh.key !== model.value.activeKey) return;
      // The page is brand new and empty, so dropping it is exact: nothing moves.
      const { pages, layout } = model.value;
      const pagesWithout: LayoutPage[] = pages.filter(
        (page) => page.key !== fresh.key
      );
      if (pagesWithout.length === pages.length) return;
      change({ ...layout, pages: pagesWithout });
      selectPage(fresh.activeBefore);
    }

    function deletePageAction(): void {
      const { pages, activeKey, definitions, layout, roomOptions } =
        model.value;
      const index: number = pages.findIndex((page) => page.key === activeKey);
      const removed = removePage(definitions, layout, activeKey, roomOptions);
      pageEditor.value = undefined;
      if (!removed.ok) {
        pageError.value = removed.error;
        return;
      }
      const neighbor: LayoutPage | undefined = pages[index > 0 ? index - 1 : 1];
      change(removed.value);
      if (neighbor !== undefined) selectPage(neighbor.key);
    }

    function moveWidgetAction(widgetKey: string, targetKey: string): void {
      const { definitions, layout, roomOptions, byKey } = model.value;
      let target: string = targetKey;
      let base: DashboardLayout = layout;
      if (targetKey === NEW_PAGE_VALUE) {
        const added = addPage(layout);
        if (!added.ok) {
          pageError.value = added.error;
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
        pageError.value = moved.error;
        return;
      }
      pageError.value = undefined;
      change(moved.value);
      const destination: LayoutPage | undefined = moved.value.pages?.find(
        (page) => page.key === target
      );
      pageAnnouncement.value = settings.value.labels.movedToPage(
        byKey.get(widgetKey)?.definition.title ?? widgetKey,
        destination?.title ?? target
      );
    }

    /** Restores a hidden widget, unless that would overflow a paged page. */
    function showAction(widgetKey: string): void {
      const { layout, activeKey, view, definitions, roomOptions, activePage } =
        model.value;
      const next: DashboardLayout = withPageLayout(
        layout,
        activeKey,
        showWidget(view, widgetKey)
      );
      if (hasPages(next)) {
        const room = pageRoom(definitions, next, activeKey, roomOptions);
        if (room !== undefined && room.rowsUsed > room.maxRows) {
          pageError.value = settings.value.labels.pageFull(
            activePage.title,
            room.maxRows
          );
          return;
        }
      }
      pageError.value = undefined;
      change(next);
    }

    function setEditing(next: boolean): void {
      if (props.editing === undefined) editingState.value = next;
      props.onEditingChange?.(next);
      const { labels } = settings.value;
      announcement.value = next ? labels.editingOn : labels.editingOff;
      confirming.value = undefined;
    }

    function answerConfirmation(yes: boolean): void {
      const which: 'reset' | 'revert' | undefined = editing.value
        ? confirming.value
        : undefined;
      confirming.value = undefined;
      const { definitions, layout } = model.value;
      if (yes && which === 'reset') {
        // Reset layout restores the arrangement only: the viewer's titles,
        // widths and option values stay.
        const arranged: DashboardLayout = enforceLocks(
          definitions,
          props.defaultLayout ?? EMPTY_LAYOUT
        );
        const {
          settings: _defaultSettings,
          clones: _defaultClones,
          ...arrangement
        } = arranged;
        void _defaultSettings;
        void _defaultClones;
        change({
          ...arrangement,
          ...(layout.settings === undefined
            ? {}
            : { settings: layout.settings }),
          ...(layout.clones === undefined ? {} : { clones: layout.clones }),
        });
      } else if (yes && which === 'revert' && snapshot.value !== undefined) {
        change(snapshot.value);
      }
      // Focus goes back to the control that asked.
      (which === 'revert' ? toggleButton : resetButton).value?.focus();
    }

    /** The Arrange menu of one card. */
    function editItems(
      definition: WidgetDefinition,
      index: number,
      lock: ResolvedWidgetLock
    ): EditMenuItem[] {
      const { labels } = settings.value;
      const { pageDefs, view, shown, paged, pages, activeKey, definitions } =
        model.value;
      const layout = model.value.layout;
      const roomOptions = model.value.roomOptions;
      const key: string = definition.key;
      const title: string = definition.title;
      const canMoveEarlier: boolean =
        !lock.move && moveWidgetBy(pageDefs, view, key, -1) !== view;
      const canMoveLater: boolean =
        !lock.move && moveWidgetBy(pageDefs, view, key, 1) !== view;
      const roomLabel = (page: LayoutPage): string =>
        labels.moveToPageOption(
          page.title,
          pageRoom(definitions, layout, page.key, roomOptions)?.rowsFree ?? 0
        );
      const pageTargets: EditMenuItem[] =
        paged && !lock.move
          ? [
              {
                kind: 'heading',
                key: 'page-heading',
                label: labels.moveToPagePlaceholder,
              },
              ...pages
                .filter((page) => page.key !== activeKey)
                .map((page): EditMenuItem => ({
                  kind: 'action',
                  key: `page:${page.key}`,
                  label: roomLabel(page),
                  ariaLabel: roomLabel(page),
                  onSelect: () => moveWidgetAction(key, page.key),
                })),
              ...(props.maxPages === undefined || pages.length < props.maxPages
                ? [
                    {
                      kind: 'action' as const,
                      key: 'page:new',
                      label: labels.newPageOption,
                      onSelect: () => moveWidgetAction(key, NEW_PAGE_VALUE),
                    },
                  ]
                : []),
            ]
          : [];
      return [
        ...(lock.move
          ? []
          : [
              {
                kind: 'action' as const,
                key: 'earlier',
                label: labels.menuMoveEarlier,
                ariaLabel: labels.moveEarlier(title),
                disabled: index === 0 || !canMoveEarlier,
                onSelect: () =>
                  changePage(moveWidgetBy(pageDefs, view, key, -1)),
              },
              {
                kind: 'action' as const,
                key: 'later',
                label: labels.menuMoveLater,
                ariaLabel: labels.moveLater(title),
                disabled: index === shown.length - 1 || !canMoveLater,
                onSelect: () =>
                  changePage(moveWidgetBy(pageDefs, view, key, 1)),
              },
            ]),
        ...pageTargets,
        ...(lock.hide
          ? []
          : [
              {
                kind: 'action' as const,
                key: 'hide',
                label: labels.menuHide,
                ariaLabel: labels.hide(title),
                onSelect: () => changePage(hideWidget(view, key)),
              },
            ]),
      ];
    }

    function renderCard(
      definition: WidgetDefinition,
      index: number
    ): VNode | null {
      const { labels } = settings.value;
      const { byKey, view, twelve } = model.value;
      const overrideLocks: boolean = props.overrideLocks ?? false;
      const widget: DashboardWidget | undefined = byKey.get(definition.key);
      if (widget === undefined) return null;
      const key: string = definition.key;
      const title: string = definition.title;
      const lock: ResolvedWidgetLock = resolveWidgetLock(definition);
      // The widget's own lock, shown even when `overrideLocks` ignores it.
      const ownLock: ResolvedWidgetLock = resolveWidgetLock(widget.definition);
      const isLocked: boolean =
        ownLock.move || ownLock.hide || ownLock.minimize;
      const lockLabel: string = overrideLocks
        ? labels.lockedForViewers(title)
        : labels.locked(title);
      const items: EditMenuItem[] = editItems(definition, index, lock);
      const actions = controlsShown.value
        ? (): VNodeChild[] => [
            isLocked
              ? h(
                  'span',
                  {
                    role: 'img',
                    class: 'dwt-lock',
                    'aria-label': lockLabel,
                    title: lockLabel,
                  },
                  [
                    h(
                      'svg',
                      {
                        viewBox: '0 0 16 16',
                        width: '14',
                        height: '14',
                        'aria-hidden': 'true',
                        focusable: 'false',
                      },
                      [
                        h('rect', {
                          x: '3',
                          y: '7',
                          width: '10',
                          height: '7',
                          rx: '1.5',
                          fill: 'currentColor',
                        }),
                        h('path', {
                          d: 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2',
                          fill: 'none',
                          stroke: 'currentColor',
                          'stroke-width': '1.4',
                        }),
                      ]
                    ),
                  ]
                )
              : null,
            items.length > 0
              ? h(WidgetEditMenu, {
                  label: labels.arrangeWidget(title),
                  items,
                })
              : null,
          ]
        : undefined;
      const authorTitle: string =
        props.widgets.find((w) => w.definition.key === key)?.definition.title ??
        definition.title;
      return h(
        ResolvedWidgetCard,
        {
          key,
          widget,
          defaultTitle: authorTitle,
          ...spanProps(spans.value, key),
          ...widthProps(twelve, definition),
          minimized: isMinimized(view, key),
          editing: toggleMode.value && controlsShown.value,
          onToggleMinimized:
            editable.value && !lock.minimize
              ? () => changePage(toggleMinimized(view, key))
              : undefined,
          ...cardPassThrough(props, widget),
        },
        actions === undefined ? {} : { actions }
      );
    }

    return (): VNode => {
      const { labels } = settings.value;
      const {
        layout,
        pages,
        paged,
        activePage,
        activeKey,
        pageDefs,
        view,
        visible,
        hidden,
        minimized,
        shown,
        twelve,
        definitions,
      } = model.value;
      const pending: 'reset' | 'revert' | undefined = editing.value
        ? confirming.value
        : undefined;
      const editorMode: 'rename' | 'delete' | undefined =
        pageEditor.value?.key === activeKey ? pageEditor.value.mode : undefined;
      const maxPages: number | undefined = props.maxPages;
      const children: VNodeChild[] = [];

      if (editable.value && toggleMode.value && (props.toolbar ?? true)) {
        children.push(
          h(
            'div',
            {
              role: 'group',
              'aria-label': labels.dashboardControls,
              class: slot('toolbar', 'dwt-toolbar'),
            },
            [
              h(
                'button',
                {
                  ref: toggleButton,
                  type: 'button',
                  'aria-pressed': editing.value,
                  class: slot('button', 'dwt-button', 'dwt-toolbar-toggle'),
                  onClick: () => setEditing(!editing.value),
                },
                editing.value ? labels.done : labels.customize
              ),
              editing.value
                ? [
                    h(
                      'button',
                      {
                        ref: resetButton,
                        type: 'button',
                        class: slot('button', 'dwt-button'),
                        onClick: () => {
                          confirming.value = 'reset';
                        },
                      },
                      labels.reset
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: slot('button', 'dwt-button'),
                        disabled:
                          snapshot.value === undefined ||
                          (props.layout ?? EMPTY_LAYOUT) === snapshot.value,
                        onClick: () => {
                          confirming.value = 'revert';
                        },
                      },
                      labels.revertChanges
                    ),
                  ]
                : null,
              pending === undefined
                ? null
                : h(InlineConfirm, {
                    message:
                      pending === 'reset'
                        ? labels.confirmReset
                        : labels.confirmRevert,
                    onAnswer: answerConfirmation,
                  }),
              h(
                'span',
                { class: 'dwt-visually-hidden', 'aria-live': 'polite' },
                announcement.value
              ),
            ]
          )
        );
      }

      if (paged) {
        children.push(
          h(PageTabs, {
            pages,
            activeKey,
            idPrefix: instanceId,
            panelId,
            announcement: pageAnnouncement.value,
            onSelect: selectPage,
          })
        );
      }

      if (controlsShown.value) {
        const iconButton = (
          label: string,
          onClick: () => void,
          content: VNode,
          disabled = false
        ): VNode =>
          h(
            'button',
            {
              type: 'button',
              class: slot('button', 'dwt-button', 'dwt-icon-button'),
              'aria-label': label,
              title: label,
              disabled,
              onClick,
            },
            [content]
          );
        children.push(
          h(
            'div',
            {
              role: 'group',
              'aria-label': labels.managePages,
              class: 'dwt-page-manage',
            },
            [
              h(
                'button',
                {
                  type: 'button',
                  class: slot('button', 'dwt-button'),
                  disabled: maxPages !== undefined && pages.length >= maxPages,
                  onClick: addPageAction,
                },
                labels.addPage
              ),
              paged && editorMode === 'rename'
                ? h(PageRenameForm, {
                    key: activeKey,
                    initial: activePage.title,
                    onSubmit: renamePageAction,
                    onCancel: cancelPageEditor,
                  })
                : null,
              paged && editorMode !== 'rename'
                ? [
                    iconButton(
                      labels.renamePage(activePage.title),
                      () => {
                        pageEditor.value = { mode: 'rename', key: activeKey };
                      },
                      h('span', { 'aria-hidden': 'true' }, '✎')
                    ),
                    iconButton(
                      labels.movePageLeft(activePage.title),
                      () => change(movePage(layout, activeKey, -1)),
                      h('span', { 'aria-hidden': 'true' }, '←'),
                      pages[0]?.key === activeKey
                    ),
                    iconButton(
                      labels.movePageRight(activePage.title),
                      () => change(movePage(layout, activeKey, 1)),
                      h('span', { 'aria-hidden': 'true' }, '→'),
                      pages.at(-1)?.key === activeKey
                    ),
                    iconButton(
                      labels.deletePage(activePage.title),
                      () => {
                        pageEditor.value = { mode: 'delete', key: activeKey };
                      },
                      h(
                        'svg',
                        {
                          viewBox: '0 0 16 16',
                          width: '14',
                          height: '14',
                          'aria-hidden': 'true',
                          focusable: 'false',
                        },
                        [
                          h('path', {
                            d: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5',
                            fill: 'none',
                            stroke: 'currentColor',
                            'stroke-width': '1.3',
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round',
                          }),
                        ]
                      )
                    ),
                  ]
                : null,
              paged && editorMode === 'delete'
                ? h(InlineConfirm, {
                    message: labels.confirmDeletePage(activePage.title),
                    onAnswer: (yes: boolean) => {
                      if (yes) deletePageAction();
                      else pageEditor.value = undefined;
                    },
                  })
                : null,
              pageError.value === undefined
                ? null
                : h(
                    'span',
                    { role: 'alert', class: 'dwt-page-error' },
                    pageError.value
                  ),
            ]
          )
        );
      }

      const panel: VNodeChild[] = [];
      if (controlsShown.value && hidden.length > 0) {
        panel.push(
          h('div', { class: slot('hiddenBar', 'dwt-hidden-bar') }, [
            h('span', { class: 'dwt-hidden-label' }, labels.hiddenWidgets),
            ...hidden.map((definition) =>
              h(
                'button',
                {
                  key: definition.key,
                  type: 'button',
                  class: slot('button', 'dwt-button', 'dwt-show-button'),
                  'aria-label': labels.show(definition.title),
                  onClick: () => showAction(definition.key),
                },
                [h('span', { 'aria-hidden': 'true' }, '+ '), definition.title]
              )
            ),
          ])
        );
      }
      if (minimized.length > 0) {
        panel.push(
          h(
            'div',
            {
              class: slot('hiddenBar', 'dwt-hidden-bar', 'dwt-minimized-bar'),
            },
            [
              h('span', { class: 'dwt-hidden-label' }, labels.minimizedWidgets),
              ...minimized.map((definition) =>
                h(
                  'button',
                  {
                    key: definition.key,
                    type: 'button',
                    class: slot('button', 'dwt-button', 'dwt-show-button'),
                    'aria-label': labels.expand(definition.title),
                    onClick: () =>
                      changePage(toggleMinimized(view, definition.key)),
                  },
                  [h('span', { 'aria-hidden': 'true' }, '▸ '), definition.title]
                )
              ),
            ]
          )
        );
      }
      if (visible.length === 0) {
        panel.push(
          h(
            'p',
            { class: slot('empty', 'dwt-empty', 'dwt-dashboard-empty') },
            paged && pageDefs.length === 0
              ? labels.emptyPage
              : definitions.length === 0
                ? labels.noWidgets
                : labels.allHidden
          )
        );
      } else if (shown.length > 0) {
        panel.push(
          h(
            'div',
            {
              ref: gridRef,
              class: slot('grid', 'dwt-grid', twelve && 'dwt-grid--twelve'),
            },
            shown.map((definition, index) => renderCard(definition, index))
          )
        );
      }
      children.push(
        paged
          ? h(
              'div',
              {
                role: 'tabpanel',
                id: panelId,
                'aria-labelledby': `${instanceId}-tab-${pages.findIndex((p) => p.key === activeKey)}`,
                class: 'dwt-page-panel',
              },
              panel
            )
          : panel
      );

      return h(
        'div',
        {
          class: slot(
            'dashboard',
            'dwt-dashboard',
            toggleMode.value && controlsShown.value && 'dwt-dashboard--editing',
            props.className
          ),
        },
        children
      );
    };
  },
  { name: 'DashboardInner', props: DASHBOARD_PROPS }
);

/**
 * A full dashboard: widgets ordered by the viewer's layout, with move,
 * hide/show and minimize controls when `onLayoutChange` is given, edit mode
 * (Customize, Done, Reset, Revert) with `editMode="toggle"`, and pages.
 * Settings (locale, link target, classNames, labels) apply to every widget
 * inside. The options dialog, clones, detail view, filters, drag and drop and
 * swipe are not in `/vue` yet.
 */
export const Dashboard = defineComponent(
  (props: DashboardProps) => {
    const parent = useWidgetSettings();
    return (): VNode => {
      const {
        locale,
        linkTarget,
        classNames,
        labels,
        formatters,
        onFormatterError,
        theme,
        ...rest
      } = props;
      const inherited = parent.value;
      const dashboard: VNode = h(
        WidgetSettingsProvider,
        {
          locale: locale ?? inherited.locale,
          linkTarget: linkTarget ?? inherited.linkTarget,
          classNames: { ...inherited.classNames, ...classNames },
          labels: { ...inherited.labels, ...labels },
          formatters: { ...inherited.formatters, ...formatters },
          onFormatterError: onFormatterError ?? inherited.onFormatterError,
        },
        { default: () => h(DashboardInner, rest) }
      );
      return theme === undefined
        ? dashboard
        : h(WidgetTheme, { theme }, { default: () => dashboard });
    };
  },
  { name: 'Dashboard', props: DASHBOARD_PROPS }
);
