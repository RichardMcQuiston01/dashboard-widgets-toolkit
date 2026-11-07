import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { EMPTY_LAYOUT, defineWidget } from '../../src/core/index.js';
import {
  Dashboard,
  WidgetCard,
  type DashboardProps,
} from '../../src/vue/index.js';

async function render(root: Component): Promise<string> {
  return renderToString(createSSRApp(root));
}

const onLayoutChange = (): void => undefined;

const definitions = [
  defineWidget({ key: 'a', title: 'Alpha', kind: 'TEXT' }),
  defineWidget({ key: 'b', title: 'Beta', kind: 'TEXT' }),
];
const widgets: DashboardProps['widgets'] = definitions.map((definition) => ({
  definition,
  status: 'ok' as const,
  data: { kind: 'TEXT' as const, value: '1', label: 'x' },
}));

/* A bare attribute (`<Dashboard draggable />`) reaches a component as the
   empty string. Vue turns it into `true` only for a prop declared with
   `type: Boolean`. */
describe('boolean props written as bare attributes', () => {
  it('Dashboard: a bare draggable shows the drag handles', async () => {
    const bare: string = await render({
      render: () =>
        h(Dashboard, {
          widgets,
          layout: EMPTY_LAYOUT,
          onLayoutChange,
          draggable: '' as unknown as boolean,
        }),
    });
    const explicit: string = await render({
      render: () =>
        h(Dashboard, {
          widgets,
          layout: EMPTY_LAYOUT,
          onLayoutChange,
          draggable: true,
        }),
    });
    const absent: string = await render({
      render: () =>
        h(Dashboard, { widgets, layout: EMPTY_LAYOUT, onLayoutChange }),
    });
    assert.match(bare, /dwt-drag-handle/);
    assert.equal(bare, explicit);
    assert.doesNotMatch(absent, /dwt-drag-handle/);
  });

  it('Dashboard: a bare freshness shows the age line', async () => {
    const withData: DashboardProps['widgets'] = widgets.map((widget) => ({
      ...widget,
      ...({ updatedAt: new Date().toISOString() } as object),
    }));
    const bare: string = await render({
      render: () =>
        h(Dashboard, {
          widgets: withData,
          layout: EMPTY_LAYOUT,
          onLayoutChange,
          freshness: '' as unknown as boolean,
        }),
    });
    const explicit: string = await render({
      render: () =>
        h(Dashboard, {
          widgets: withData,
          layout: EMPTY_LAYOUT,
          onLayoutChange,
          freshness: true,
        }),
    });
    assert.equal(bare, explicit);
  });

  it('Dashboard: toolbar stays on when the prop is absent', async () => {
    const absent: string = await render({
      render: () =>
        h(Dashboard, {
          widgets,
          layout: EMPTY_LAYOUT,
          onLayoutChange,
          editMode: 'toggle',
        }),
    });
    const off: string = await render({
      render: () =>
        h(Dashboard, {
          widgets,
          layout: EMPTY_LAYOUT,
          onLayoutChange,
          toolbar: false,
        }),
    });
    assert.notEqual(absent, off);
  });

  it('WidgetCard: a bare minimized collapses the card', async () => {
    const bare: string = await render({
      render: () =>
        h(
          WidgetCard,
          { title: 'Alpha', minimized: '' as unknown as boolean },
          { default: () => 'body' }
        ),
    });
    assert.match(bare, /dwt-card--minimized/);
  });
});
