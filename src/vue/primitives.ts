import { defineComponent, h, type VNode, type VNodeChild } from 'vue';

import { isSafeHref, isSafeImageUrl } from '../core/url.js';
import { useWidgetSettings } from './settings.js';

/** Whether a link `target` opens a new browsing context (not `_self`). */
function isNewTabTarget(target: string | undefined): boolean {
  return target !== undefined && target !== '' && target !== '_self';
}

/** The icon and hidden text that tell a link opens in a new tab. */
export const NewTabIndicator = defineComponent(
  () => {
    const settings = useWidgetSettings();
    return (): VNode[] => [
      h(
        'svg',
        {
          class: 'dwt-external-icon',
          viewBox: '0 0 12 12',
          width: '1em',
          height: '1em',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        [
          h('path', {
            d: 'M7 1h4v4M11 1 5.5 6.5M9 7.5V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2.5',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '1.4',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        ]
      ),
      h('span', { class: 'dwt-visually-hidden' }, [
        ` ${settings.value.labels.opensInNewTab}`,
      ]),
    ];
  },
  { name: 'NewTabIndicator' }
);

/**
 * An anchor with rel="noreferrer", or plain text when there is no href or
 * it isn't a safe scheme (http, https, mailto, relative). Never fetches.
 */
export const WidgetLink = defineComponent(
  (
    props: {
      readonly href: string | undefined;
      readonly className?: string | undefined;
    },
    { slots }
  ) => {
    const settings = useWidgetSettings();
    return (): VNode => {
      const { href, className } = props;
      const classes = className === undefined ? {} : { class: className };
      if (href === undefined || !isSafeHref(href)) {
        return h('span', classes, slots['default']?.());
      }
      const linkTarget: string | undefined = settings.value.linkTarget;
      const children: VNodeChild[] = [slots['default']?.()];
      if (isNewTabTarget(linkTarget)) children.push(h(NewTabIndicator));
      return h(
        'a',
        {
          href,
          ...(linkTarget === undefined ? {} : { target: linkTarget }),
          rel: 'noreferrer',
          ...classes,
        },
        children
      );
    };
  },
  { name: 'WidgetLink', props: ['href', 'className'] }
);

/** A decorative square thumbnail; nothing for an unsafe or missing URL. */
export const Thumbnail = defineComponent(
  (props: { readonly url: string | undefined }) => (): VNode => {
    const url: string | undefined = props.url;
    if (url === undefined || !isSafeImageUrl(url)) {
      return h('span', {
        class: 'dwt-thumbnail dwt-thumbnail--placeholder',
        'aria-hidden': 'true',
      });
    }
    return h('img', {
      class: 'dwt-thumbnail',
      src: url,
      alt: '',
      width: 36,
      height: 36,
      loading: 'lazy',
      decoding: 'async',
    });
  },
  { name: 'Thumbnail', props: ['url'] }
);
