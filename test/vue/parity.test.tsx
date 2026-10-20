import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import type { GraphWidgetData, WidgetData } from '../../src/core/payload.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { normalizeMarkup } from './markup.js';

const settings = { locale: 'en-US' } as const;

async function vueHtml(
  component: Component,
  props: Record<string, unknown>,
  provided: Record<string, unknown> = settings,
  slots: Record<string, () => unknown> = {}
): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(vueApi.WidgetSettingsProvider, provided, {
        default: () => h(component, props, slots),
      }),
  });
  return renderToString(app);
}

function reactHtml(
  element: ReactElement,
  provided: Record<string, unknown> = settings
): string {
  return renderToStaticMarkup(
    <reactApi.WidgetSettingsProvider {...provided}>
      {element}
    </reactApi.WidgetSettingsProvider>
  );
}

/** Both renderers draw the same widget the same way. */
async function assertParity(
  name: string,
  react: ReactElement,
  vue: {
    component: Component;
    props: Record<string, unknown>;
    slots?: Record<string, () => unknown>;
  },
  provided: Record<string, unknown> = settings
): Promise<void> {
  const fromReact: string = normalizeMarkup(reactHtml(react, provided));
  const fromVue: string = normalizeMarkup(
    await vueHtml(vue.component, vue.props, provided, vue.slots)
  );
  assert.equal(fromVue, fromReact, `${name}: Vue markup differs from React`);
}

function parityOfContent(name: string, data: WidgetData): void {
  void it(`WidgetContent ${name}`, async () => {
    await assertParity(name, <reactApi.WidgetContent data={data} />, {
      component: vueApi.WidgetContent,
      props: { data },
    });
  });
}

const monthly: GraphWidgetData = {
  kind: 'GRAPH',
  chartType: 'bar',
  valueFormat: 'currency',
  xLabel: 'Month',
  series: [
    {
      name: 'Revenue',
      points: [
        { label: 'Jan', value: 1200 },
        { label: 'Feb', value: 900 },
        { label: 'Mar', value: 1500 },
      ],
    },
    {
      name: 'Costs',
      points: [
        { label: 'Jan', value: 700 },
        { label: 'Feb', value: 800 },
        { label: 'Mar', value: 650 },
      ],
    },
  ],
};

