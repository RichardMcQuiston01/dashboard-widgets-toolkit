import {
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  watch,
  type InjectionKey,
  type Ref,
  type VNode,
} from 'vue';

import { useSlotClassName } from './settings.js';

/**
 * Whether menus start open. Only tests and previews change it: server
 * rendering can't click, so providing `true` shows every menu's items.
 */
export const EDIT_MENU_INITIAL_OPEN: InjectionKey<boolean> = Symbol(
  'dwt-edit-menu-initial-open'
);

export type EditMenuItem =
  | {
      readonly kind: 'action';
      readonly key: string;
      /** Short text shown in the menu: "Move earlier". */
      readonly label: string;
      /** Full accessible name when the short text isn't enough: "Move Revenue earlier". */
      readonly ariaLabel?: string;
      readonly disabled?: boolean;
      readonly onSelect: () => void;
    }
  /** A small heading over the items that follow, such as "Move to page". */
  | { readonly kind: 'heading'; readonly key: string; readonly label: string };

export interface WidgetEditMenuProps {
  /** Accessible name of the icon button, for example "Arrange Revenue". */
  readonly label: string;
  readonly items: readonly EditMenuItem[];
  /** Render with the menu open (used for tests and previews). */
  readonly initialOpen?: boolean | undefined;
}

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';

/**
 * One icon button on a card that opens a small floating menu of everything
 * the viewer can do to that widget while editing: move it earlier or later,
 * move it to another page, hide it. Choosing an item closes the menu and runs
 * it; Escape, a click outside, or focus leaving closes it without choosing.
 * Arrow keys, Home and End move between the enabled items.
 */
export const WidgetEditMenu = defineComponent(
  (props: WidgetEditMenuProps) => {
    const slot = useSlotClassName();
    const startOpen: boolean = inject(EDIT_MENU_INITIAL_OPEN, false);
    const menuId: string = useId();
    const open: Ref<boolean> = ref(props.initialOpen ?? startOpen);
    const wrapper: Ref<HTMLElement | null> = ref(null);
    const button: Ref<HTMLButtonElement | null> = ref(null);
    const menu: Ref<HTMLElement | null> = ref(null);

    const onPointerDown = (event: PointerEvent): void => {
      if (!wrapper.value?.contains(event.target as Node)) open.value = false;
    };
    // Focus the first choice when the menu opens, and close on an outside click.
    watch(
      open,
      async (isOpen) => {
        if (typeof document === 'undefined') return;
        document.removeEventListener('pointerdown', onPointerDown);
        if (!isOpen) return;
        await nextTick();
        menu.value?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
        document.addEventListener('pointerdown', onPointerDown);
      },
      { flush: 'post' }
    );
    onBeforeUnmount(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerdown', onPointerDown);
      }
    });

    function close(returnFocus: boolean): void {
      open.value = false;
      if (returnFocus) button.value?.focus();
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
        return;
      }
      const enabled: HTMLElement[] = [
        ...(menu.value?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []),
      ];
      if (enabled.length === 0) return;
      const current: number = enabled.indexOf(
        document.activeElement as HTMLElement
      );
      let next: number | undefined;
      if (event.key === 'ArrowDown') next = (current + 1) % enabled.length;
      else if (event.key === 'ArrowUp') {
        next = (current - 1 + enabled.length) % enabled.length;
      } else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = enabled.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        enabled[next]?.focus();
      }
    }

    return (): VNode =>
      h(
        'span',
        {
          ref: wrapper,
          class: 'dwt-edit-menu',
          onFocusout: (event: FocusEvent) => {
            const target = event.currentTarget as HTMLElement;
            if (!target.contains(event.relatedTarget as Node | null)) {
              open.value = false;
            }
          },
        },
        [
          h(
            'button',
            {
              ref: button,
              type: 'button',
              class: slot('button', 'dwt-button', 'dwt-icon-button'),
              'aria-label': props.label,
              title: props.label,
              'aria-haspopup': 'menu',
              'aria-expanded': open.value,
              'aria-controls': open.value ? menuId : undefined,
              onClick: () => {
                open.value = !open.value;
              },
            },
            [
              h(
                'svg',
                {
                  viewBox: '0 0 24 24',
                  width: '16',
                  height: '16',
                  'aria-hidden': 'true',
                  focusable: 'false',
                },
                [
                  h('path', {
                    d: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': '2',
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                  }),
                ]
              ),
            ]
          ),
          open.value
            ? h(
                'div',
                {
                  ref: menu,
                  id: menuId,
                  class: 'dwt-edit-popover',
                  role: 'menu',
                  'aria-label': props.label,
                  onKeydown: onKeyDown,
                },
                props.items.map((item) =>
                  item.kind === 'heading'
                    ? h(
                        'p',
                        {
                          key: item.key,
                          class: 'dwt-edit-heading',
                          role: 'presentation',
                        },
                        item.label
                      )
                    : h(
                        'button',
                        {
                          key: item.key,
                          type: 'button',
                          role: 'menuitem',
                          class: 'dwt-edit-option',
                          ...(item.ariaLabel === undefined
                            ? {}
                            : { 'aria-label': item.ariaLabel }),
                          disabled: item.disabled === true,
                          onClick: () => {
                            close(false);
                            item.onSelect();
                          },
                        },
                        item.label
                      )
                )
              )
            : null,
        ]
      );
  },
  { name: 'WidgetEditMenu', props: ['label', 'items', 'initialOpen'] }
);
