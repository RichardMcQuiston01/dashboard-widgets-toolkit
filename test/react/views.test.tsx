import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup as renderStatic } from 'react-dom/server';

import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { EMPTY_LAYOUT, type DashboardLayout } from '../../src/core/layout.js';
import type { TableWidgetData } from '../../src/core/payload.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  Dashboard,
  WidgetOptionsDialog,
  WidgetSettingsProvider,
} from '../../src/react/index.js';

const table: TableWidgetData = {
  kind: 'TABLE',
  columns: [{ label: 'Product' }, { label: 'Sold', numeric: true }],
  rows: [
    [{ text: 'Mug' }, { text: '1,200', value: 1200 }],
    [{ text: 'Tote' }, { text: '800', value: 800 }],
  ],
};

const products = defineWidget({
  key: 'products',
  title: 'Products',
  kind: 'TABLE',
  views: [
    {
      key: 'bars',
      label: 'Bars',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 1 },
    },
  ],
});
const plain = defineWidget({ key: 'plain', title: 'Plain', kind: 'TABLE' });

function widgetFor(definition: WidgetDefinition): DashboardWidget {
  return { definition, status: 'ok', data: table };
}

function show(
  definition: WidgetDefinition,
  layout: DashboardLayout = EMPTY_LAYOUT
): string {
  return renderStatic(
    <WidgetSettingsProvider locale="en-US">
      <Dashboard widgets={[widgetFor(definition)]} layout={layout} />
    </WidgetSettingsProvider>
  );
}

void describe('views in the Dashboard', () => {
  void it('shows the base view by default', () => {
    const markup = show(products);
    assert.match(markup, /<table/);
    assert.doesNotMatch(markup, /dwt-bars/);
  });

  void it('shows the viewer’s view, converted, with the same title', () => {
    const markup = show(products, {
      ...EMPTY_LAYOUT,
      settings: { products: { view: 'bars' } },
    });
    assert.doesNotMatch(markup, /<table/);
    assert.match(markup, />Products</);
    assert.match(markup, /Mug/);
    assert.match(markup, /1,200/);
  });

  void it('starts on defaultView', () => {
    const markup = show({ ...products, defaultView: 'bars' });
    assert.doesNotMatch(markup, /<table/);
  });

  void it('ignores a view the definition did not declare', () => {
    const markup = show(products, {
      ...EMPTY_LAYOUT,
      settings: { products: { view: 'missing' } },
    });
    assert.match(markup, /<table/);
  });

  void it('shows the conversion error on the card', () => {
    const markup = renderStatic(
      <WidgetSettingsProvider locale="en-US">
        <Dashboard
          widgets={[
            {
              definition: products,
              status: 'ok',
              data: {
                ...table,
                rows: [[{ text: 'Mug' }, { text: '1,200' }]],
              },
            },
          ]}
          layout={{ ...EMPTY_LAYOUT, settings: { products: { view: 'bars' } } }}
        />
      </WidgetSettingsProvider>
    );
    assert.match(markup, /no numeric value/);
  });
});

void describe('View field in the Options dialog', () => {
  const noop = (): void => undefined;
  const dialog = (definition: WidgetDefinition): string =>
    renderStatic(
      <WidgetSettingsProvider locale="en-US">
        <WidgetOptionsDialog
          definition={definition}
          settings={undefined}
          onApply={noop}
          onClose={noop}
        />
      </WidgetSettingsProvider>
    );

  void it('lists the base view and the declared ones', () => {
    const markup = dialog(products);
    assert.match(markup, /<label[^>]*>View<\/label>/);
    assert.match(
      markup,
      /<option value="base" selected="">Table \(default\)<\/option>/
    );
    assert.match(markup, /<option value="bars">Bars<\/option>/);
  });

  void it('marks defaultView as the default', () => {
    const markup = dialog({ ...products, defaultView: 'bars' });
    assert.match(
      markup,
      /<option value="bars" selected="">Bars \(default\)<\/option>/
    );
  });

  void it('is absent for a widget with no views', () => {
    assert.doesNotMatch(dialog(plain), />View</);
  });
});
