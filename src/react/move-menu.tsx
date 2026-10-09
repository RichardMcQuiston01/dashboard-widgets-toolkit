import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useSlotClassName } from './settings.js';

export interface MoveMenuOption {
  readonly value: string;
  readonly label: string;
}

export interface MoveToPageMenuProps {
  /** Accessible name of the icon button, for example "Move Revenue to another page". */
  readonly label: string;
  /** The small heading of the popover. */
  readonly heading: string;
  readonly options: readonly MoveMenuOption[];
  readonly onPick: (value: string) => void;
  /** Render with the popover open (used for tests and previews). */
  readonly initialOpen?: boolean;
}

/**
 * An icon button that opens a small floating menu of the pages a widget can
 * move to. Choosing one closes the menu and calls `onPick`; Escape, a click
 * outside, or focus leaving closes it without picking. Arrow keys move
 * between the choices.
 */
export function MoveToPageMenu({
  label,
  heading,
  options,
  onPick,
  initialOpen = false,
}: MoveToPageMenuProps): ReactNode {
  const slot = useSlotClassName();
  const menuId: string = useId();
  const [open, setOpen] = useState<boolean>(initialOpen);
  const wrapper = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Focus the first choice when the menu opens, and close on an outside click.
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
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
    const items: HTMLElement[] = [
      ...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ];
    const current: number = items.indexOf(
      document.activeElement as HTMLElement
    );
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (event.key === 'ArrowUp') {
      next = (current - 1 + items.length) % items.length;
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  return (
    <span
      ref={wrapper}
      className="dwt-move-menu"
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
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2 8h8M7 5l3 3-3 3M13 3v10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="dwt-move-popover"
          role="menu"
          aria-label={heading}
          onKeyDown={onKeyDown}
        >
          <p className="dwt-move-heading" aria-hidden="true">
            {heading}
          </p>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              className="dwt-move-option"
              onClick={() => {
                close(false);
                onPick(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
