import assert from 'node:assert/strict';

import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import { EditMenuInitialOpenContext } from '../../src/react/edit-menu.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { normalizeMarkup } from './markup.js';

export const defaultSettings = { locale: 'en-US' } as const;

export interface VueSide {
  readonly component: Component;
  readonly props: Record<string, unknown>;
  readonly slots?: Record<string, () => unknown>;
}

export interface ParityOptions {
  /** Settings given to the provider around both renderers. */
  readonly provided?: Record<string, unknown>;
  /** Start every card's Arrange menu open, since server rendering can't click. */
  readonly menusOpen?: boolean;
}

export async function vueHtml(
  side: VueSide,
  options: ParityOptions = {}
): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(vueApi.WidgetSettingsProvider, options.provided ?? defaultSettings, {
        default: () => h(side.component, side.props, side.slots ?? {}),
      }),
  });
  if (options.menusOpen === true) {
    app.provide(vueApi.EDIT_MENU_INITIAL_OPEN, true);
  }
  return renderToString(app);
}

export function reactHtml(
  element: ReactElement,
  options: ParityOptions = {}
): string {
  return renderToStaticMarkup(
    <EditMenuInitialOpenContext.Provider value={options.menusOpen === true}>
      <reactApi.WidgetSettingsProvider
        {...(options.provided ?? defaultSettings)}
      >
        {element}
      </reactApi.WidgetSettingsProvider>
    </EditMenuInitialOpenContext.Provider>
  );
}

/** Both renderers draw the same widget the same way. */
export async function assertParity(
  name: string,
  react: ReactElement,
  vue: VueSide,
  options: ParityOptions = {}
): Promise<void> {
  const fromReact: string = normalizeMarkup(reactHtml(react, options));
  const fromVue: string = normalizeMarkup(await vueHtml(vue, options));
  assert.equal(fromVue, fromReact, `${name}: Vue markup differs from React`);
}
