import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useSlotClassName } from './settings.js';

/**
 * Whether menus start open. Only tests and previews change it: server
 * rendering can't click, so a provider with `true` shows every menu's items.
 */
export const EditMenuInitialOpenContext = createContext<boolean>(false);

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
  readonly initialOpen?: boolean;
}

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';

/**
 * One icon button on a card that opens a small floating menu of everything
 * the viewer can do to that widget while editing: move it earlier or later,
 * move it to another page, hide it. Choosing an item closes the menu and runs
 * it; Escape, a click outside, or focus leaving closes it without choosing.
 * Arrow keys, Home and End move between the enabled items.
 */
export function WidgetEditMenu({
  label,
  items,
  initialOpen,
}: WidgetEditMenuProps): ReactNode {
  const slot = useSlotClassName();
  const startOpen: boolean = useContext(EditMenuInitialOpenContext);
  const menuId: string = useId();
  const [open, setOpen] = useState<boolean>(initialOpen ?? startOpen);
  const wrapper = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Focus the first choice when the menu opens, and close on an outside click.
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
      return;
    }
    const enabled: HTMLElement[] = [
      ...(menu.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []),
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

  return (
    <span
      ref={wrapper}
      className="dwt-edit-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className={slot('button', 'dwt-button', 'dwt-icon-button')}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="dwt-edit-popover"
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
        >
          {items.map((item) =>
            item.kind === 'heading' ? (
              <p
                key={item.key}
                className="dwt-edit-heading"
                role="presentation"
              >
                {item.label}
              </p>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="dwt-edit-option"
                {...(item.ariaLabel === undefined
                  ? {}
                  : { 'aria-label': item.ariaLabel })}
                disabled={item.disabled === true}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </span>
  );
}
