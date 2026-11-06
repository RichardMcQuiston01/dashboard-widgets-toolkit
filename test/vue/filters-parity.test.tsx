import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ComponentProps } from 'react';
import { nextTick } from 'vue';

import { defineWidget } from '../../src/core/definition.js';
import type { DashboardFilter } from '../../src/core/filters.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { assertParity } from './helpers.js';

const filters: readonly DashboardFilter[] = [
  { key: 'period', label: 'Period', type: 'dateRange', default: 'last30' },
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

const widgets: DashboardWidget[] = [
  {
    definition: defineWidget({ key: 'a', title: 'Alpha', kind: 'TEXT' }),
    status: 'ok',
    data: { kind: 'TEXT', value: 'hello', label: 'Greeting' },
  },
];

const noop = (): void => undefined;

void describe('FilterBar: Vue draws what React draws', () => {
  function bar(name: string, values: Record<string, unknown>): void {
    void it(name, async () => {
      const props = { filters, values, onChange: noop };
      await assertParity(
        name,
        <reactApi.FilterBar
          {...(props as ComponentProps<typeof reactApi.FilterBar>)}
        />,
        { component: vueApi.FilterBar, props }
      );
    });
  }
  bar('every filter on its default', {});
  bar('chosen values: Reset is enabled', {
    period: 'last7',
    store: 'north',
    search: 'jig',
    paid: true,
  });
  bar('an invalid value shows the default', { store: 'nowhere', paid: 'yes' });

  void it('draws nothing without filters', async () => {
    const props = { filters: [], values: {}, onChange: noop };
    await assertParity(
      'no filters',
      <reactApi.FilterBar
        {...(props as ComponentProps<typeof reactApi.FilterBar>)}
      />,
      { component: vueApi.FilterBar, props }
    );
  });
});

void describe('Dashboard filters', () => {
  function dashboard(name: string, extra: Record<string, unknown>): void {
    void it(name, async () => {
      const props = { widgets, ...extra };
      await assertParity(
        name,
        <reactApi.Dashboard
          {...(props as ComponentProps<typeof reactApi.Dashboard>)}
        />,
        { component: vueApi.Dashboard, props }
      );
    });
  }
  dashboard('filter bar above the cards', {
    filters,
    filterValues: { store: 'north' },
    onFilterChange: noop,
  });
  dashboard('no filter bar without onFilterChange', { filters });
  dashboard('no filter bar for an empty filter list', {
    filters: [],
    onFilterChange: noop,
  });
});

void describe('useDashboardFilters', () => {
  void it('keeps the choices and resolves them', async () => {
    const state = vueApi.useDashboardFilters(filters, { store: 'north' });
    assert.deepEqual(state.values.value, { store: 'north' });
    assert.equal(state.resolved.value['store'], 'north');
    assert.equal(state.resolved.value['paid'], false);

    state.setFilter('paid', true);
    await nextTick();
    assert.equal(state.resolved.value['paid'], true);
    assert.equal(state.resolved.value['store'], 'north');

    state.reset();
    await nextTick();
    assert.deepEqual(state.values.value, {});
    assert.equal(state.resolved.value['store'], 'all');

    state.setValues({ store: 'north' });
    assert.deepEqual(state.values.value, { store: 'north' });
  });
});
