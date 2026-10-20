import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type VNode,
} from 'vue';

import { formatAge, msUntilAgeChanges } from '../core/freshness.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface FreshnessLineProps {
  /** When the data was produced, epoch ms (`OkWidget.updatedAt`). */
  readonly updatedAt: number;
  /** `OkWidget.refreshError`: the last refresh failed and this data is old. */
  readonly refreshError?: string | undefined;
}

/**
 * "Updated 2 minutes ago", kept current by one timer that fires only when the
 * words change, and a badge when the latest refresh failed and the card is
 * showing its last good data. Used in the card footer when `freshness` is on.
 */
export const FreshnessLine = defineComponent(
  (props: FreshnessLineProps) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const now = ref<number>(Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      const current: number = Date.now();
      now.value = current;
      timer = setTimeout(
        () => schedule(),
        msUntilAgeChanges(props.updatedAt, current)
      );
    };
    onMounted(schedule);
    watch(() => props.updatedAt, schedule);
    onBeforeUnmount(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    return (): VNode => {
      const { labels, locale } = settings.value;
      const { updatedAt, refreshError } = props;
      const age: string = formatAge(updatedAt, now.value, {
        ...(locale === undefined ? {} : { locale }),
        justNow: labels.justNow,
      });
      const exact: string = new Date(updatedAt).toLocaleString(locale);
      return h('p', { class: slot('freshness', 'dwt-freshness') }, [
        h(
          'time',
          { datetime: new Date(updatedAt).toISOString(), title: exact },
          refreshError === undefined
            ? labels.updatedAgo(age)
            : labels.refreshFailed(age)
        ),
        refreshError === undefined
          ? null
          : h(
              'span',
              {
                role: 'status',
                class: 'dwt-freshness-error',
                title: refreshError,
              },
              [
                h('span', { 'aria-hidden': 'true' }, '!'),
                h(
                  'span',
                  { class: 'dwt-visually-hidden' },
                  labels.refreshFailedHint
                ),
              ]
            ),
      ]);
    };
  },
  { name: 'FreshnessLine', props: ['updatedAt', 'refreshError'] }
);

/** The refresh icon button in a card's header. */
export const RefreshButton = defineComponent(
  (props: {
    readonly title: string;
    readonly busy: boolean;
    readonly onRefresh: () => void;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    return (): VNode => {
      const { labels } = settings.value;
      const { title, busy } = props;
      const label: string = busy
        ? labels.refreshing(title)
        : labels.refreshWidget(title);
      return h(
        'button',
        {
          type: 'button',
          class: slot(
            'button',
            'dwt-button',
            'dwt-icon-button',
            'dwt-refresh',
            busy && 'dwt-refresh--busy'
          ),
          'aria-label': label,
          title: label,
          'aria-disabled': busy ? 'true' : undefined,
          'data-busy': busy ? 'true' : undefined,
          onClick: () => {
            if (!busy) props.onRefresh();
          },
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
                d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3',
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '1.4',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              }),
            ]
          ),
        ]
      );
    };
  },
  { name: 'RefreshButton', props: ['title', 'busy', 'onRefresh'] }
);
