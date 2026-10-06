import type { ReactNode } from 'react';

import { isSafeHref, isSafeImageUrl } from '../core/url.js';
import { useWidgetSettings } from './settings.js';

/** Whether a link `target` opens a new browsing context (not `_self`). */
function isNewTabTarget(target: string | undefined): boolean {
  return target !== undefined && target !== '' && target !== '_self';
}

/**
 * An anchor with rel="noreferrer", or plain text when there is no href or
 * it isn't a safe scheme (http, https, mailto, relative). Never fetches.
 */
export function WidgetLink({
  href,
  className,
  children,
}: {
  readonly href: string | undefined;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const { linkTarget, labels } = useWidgetSettings();
  if (href === undefined || !isSafeHref(href)) {
    return <span className={className}>{children}</span>;
  }
  const opensNewTab: boolean = isNewTabTarget(linkTarget);
  return (
    <a href={href} target={linkTarget} rel="noreferrer" className={className}>
      {children}
      {opensNewTab && (
        <>
          <svg
            className="dwt-external-icon"
            viewBox="0 0 12 12"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M7 1h4v4M11 1 5.5 6.5M9 7.5V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="dwt-visually-hidden"> {labels.opensInNewTab}</span>
        </>
      )}
    </a>
  );
}

/** A decorative square thumbnail; nothing for an unsafe or missing URL. */
export function Thumbnail({
  url,
}: {
  readonly url: string | undefined;
}): ReactNode {
  if (url === undefined || !isSafeImageUrl(url)) {
    return (
      <span
        className="dwt-thumbnail dwt-thumbnail--placeholder"
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      className="dwt-thumbnail"
      src={url}
      alt=""
      width={36}
      height={36}
      loading="lazy"
      decoding="async"
    />
  );
}
