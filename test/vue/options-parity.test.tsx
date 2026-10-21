import { describe, it } from 'node:test';

import type { ComponentProps } from 'react';

import { withClones } from '../../src/core/clones.js';
import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import type { DashboardLayout } from '../../src/core/layout.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { assertParity } from './helpers.js';

const revenue = defineWidget({
  key: 'revenue',
  title: 'Revenue',
  kind: 'TABLE',
  width: 4,
  minWidth: 3,
  maxWidth: 6,
  views: [
    {
      key: 'bars',
      label: 'Bars',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 1 },
    },
  ],
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
  width: 6,
  locked: { options: true, clone: true },
});
const plain = defineWidget({
  key: 'plain',
  title: 'Plain',
  kind: 'TEXT',
  width: 6,
});
const base: WidgetDefinition[] = [revenue, policy, plain];

const table = {
  kind: 'TABLE' as const,
  columns: [{ label: 'Item' }, { label: 'Total', numeric: true }],
  rows: [[{ text: 'Jig' }, { text: '4' }]],
};

function widgetsFor(
  definitions: readonly WidgetDefinition[]
): DashboardWidget[] {
  return definitions.map(
    (definition) =>
      ({
        definition,
        status: 'ok',
        data:
          definition.kind === 'TABLE'
            ? table
            : { kind: 'TEXT', value: '1', label: definition.title },
      }) as DashboardWidget
  );
}

const noop = (): void => undefined;

void describe('WidgetOptionsDialog: Vue draws what React draws', () => {
  function dialog(name: string, extra: Record<string, unknown>): void {
    void it(name, async () => {
      const props = {
        definition: revenue,
        settings: undefined,
        onApply: noop,
        onClose: noop,
        ...extra,
      };
      await assertParity(
        name,
        <reactApi.WidgetOptionsDialog
          {...(props as ComponentProps<typeof reactApi.WidgetOptionsDialog>)}
        />,
        { component: vueApi.WidgetOptionsDialog, props }
      );
    });
  }

  dialog('every option type, nothing saved', {});
  dialog('saved title, width, options and view', {
    settings: {
      title: 'Sales',
      width: 5,
      flexible: true,
      view: 'bars',
      options: {
        period: 'week',
        limit: 9,
        refunds: true,
        q: 'ann',
        range: 'last7',
        tint: '#ff0000',
        sort: 'c0:asc',
        columns: ['c1', 'c0', 'c2'],
      },
    },
  });
  dialog('a custom date range', {
    settings: { options: { range: '2026-01-01..2026-02-01' } },
  });
  dialog('Revert to before editing is offered', {
    settings: { title: 'Sales' },
    baseline: { settings: undefined },
  });
  dialog('a title already used', {
    settings: { title: 'Plain' },
    isTitleInUse: () => true,
  });
  dialog('a widget with nothing to configure', { definition: plain });
  dialog('a clone offers Delete', {
    definition: withClones(base, {
      clones: [{ key: 'revenue#1', from: 'revenue' }],
    })[3],
    sourceTitle: 'Revenue',
    onDelete: noop,
  });
});

void describe('Options, Duplicate and clones in the Dashboard', () => {
  function dashboard(
    name: string,
    layout: DashboardLayout,
    extra: Record<string, unknown> = {}
  ): void {
    void it(name, async () => {
      const widgets = widgetsFor(withClones(base, layout));
      const props = {
        widgets,
        layout,
        onLayoutChange: noop,
        editMode: 'toggle',
        defaultEditing: true,
        ...extra,
      };
      await assertParity(
        name,
        <reactApi.Dashboard
          {...(props as ComponentProps<typeof reactApi.Dashboard>)}
        />,
        { component: vueApi.Dashboard, props },
        { menusOpen: true }
      );
    });
  }
  const empty: DashboardLayout = { order: [], hidden: [], minimized: [] };

  dashboard('Options and Duplicate in the Arrange menu', empty);
  dashboard('a clone and the viewer’s settings', {
    ...empty,
    clones: [{ key: 'revenue#1', from: 'revenue' }],
    settings: {
      revenue: { title: 'Sales', width: 6 },
      'revenue#1': { title: 'Sales (bars)', view: 'bars' },
      policy: { title: 'Hijacked' },
    },
  });
  dashboard('Duplicate unavailable when the page is full', {
    ...empty,
    pages: [
      {
        key: 'p1',
        title: 'Home',
        order: ['revenue', 'plain', 'policy'],
        hidden: [],
        minimized: [],
        maxRows: 1,
      },
      { key: 'p2', title: 'More', order: [], hidden: [], minimized: [] },
    ],
  });
  dashboard('overrideLocks shows Options on a locked widget', empty, {
    overrideLocks: true,
  });
});