void describe('Vue and React draw the same markup', () => {
  parityOfContent('TEXT', { kind: 'TEXT', value: '42', label: 'Open orders' });
  parityOfContent('KPI with a delta and a hint', {
    kind: 'KPI',
    value: 1200,
    previous: 1000,
    format: 'currency',
    label: 'Revenue',
    hint: 'Incl. shipping',
  });
  parityOfContent('KPI without a previous value', {
    kind: 'KPI',
    value: 0.12,
    format: 'percent',
    label: 'Conversion',
  });
  parityOfContent('GAUGE', {
    kind: 'GAUGE',
    value: 30,
    max: 120,
    label: 'Used',
  });
  parityOfContent('TABLE with links, numbers and a footer', {
    kind: 'TABLE',
    columns: [{ label: 'Item' }, { label: 'Sold', numeric: true }],
    rows: [
      [{ text: 'Jig', href: 'https://example.com/jig' }, { text: '4' }],
      [{ text: 'Evil', href: 'javascript:alert(1)' }, { text: '1' }],
    ],
    footer: 'and 3 more',
  });
  parityOfContent('TABLE with field types', {
    kind: 'TABLE',
    columns: [
      { label: 'Email', type: 'email' },
      { label: 'Site', type: 'url' },
      { label: 'Logo', type: 'image' },
      { label: 'Color', type: 'color' },
    ],
    rows: [
      [
        { text: 'a@b.co' },
        { text: 'https://example.com' },
        { text: 'https://example.com/a.png' },
        { text: '#ff0000' },
      ],
    ],
  });
  parityOfContent('BAR_LIST with a total', {
    kind: 'BAR_LIST',
    items: [
      { label: 'US', value: 60 },
      { label: 'DE', value: 30, display: 'thirty' },
    ],
    total: 100,
  });
  parityOfContent('ALERT_LIST', {
    kind: 'ALERT_LIST',
    items: [
      {
        title: 'Pencil jig',
        href: 'https://www.etsy.com/listing/1',
        thumbnailUrl: 'https://i.etsystatic.com/1.jpg',
        valueLabel: '2 left',
        detail: 'Physical',
      },
      {
        title: 'No link',
        valueLabel: '1 left',
        thumbnailUrl: 'data:image/png;base64,AA',
      },
    ],
    total: 5,
    emptyText: 'Nothing low.',
  });
  parityOfContent('empty ALERT_LIST', {
    kind: 'ALERT_LIST',
    items: [],
    total: 0,
    emptyText: 'Nothing low.',
  });
  parityOfContent('GRAPH bar, two series', monthly);
  parityOfContent('GRAPH line, one series', {
    kind: 'GRAPH',
    chartType: 'line',
    valueFormat: 'number',
    series: [
      {
        name: 'Visits',
        points: [
          { label: 'Mon', value: 3 },
          { label: 'Tue', value: 9 },
          { label: 'Wed', value: 5 },
        ],
      },
    ],
  });

  void it('selectable rows, bars, alerts and chart positions', async () => {
    const onSelect = (): void => undefined;
    for (const data of [
      {
        kind: 'TABLE',
        columns: [{ label: 'A' }],
        rows: [[{ text: 'x' }], [{ text: 'y', href: '/y' }]],
      },
      { kind: 'BAR_LIST', items: [{ label: 'US', value: 3 }] },
      {
        kind: 'ALERT_LIST',
        items: [{ title: 'T', valueLabel: '1' }],
        total: 1,
        emptyText: '',
      },
      monthly,
    ] as WidgetData[]) {
      await assertParity(
        data.kind,
        <reactApi.WidgetContent data={data} onSelect={onSelect} />,
        { component: vueApi.WidgetContent, props: { data, onSelect } }
      );
    }
  });

  void it('a table with search and sortable headers', async () => {
    const data: WidgetData = {
      kind: 'TABLE',
      columns: [{ label: 'Item' }, { label: 'Sold', numeric: true }],
      rows: [
        [{ text: 'Jig' }, { text: '4' }],
        [{ text: 'Awl' }, { text: '9' }],
      ],
    };
    const tableControls = { search: true, sort: true };
    await assertParity(
      'controls',
      <reactApi.WidgetContent data={data} tableControls={tableControls} />,
      { component: vueApi.WidgetContent, props: { data, tableControls } }
    );
  });

  void it('links opening in a new tab', async () => {
    const data: WidgetData = {
      kind: 'TABLE',
      columns: [{ label: 'A' }],
      rows: [[{ text: 'x', href: '/a' }]],
    };
    await assertParity(
      'linkTarget',
      <reactApi.WidgetContent data={data} />,
      { component: vueApi.WidgetContent, props: { data } },
      { ...settings, linkTarget: '_blank' }
    );
  });

  void it('WidgetCard states', async () => {
    for (const status of ['loading', 'empty', 'error', 'ok'] as const) {
      await assertParity(
        status,
        <reactApi.WidgetCard
          title="Revenue"
          description="Last 90 days"
          status={status}
          emptyText="Nothing yet."
          error="It broke."
          onRetry={() => undefined}
          onToggleMinimized={() => undefined}
          onView={() => undefined}
          width={6}
          widgetKey="rev"
        >
          <p>body</p>
        </reactApi.WidgetCard>,
        {
          component: vueApi.WidgetCard,
          props: {
            title: 'Revenue',
            description: 'Last 90 days',
            status,
            emptyText: 'Nothing yet.',
            error: 'It broke.',
            onRetry: () => undefined,
            onToggleMinimized: () => undefined,
            onView: () => undefined,
            width: 6,
            widgetKey: 'rev',
          },
          slots: { default: () => h('p', 'body') },
        }
      );
    }
  });

  void it('a minimized card', async () => {
    await assertParity(
      'minimized',
      <reactApi.WidgetCard
        title="Revenue"
        description="Hidden while minimized"
        minimized
        onToggleMinimized={() => undefined}
      >
        <p>body</p>
      </reactApi.WidgetCard>,
      {
        component: vueApi.WidgetCard,
        props: {
          title: 'Revenue',
          description: 'Hidden while minimized',
          minimized: true,
          onToggleMinimized: () => undefined,
        },
        slots: { default: () => h('p', 'body') },
      }
    );
  });

  void it('a resolved card with refresh and exports', async () => {
    const widget: DashboardWidget = {
      status: 'ok',
      definition: { key: 'm', title: 'Monthly', kind: 'GRAPH' },
      data: monthly,
    };
    const onRefresh = (): void => undefined;
    await assertParity(
      'resolved',
      <reactApi.ResolvedWidgetCard
        widget={widget}
        exportFormats={['csv', 'svg', 'png']}
        onRefresh={onRefresh}
      />,
      {
        component: vueApi.ResolvedWidgetCard,
        props: { widget, exportFormats: ['csv', 'svg', 'png'], onRefresh },
      }
    );
  });

  void it('an alert list title carries its total', () => {
    const widget: DashboardWidget = {
      status: 'ok',
      definition: { key: 'a', title: 'Low stock', kind: 'ALERT_LIST' },
      data: {
        kind: 'ALERT_LIST',
        items: [{ title: 'x', valueLabel: '1' }],
        total: 3,
        emptyText: '',
      },
    };
    assert.equal(vueApi.widgetTitle(widget), reactApi.widgetTitle(widget));
    assert.equal(vueApi.widgetTitle(widget), 'Low stock (3)');
  });
});
