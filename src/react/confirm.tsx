import { useEffect, useRef, type ReactNode } from 'react';

import { useSlotClassName, useWidgetSettings } from './settings.js';

/**
 * An inline "are you sure?" with a ✓ and a ✕ button, each with an accessible
 * name. The safe answer (✕) has focus, and Escape answers no.
 */
export function InlineConfirm({
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
