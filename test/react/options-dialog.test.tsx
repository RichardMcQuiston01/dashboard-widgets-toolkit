import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup as renderStatic } from 'react-dom/server';

import { defineWidget } from '../../src/core/definition.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import { EMPTY_LAYOUT, type DashboardLayout } from '../../src/core/layout.js';
import { EditMenuInitialOpenContext } from '../../src/react/edit-menu.js';
import {
  Dashboard,
  WidgetOptionsDialog,
  WidgetSettingsProvider,
} from '../../src/react/index.js';

const revenue = defineWidget({
  key: 'revenue',
  title: 'Revenue',
  kind: 'TEXT',
  width: 4,
  minWidth: 3,
  maxWidth: 6,
  options: [
    {
      type: 'choice',
      key: 'period',
      label: 'Period',
      choices: [
        { value: 'week', label: 'Last week' },
        { value: 'month', label: 'Last month' },
      ],
      default: 'month',
    },
    {
      type: 'number',
      key: 'limit',
      label: 'Rows',
      min: 1,
      max: 20,
      default: 5,
    },
    {
      type: 'boolean',
      key: 'refunds',
      label: 'Include refunds',
      default: false,
    },
    {
      type: 'text',
      key: 'q',
      label: 'Customer contains',
      maxLength: 20,
      default: '',
    },
    { type: 'dateRange', key: 'range', label: 'Range', default: 'last30' },
    { type: 'color', key: 'tint', label: 'Tint', default: '#336699' },
    {
      type: 'sort',
      key: 'sort',
      label: 'Order by',
      columns: [
        { key: 'c0', label: 'Order' },
        { key: 'c1', label: 'Total' },
      ],
      default: 'c1:desc',
    },
    {
      type: 'columns',
      key: 'columns',
      label: 'Columns',
      columns: [
        { key: 'c0', label: 'Order' },
        { key: 'c1', label: 'Total' },
        { key: 'c2', label: 'Date' },
      ],
      default: ['c0', 'c1'],
    },
  ],
});
const policy = defineWidget({
  key: 'policy',
  title: 'Policy',
  kind: 'TEXT',
  locked: { options: true },
});

function widgetFor(
  definition: typeof revenue | typeof policy
): DashboardWidget {
  return {
    definition,
    status: 'ok',
    data: { kind: 'TEXT', text: definition.title },
  } as unknown as DashboardWidget;
}

function render(element: React.ReactElement): string {
  return renderStatic(
    <EditMenuInitialOpenContext.Provider value>
      <WidgetSettingsProvider locale="en-US">{element}</WidgetSettingsProvider>
    </EditMenuInitialOpenContext.Provider>
  );
}

function dashboard(layout: DashboardLayout = EMPTY_LAYOUT): string {
  return render(
    <Dashboard
      widgets={[widgetFor(revenue), widgetFor(policy)]}
      layout={layout}
      onLayoutChange={() => undefined}
      editMode="toggle"
      defaultEditing
    />
  );
}

void describe('Options in the Dashboard', () => {
  void it('offers Options in the card menu, except for widgets locked against it', () => {
    const markup = dashboard();
    assert.match(
      markup,
      /<button[^>]*role="menuitem"[^>]*aria-label="Options for Revenue"[^>]*>Options…<\/button>/
    );
    assert.doesNotMatch(markup, /aria-label="Options for Policy"/);
  });

  void it('shows the viewer’s title and applies their width', () => {
    const markup = dashboard({
      ...EMPTY_LAYOUT,
      settings: { revenue: { title: 'Sales', width: 6 } },
    });
    assert.match(markup, />Sales</);
    assert.doesNotMatch(markup, />Revenue</);
    assert.match(markup, /--dwt-width:6/);
  });

  void it('ignores settings saved for a widget locked against options', () => {
    const markup = dashboard({
      ...EMPTY_LAYOUT,
      settings: { policy: { title: 'Hijacked' } },
    });
    assert.doesNotMatch(markup, /Hijacked/);
  });
});

