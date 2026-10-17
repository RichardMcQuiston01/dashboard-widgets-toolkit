import { useEffect, useState, type ReactNode } from 'react';

import { formatAge, msUntilAgeChanges } from '../core/freshness.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface FreshnessLineProps {
  /** When the data was produced, epoch ms (`OkWidget.updatedAt`). */
  readonly updatedAt: number;
  /** `OkWidget.refreshError`: the last refresh failed and this data is old. */
  readonly refreshError?: string;
}

/**
 * "Updated 2 minutes ago", kept current by one timer that fires only when the
 * words change, and a badge when the latest refresh failed and the card is
 * showing its last good data. Used in the card footer when `freshness` is on.
 */
export function FreshnessLine({
  updatedAt,
  refreshError,
}: FreshnessLineProps): ReactNode {
  const slot = useSlotClassName();
  const { labels, locale } = useWidgetSettings();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const current: number = Date.now();
    setNow(current);
    const timer = setTimeout(
      () => setNow(Date.now()),
      msUntilAgeChanges(updatedAt, current)
    );
    return () => clearTimeout(timer);
  }, [updatedAt, now]);

  const age: string = formatAge(updatedAt, now, {
    ...(locale === undefined ? {} : { locale }),
    justNow: labels.justNow,
  });
  const exact: string = new Date(updatedAt).toLocaleString(locale);
  return (
    <p className={slot('freshness', 'dwt-freshness')}>
      <time
        dateTime={new Date(updatedAt).toISOString()}
        title={exact}
        suppressHydrationWarning
      >
        {refreshError === undefined
          ? labels.updatedAgo(age)
          : labels.refreshFailed(age)}
      </time>
      {refreshError !== undefined && (
        <span
          role="status"
          className="dwt-freshness-error"
          title={refreshError}
        >
          <span aria-hidden="true">!</span>
          <span className="dwt-visually-hidden">
            {labels.refreshFailedHint}
          </span>
        </span>
      )}
    </p>
  );
}

/** The refresh icon button in a card's header. */
export function RefreshButton({
  title,
  busy,
  onRefresh,
}: {
  readonly title: string;
  readonly busy: boolean;
  readonly onRefresh: () => void;
}): ReactNode {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const label: string = busy
    ? labels.refreshing(title)
    : labels.refreshWidget(title);
  return (
    <button
      type="button"
      className={slot(
        'button',
        'dwt-button',
        'dwt-icon-button',
        'dwt-refresh',
        busy && 'dwt-refresh--busy'
      )}
      aria-label={label}
      title={label}
      aria-disabled={busy ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      onClick={() => {
        if (!busy) onRefresh();
      }}
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
