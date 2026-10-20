import { defineComponent, h, onMounted, ref, type Ref, type VNode } from 'vue';

import { useSlotClassName, useWidgetSettings } from './settings.js';

/**
 * An inline "are you sure?" with a ✓ and a ✕ button, each with an accessible
 * name. The safe answer (✕) has focus, and Escape answers no.
 */
export const InlineConfirm = defineComponent(
  (props: {
    readonly message: string;
    readonly onAnswer: (yes: boolean) => void;
  }) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const noButton: Ref<HTMLButtonElement | null> = ref(null);
    onMounted(() => noButton.value?.focus());
    return (): VNode => {
      const { labels } = settings.value;
      return h(
        'span',
        {
          role: 'group',
          'aria-label': props.message,
          class: 'dwt-confirm',
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              props.onAnswer(false);
            }
          },
        },
        [
          h(
            'span',
            { role: 'alert', class: 'dwt-confirm-message' },
            props.message
          ),
          h(
            'button',
            {
              type: 'button',
              class: slot('button', 'dwt-button', 'dwt-icon-button'),
              'aria-label': labels.confirmYes,
              title: labels.confirmYes,
              onClick: () => props.onAnswer(true),
            },
            [h('span', { 'aria-hidden': 'true' }, '✓')]
          ),
          h(
            'button',
            {
              ref: noButton,
              type: 'button',
              class: slot('button', 'dwt-button', 'dwt-icon-button'),
              'aria-label': labels.confirmNo,
              title: labels.confirmNo,
              onClick: () => props.onAnswer(false),
            },
            [h('span', { 'aria-hidden': 'true' }, '✕')]
          ),
        ]
      );
    };
  },
  { name: 'InlineConfirm', props: ['message', 'onAnswer'] }
);
