import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup as renderStatic } from 'react-dom/server';

import { withClones } from '../../src/core/clones.js';
import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { EMPTY_LAYOUT, type DashboardLayout } from '../../src/core/layout.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import { EditMenuInitialOpenContext } from '../../src/react/edit-menu.js';
import {
  Dashboard,
  WidgetOptionsDialog,
  WidgetSettingsProvider,
} from '../../src/react/index.js';

const orders = defineWidget({
  key: 'orders',
  title: 'Recent Orders',
  kind: 'TEXT',
  width: 12,
});
const policy = defineWidget({
  key: 'policy',
  title: 'Policy',
  kind: 'TEXT',
  width: 6,
  locked: { clone: true },
});
const base: WidgetDefinition[] = [orders, policy];

function widgetsFor(
  definitions: readonly WidgetDefinition[]
): DashboardWidget[] {
  return definitions.map(
    (definition) =>
      ({
        definition,
        status: 'ok',
        data: { kind: 'TEXT', value: '1', label: definition.title },
      }) as DashboardWidget
  );
}

function show(layout: DashboardLayout): string {
  return renderStatic(
    <EditMenuInitialOpenContext.Provider value>
      <WidgetSettingsProvider locale="en-US">
        <Dashboard
          widgets={widgetsFor(withClones(base, layout))}
          layout={layout}
          onLayoutChange={() => undefined}
          editMode="toggle"
          defaultEditing
        />
      </WidgetSettingsProvider>
    </EditMenuInitialOpenContext.Provider>
  );
}

void describe('clones in the Dashboard', () => {
  void it('offers Duplicate, except for widgets locked against cloning', () => {
    const markup = show(EMPTY_LAYOUT);
    assert.match(
      markup,
      /aria-label="Duplicate Recent Orders"[^>]*>Duplicate</
    );
    assert.doesNotMatch(markup, /aria-label="Duplicate Policy"/);
  });

  void it('shows a clone as its own card with a numbered title', () => {
    const markup = show({
      ...EMPTY_LAYOUT,
      clones: [{ key: 'orders#1', from: 'orders' }],
    });
    assert.match(markup, /data-widget-key="orders#1"/);
    assert.match(markup, />Recent Orders \(#1\)</);
  });

  void it('uses the clone’s own settings for its title', () => {
    const markup = show({
      ...EMPTY_LAYOUT,
      clones: [{ key: 'orders#1', from: 'orders' }],
      settings: { 'orders#1': { title: 'Orders again' } },
    });
    assert.match(markup, />Orders again</);
  });

  void it('disables Duplicate, saying why, when a paged layout has no room', () => {
    const markup = show({
      ...EMPTY_LAYOUT,
      pages: [
        {
          key: 'p1',
          title: 'Home',
          order: ['orders'],
          hidden: [],
          minimized: [],
          maxRows: 1,
        },
      ],
    });
    assert.match(
      markup,
      /<button[^>]*aria-label="Duplicate Recent Orders \(unavailable: Page &quot;Home&quot; has no room for a widget 12 wide[^"]*\)"[^>]*disabled=""/
    );
  });
});

void describe('clone controls in the Options dialog', () => {
  const noop = (): void => undefined;
  const clone = withClones(base, {
    clones: [{ key: 'orders#1', from: 'orders' }],
  })[1] as WidgetDefinition;
  const dialog = (extra: object): string =>
    renderStatic(
      <WidgetSettingsProvider locale="en-US">
        <WidgetOptionsDialog
          definition={clone}
          settings={undefined}
          onApply={noop}
          onClose={noop}
          {...extra}
        />
      </WidgetSettingsProvider>
    );

  void it('shows Delete this widget only when onDelete is given', () => {
    assert.match(dialog({ onDelete: noop }), />Delete this widget</);
    assert.doesNotMatch(dialog({}), /Delete this widget/);
  });
});
