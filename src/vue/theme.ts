import { defineComponent, h, type VNodeChild } from 'vue';

import type { WidgetThemeStyles } from '../core/theme.js';

export interface WidgetThemeProps {
  /** From `createTheme` (check its result before passing it). */
  readonly theme: WidgetThemeStyles;
  /** A Content-Security-Policy nonce for the `<style>` element. */
  readonly nonce?: string | undefined;
  /** Class name of the wrapper element (not used with a custom `scope`). */
  readonly className?: string | undefined;
}

/** The scope `createTheme` picks when none is given. */
function defaultScope(name: string): string {
  return `[data-dwt-theme='${name}']`;
}

/**
 * Applies a theme to the dashboards inside it: renders the theme's `<style>`
 * and, when the theme uses the default scope, a `<div data-dwt-theme="name">`
 * around the slot, so nothing else has to set the attribute. With a custom
 * `scope` only the `<style>` is rendered and the matching ancestor is yours.
 */
export const WidgetTheme = defineComponent(
  (props: WidgetThemeProps, { slots }) =>
    (): VNodeChild[] => {
      const { theme, nonce, className } = props;
      // The CSS was validated by `createTheme` (no `<`, `;` or `@` in a
      // value), so it is safe as raw text.
      const style = h('style', {
        'data-dwt-theme-style': theme.name,
        ...(nonce === undefined ? {} : { nonce }),
        innerHTML: theme.css,
      });
      if (theme.scope !== defaultScope(theme.name)) {
        return [style, slots['default']?.()];
      }
      return [
        style,
        h(
          'div',
          {
            'data-dwt-theme': theme.name,
            ...(className === undefined ? {} : { class: className }),
          },
          slots['default']?.()
        ),
      ];
    },
  { name: 'WidgetTheme', props: ['theme', 'nonce', 'className'] }
);
