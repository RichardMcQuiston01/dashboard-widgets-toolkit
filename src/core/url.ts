/**
 * Link and image URL checks. Payloads often come from an API, so a link is
 * only rendered when it can't run script: http(s), mailto, or a relative
 * path. Nothing here fetches anything.
 */

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

// Browsers ignore ASCII control characters and whitespace inside a scheme
// ("java\tscript:"), so strip them before reading it.
// eslint-disable-next-line no-control-regex
const IGNORED_IN_SCHEME = /[\u0000- \u007f]/g;

function schemeOf(url: string): string | null {
  const match: RegExpExecArray | null = SCHEME_PATTERN.exec(
    url.replace(IGNORED_IN_SCHEME, '')
  );
  return match === null ? null : (match[1] ?? '').toLowerCase();
}

/** Whether `url` is safe as an anchor href: http, https, mailto or relative. */
export function isSafeHref(url: string): boolean {
  if (url.trim() === '') {
    return false;
  }
  const scheme: string | null = schemeOf(url);
  return (
    scheme === null ||
    scheme === 'http' ||
    scheme === 'https' ||
    scheme === 'mailto'
  );
}

/** Whether `url` is safe as an image source: http, https or relative. */
export function isSafeImageUrl(url: string): boolean {
  if (url.trim() === '') {
    return false;
  }
  const scheme: string | null = schemeOf(url);
  return scheme === null || scheme === 'http' || scheme === 'https';
}
