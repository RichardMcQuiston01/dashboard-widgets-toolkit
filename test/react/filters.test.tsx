import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { defineWidget } from '../../src/core/definition.js';
import type { DashboardFilter } from '../../src/core/filters.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  Dashboard,
  FilterBar,
  WidgetSettingsProvider,
} from '../../src/react/index.js';

const filters: readonly DashboardFilter[] = [
  {
    key: 'period',
    label: 'Period',
    type: 'dateRange',
    default: 'last30',
  },
  {
    key: 'store',
    label: 'Store',
    type: 'choice',
    default: 'all',
    choices: [
      { value: 'all', label: 'All stores' },
      { value: 'north', label: 'North' },
    ],
  },
  { key: 'search', label: 'Search', type: 'text', maxLength: 40, default: '' },
  { key: 'paid', label: 'Paid only', type: 'boolean', default: false },
];

function html(element: React.ReactElement): string {
  return renderToStaticMarkup(
    <WidgetSettingsProvider locale="en-US">{element}</WidgetSettingsProvider>
  );
}

const widgets: DashboardWidget[] = [
  {
    definition: defineWidget({ key: 'a', title: 'Alpha', kind: 'TEXT' }),
    status: 'ok',
    data: { kind: 'TEXT', value: 'hello', label: 'Greeting' },
  },
];

void describe('FilterBar', () => {
  void it('renders a named group with a labelled control per filter', () => {
    const markup = html(
      <FilterBar filters={filters} values={{}} onChange={() => undefined} />
    );
    assert.match(markup, /<form[^>]*role="group"[^>]*aria-label="Filters"/);
    for (const label of ['Period', 'Store', 'Search', 'Paid only']) {
      assert.ok(markup.includes(label), label);
    }
    assert.match(markup, /<option[^>]*>All stores<\/option>/);
    assert.match(markup, /<option[^>]*>Last 30 days<\/option>/);
    assert.match(markup, /type="text"/);
    assert.match(markup, /type="checkbox"/);
  });

  void it('shows the chosen values and ignores invalid ones', () => {
    const markup = html(
      <FilterBar
        filters={filters}
        values={{ store: 'north', period: 'last7', search: 'tea', paid: true }}
        onChange={() => undefined}
      />
    );
    assert.match(markup, /<option value="north" selected/);
    assert.match(markup, /<option value="last7" selected/);
    assert.match(markup, /value="tea"/);
    assert.match(markup, /checked/);
    const invalid = html(
      <FilterBar
        filters={filters}
        values={{ store: 'nowhere' }}
        onChange={() => undefined}
      />
    );
    assert.match(invalid, /<option value="all" selected/);
  });

  void it('disables Reset while every filter is on its default', () => {
    const resetButton = (values: Record<string, unknown>): string => {
      const markup = html(
        <FilterBar
          filters={filters}
          values={values}
          onChange={() => undefined}
        />
      );
      const match =
        /<button[^>]*dwt-filters-reset[^>]*>Reset filters<\/button>/.exec(
          markup
        );
      assert.ok(match);
      return match[0];
    };
    assert.match(resetButton({}), /disabled/);
    assert.match(resetButton({ store: 'all', period: 'last30' }), /disabled/);
    assert.doesNotMatch(resetButton({ store: 'north' }), /disabled/);
  });

  void it('renders nothing for no filters, and uses overridden labels', () => {
    assert.equal(
      html(<FilterBar filters={[]} values={{}} onChange={() => undefined} />),
      ''
    );
    const custom = renderToStaticMarkup(
      <WidgetSettingsProvider
        locale="en-US"
        labels={{ filters: 'Filtres', filtersReset: 'Réinitialiser' }}
        classNames={{ filters: 'my-filters' }}
      >
        <FilterBar filters={filters} values={{}} onChange={() => undefined} />
      </WidgetSettingsProvider>
    );
    assert.match(custom, /aria-label="Filtres"/);
    assert.match(custom, /class="dwt-filters my-filters"/);
    assert.ok(custom.includes('Réinitialiser'));
  });
});

void describe('Dashboard filters', () => {
  void it('shows the filter bar above the cards when it can report changes', () => {
    const markup = html(
      <Dashboard
        widgets={widgets}
        filters={filters}
        filterValues={{ store: 'north' }}
        onFilterChange={() => undefined}
      />
    );
    const bar = markup.indexOf('dwt-filters');
    const card = markup.indexOf('data-widget-key="a"');
    assert.ok(bar >= 0 && card > bar);
    assert.match(markup, /<option value="north" selected/);
  });

  void it('shows no bar without onFilterChange or without filters', () => {
    assert.doesNotMatch(
      html(<Dashboard widgets={widgets} filters={filters} />),
      /dwt-filters/
    );
    assert.doesNotMatch(
      html(
        <Dashboard
          widgets={widgets}
          filters={[]}
          onFilterChange={() => undefined}
        />
      ),
      /dwt-filters/
    );
    assert.doesNotMatch(html(<Dashboard widgets={widgets} />), /dwt-filters/);
  });
});
