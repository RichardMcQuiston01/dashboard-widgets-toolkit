import type { ReactNode } from 'react';

import type { WidgetThemeStyles } from '../core/theme.js';

export interface WidgetThemeProps {
  /** From `createTheme` (check its result before passing it). */
  readonly theme: WidgetThemeStyles;
  /** A Content-Security-Policy nonce for the `<style>` element. */
  readonly nonce?: string;
  /** Class name of the wrapper element (not used with a custom `scope`). */
  readonly className?: string;
  readonly children?: ReactNode;
}

/** The scope `createTheme` picks when none is given. */
function defaultScope(name: string): string {
  return `[data-dwt-theme='${name}']`;
}

/**
 * Applies a theme to the dashboards inside it: renders the theme's `<style>`
 * and, when the theme uses the default scope, a `<div data-dwt-theme="name">`
 * around the children, so nothing else has to set the attribute. With a custom
 * `scope` (a class or an id of your own) only the `<style>` is rendered and the
 * matching ancestor is yours to provide. The output is the same on the server
 * and in the browser (no effects), and a page can hold several themes.
 */
export function WidgetTheme({
  theme,
  nonce,
  className,
  children,
}: WidgetThemeProps): ReactNode {
  // The CSS was validated by `createTheme` (no `<`, `;` or `@` in a value), so it
  // is safe as raw text; React would escape the quotes in the selector.
  const style: ReactNode = (
    <style
      data-dwt-theme-style={theme.name}
      {...(nonce === undefined ? {} : { nonce })}
      dangerouslySetInnerHTML={{ __html: theme.css }}
    />
  );
  if (theme.scope !== defaultScope(theme.name)) {
    return (
      <>
        {style}
        {children}
      </>
    );
  }
  return (
    <>
      {style}
      <div
        data-dwt-theme={theme.name}
        {...(className === undefined ? {} : { className })}
      >
        {children}
      </div>
    </>
  );
}
