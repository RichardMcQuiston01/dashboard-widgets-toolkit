import type { ReactNode } from 'react';

import { isSafeHref, isSafeImageUrl } from '../core/url.js';
import { useWidgetSettings } from './settings.js';

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
  const { linkTarget } = useWidgetSettings();
  if (href === undefined || !isSafeHref(href)) {
    return <span className={className}>{children}</span>;
  }
  return (
    <a href={href} target={linkTarget} rel="noreferrer" className={className}>
      {children}
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
