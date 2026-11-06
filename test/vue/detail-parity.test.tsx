import { describe, it } from 'node:test';

import type { ComponentProps } from 'react';
import { h } from 'vue';

import type { DetailData, DetailQuery } from '../../src/core/detail.js';
import { defineWidget } from '../../src/core/definition.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { assertParity } from './helpers.js';

const noop = (): void => undefined;

const data: DetailData = {
  columns: [
    { key: 'name', label: 'Name', filterable: true },
    { key: 'sold', label: 'Sold', numeric: true },
    { key: 'note', label: 'Note', sortable: false },
  ],
  rows: [
    [{ text: 'Jig', href: '/jig' }, { text: '7', value: 7 }, { text: 'new' }],
    [{ text: 'Coaster' }, { text: '12', value: 12 }, { text: 'sale' }],
    [{ text: 'Tray' }, { text: '3', value: 3 }, { text: '' }],
  ],
};
const query: DetailQuery = {
  page: 1,
  pageSize: 1,
  sort: { column: 'sold', direction: 'desc' },
};

void describe('WidgetDetail: Vue draws what React draws', () => {
  function detail(name: string, extra: Record<string, unknown>): void {
    void it(name, async () => {
      const props = {
        title: 'Products',
        widgetKey: 'products',
        data,
        query,
        onQueryChange: noop,
        ...extra,
      };
      await assertParity(
        name,
        <reactApi.WidgetDetail
          {...(props as ComponentProps<typeof reactApi.WidgetDetail>)}
        />,
        { component: vueApi.WidgetDetail, props }
      );
    });
  }

  detail('a sorted, paged table', {});
  detail('a descending sort on the numeric column', {
    query: { ...query, sort: { column: 'sold', direction: 'asc' } },
  });
  detail('search and a column filter typed in', {
    query: { page: 1, pageSize: 5, search: 'o', filters: { name: 'c' } },
  });
  detail('no results', {
    query: { page: 1, pageSize: 5, search: 'zzz' },
  });
  detail('a query that names a missing column', {
    query: {
      page: 1,
      pageSize: 5,
      sort: { column: 'price', direction: 'asc' },
    },
  });
  detail('server mode, busy', {
    mode: 'server',
    busy: true,
    data: { ...data, totalRows: 312 },
    query: { page: 3, pageSize: 2, sort: query.sort },
  });
  detail('server mode without totalRows', { mode: 'server' });
  detail('loading', { status: 'loading', data: undefined });
  detail('error with retry', {
    status: 'error',
    error: 'boom',
    onRetry: noop,
    data: undefined,
  });
  detail('error without retry', {
    status: 'error',
    error: 'boom',
    data: undefined,
  });
  detail('rows per page and a Columns menu', {
    pageSizes: [1, 5, 25],
    columnVisibility: true,
  });
  detail('a page size that is not one of the choices', {
    pageSizes: [5, 25],
    query: { ...query, pageSize: 10 },
  });
  detail('hidden columns, the last one cannot be hidden', {
    columnVisibility: true,
    query: { ...query, hidden: ['note', 'name'] },
  });
  detail('a Download CSV button', { exportFormats: ['csv'] });
  detail('server mode: Download CSV needs onExportAll', {
    mode: 'server',
    data: { ...data, totalRows: 3 },
    exportFormats: ['csv'],
    onExportAll: noop,
  });
  detail('a heading level, id and class', {
    headingLevel: 3,
    headingId: 'products-title',
    className: 'mine',
  });
});

void describe('WidgetDetailDialog: Vue draws what React draws', () => {
  function dialog(name: string, open: boolean): void {
    void it(name, async () => {
      await assertParity(
        name,
        <reactApi.WidgetDetailDialog
          title="Products"
          open={open}
          onClose={noop}
        >
          <p>inside</p>
        </reactApi.WidgetDetailDialog>,
        {
          component: vueApi.WidgetDetailDialog,
          props: { title: 'Products', open, onClose: noop },
          slots: { default: () => h('p', 'inside') },
        }
      );
    });
  }
  dialog('open', true);
  dialog('closed', false);
});

void describe('Dashboard detail view', () => {
  const table = defineWidget({
    key: 'orders',
    title: 'Orders',
    kind: 'TABLE',
    detail: { pageSizes: [5, 25], columnVisibility: true },
  });
  const plain = defineWidget({ key: 'plain', title: 'Plain', kind: 'TEXT' });
  const widgets: DashboardWidget[] = [
    {
      definition: table,
      status: 'ok',
      data: {
        kind: 'TABLE',
        columns: [{ label: 'Item' }, { label: 'Total', numeric: true }],
        rows: [[{ text: 'Jig' }, { text: '4' }]],
      },
    },
    {
      definition: plain,
      status: 'ok',
      data: { kind: 'TEXT', value: '1', label: 'Plain' },
    },
  ];

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

  dashboard('a View button on a widget with a detail view', {});
  dashboard('the detail dialog open (controlled), still loading', {
    detail: { key: 'orders', query: { page: 1, pageSize: 5 } },
  });
  dashboard('a detail link for a widget without a detail view is ignored', {
    detail: { key: 'plain', query: { page: 1, pageSize: 5 } },
  });
  dashboard('onOpenDetail alone gives every detail widget a View button', {
    onOpenDetail: noop,
  });
});