void describe('WidgetOptionsDialog', () => {
  const noop = (): void => undefined;

  void it('shows the title placeholder, width choices within the limits and Flexible', () => {
    const markup = render(
      <WidgetOptionsDialog
        definition={revenue}
        settings={undefined}
        onApply={noop}
        onClose={noop}
      />
    );
    assert.match(markup, /<h2[^>]*>Options for Revenue<\/h2>/);
    assert.match(markup, /placeholder="Revenue"/);
    assert.match(markup, /maxLength="80"/);
    assert.match(markup, />Default<\/option>/);
    assert.match(markup, />3 of 12 \(1\/4\)<\/option>/);
    assert.match(markup, />6 of 12 \(1\/2\)<\/option>/);
    assert.doesNotMatch(markup, /2 of 12/);
    assert.doesNotMatch(markup, /7 of 12/);
    assert.match(markup, /Grow to fill empty space in the row/);
  });

  void it('renders a field for every declared option type with the viewer’s values', () => {
    const markup = render(
      <WidgetOptionsDialog
        definition={revenue}
        settings={{
          options: {
            period: 'week',
            limit: 9,
            refunds: true,
            q: 'ann',
            tint: '#112233',
          },
        }}
        onApply={noop}
        onClose={noop}
      />
    );
    assert.match(
      markup,
      /<option value="week" selected="">Last week<\/option>/
    );
    assert.match(markup, /type="number"[^>]*value="9"/);
    assert.match(
      markup,
      /type="checkbox"[^>]*checked=""[^>]*\/>Include refunds/
    );
    assert.match(markup, /type="text"[^>]*value="ann"/);
    assert.match(markup, /type="color"[^>]*value="#112233"/);
    assert.match(
      markup,
      /<option value="last30" selected="">Last 30 days<\/option>/
    );
    assert.match(markup, /<option value="c1" selected="">Total<\/option>/);
    assert.match(
      markup,
      /<option value="desc" selected="">Descending<\/option>/
    );
    // Columns: shown ones first, with move buttons; the hidden one has none.
    assert.match(markup, /aria-label="Move Order down"/);
    assert.match(markup, /aria-label="Move Total up"/);
    assert.doesNotMatch(markup, /aria-label="Move Date (up|down)"/);
  });

  void it('disables Apply, Reset and Revert until there is something to do', () => {
    const markup = render(
      <WidgetOptionsDialog
        definition={revenue}
        settings={undefined}
        baseline={{ settings: undefined }}
        onApply={noop}
        onClose={noop}
      />
    );
    assert.match(markup, /<button[^>]*disabled=""[^>]*>Apply<\/button>/);
    assert.match(
      markup,
      /<button[^>]*disabled=""[^>]*>Reset to defaults<\/button>/
    );
    assert.match(
      markup,
      /<button[^>]*disabled=""[^>]*>Revert to before editing<\/button>/
    );
  });

  void it('enables Reset for saved settings and Revert when they differ from before editing', () => {
    const markup = render(
      <WidgetOptionsDialog
        definition={revenue}
        settings={{ title: 'Sales' }}
        baseline={{ settings: undefined }}
        onApply={noop}
        onClose={noop}
      />
    );
    assert.doesNotMatch(
      markup,
      /<button[^>]*disabled=""[^>]*>Reset to defaults<\/button>/
    );
    assert.doesNotMatch(
      markup,
      /<button[^>]*disabled=""[^>]*>Revert to before editing<\/button>/
    );
    assert.match(markup, /value="Sales"/);
  });

  void it('hides Revert without a baseline and the width choice for a fixed width', () => {
    const fixed = defineWidget({
      key: 'fixed',
      title: 'Fixed',
      kind: 'TEXT',
      width: 6,
      minWidth: 6,
      maxWidth: 6,
    });
    const markup = render(
      <WidgetOptionsDialog
        definition={fixed}
        settings={undefined}
        onApply={noop}
        onClose={noop}
      />
    );
    assert.doesNotMatch(markup, /Revert to before editing/);
    assert.doesNotMatch(markup, /<select/);
  });

  void it('uses overridable labels', () => {
    const markup = renderStatic(
      <WidgetSettingsProvider
        labels={{
          optionsFor: (title) => `Réglages de ${title}`,
          apply: 'Appliquer',
        }}
      >
        <WidgetOptionsDialog
          definition={revenue}
          settings={undefined}
          onApply={noop}
          onClose={noop}
        />
      </WidgetSettingsProvider>
    );
    assert.match(markup, /Réglages de Revenue/);
    assert.match(markup, />Appliquer</);
  });
});
