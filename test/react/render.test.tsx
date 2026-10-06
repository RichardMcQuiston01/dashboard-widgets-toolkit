import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import type { WidgetDefinition } from '../../src/core/definition.js';
import type { GraphWidgetData, WidgetData } from '../../src/core/payload.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  Dashboard,
  GraphWidget,
  WidgetCard,
  WidgetContent,
  WidgetGrid,
  WidgetLink,
  WidgetSettingsProvider,
  useWidgets,
  barPath,
  buildChartModel,
  widgetTitle,
} from '../../src/react/index.js';

function html(element: React.ReactElement): string {
  return renderToStaticMarkup(
    <WidgetSettingsProvider locale="en-US">{element}</WidgetSettingsProvider>
  );
}

function content(data: WidgetData): string {
  return html(<WidgetContent data={data} />);
}

void describe('WidgetCard', () => {
  void it('renders the title, description, actions and body', () => {
    const markup = html(
      <WidgetCard
        title="Revenue"
        description="Last 90 days"
        actions={<button>x</button>}
      >
        <p>body</p>
      </WidgetCard>
    );
    assert.match(
      markup,
      /<section aria-labelledby="[^"]+-title" class="dwt-card dwt-card--ok">/
    );
    assert.match(
      markup,
      /<h2 id="[^"]+-title" class="dwt-card-title">Revenue<\/h2>/
    );
    assert.match(markup, /class="dwt-card-description">Last 90 days</);
    assert.match(markup, /<button>x<\/button>/);
    assert.match(markup, /<p>body<\/p>/);
  });

  void it('renders loading, empty and error states', () => {
    assert.match(
      html(<WidgetCard title="T" status="loading" />),
      /role="status" class="dwt-status">Loading…</
    );
    assert.match(
      html(<WidgetCard title="T" status="empty" emptyText="No orders yet." />),
      /class="dwt-empty">No orders yet\.</
    );
    const error = html(
      <WidgetCard
        title="T"
        status="error"
        error="It broke"
        onRetry={() => undefined}
      />
    );
    assert.match(error, /role="alert"/);
    assert.match(error, /It broke/);
    assert.match(error, />Retry<\/button>/);
  });

  void it('hides the body when minimized and labels the toggle', () => {
    const markup = html(
      <WidgetCard title="Sales" minimized onToggleMinimized={() => undefined}>
        <p>secret body</p>
      </WidgetCard>
    );
    assert.doesNotMatch(markup, /secret body/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /aria-label="Expand Sales"/);
    assert.match(markup, /dwt-card--minimized/);
  });

  void it('uses a 12-column grid when a widget sets width', () => {
    const wide: DashboardWidget = {
      status: 'ok',
      definition: { key: 'w', title: 'W', kind: 'TEXT', width: 8 },
      data: { kind: 'TEXT', label: 'L', value: 'hi' },
    };
    const plain: DashboardWidget = {
      status: 'ok',
      definition: { key: 'p', title: 'P', kind: 'TEXT' },
      data: { kind: 'TEXT', label: 'L', value: 'hi' },
    };
    const markup = html(<WidgetGrid widgets={[wide, plain]} />);
    assert.match(markup, /dwt-grid--twelve/);
    assert.match(markup, /--dwt-width:8/);
    assert.match(markup, /--dwt-width:4/);
    assert.doesNotMatch(html(<WidgetGrid widgets={[plain]} />), /twelve/);
  });

  void it('adds fill classes and an explicit column span', () => {
    const markup = renderToStaticMarkup(
      <WidgetCard title="T" fill="both" columnSpan={3} />
    );
    assert.match(markup, /dwt-card--fill-height/);
    assert.match(markup, /dwt-card--fill-width/);
    assert.match(markup, /style="grid-column:span 3"/);
    const heightOnly = renderToStaticMarkup(
      <WidgetCard title="T" fill="height" />
    );
    assert.match(heightOnly, /dwt-card--fill-height/);
    assert.doesNotMatch(heightOnly, /dwt-card--fill-width/);
    assert.doesNotMatch(heightOnly, /style=/);
  });

  void it('takes fill from the widget definition', () => {
    const widget: DashboardWidget = {
      definition: { key: 'k', title: 'K', kind: 'TEXT', fill: 'height' },
      status: 'loading',
    };
    const markup = html(<WidgetGrid widgets={[widget]} />);
    assert.match(markup, /dwt-card--fill-height/);
  });

  void it('appends classNames to the stable dwt-* classes', () => {
    const markup = renderToStaticMarkup(
      <WidgetSettingsProvider
        classNames={{ card: 'rounded-lg shadow', cardTitle: 'text-sm' }}
      >
        <WidgetCard title="T" size="large" className="mine" />
      </WidgetSettingsProvider>
    );
    assert.match(
      markup,
      /class="dwt-card dwt-card--ok dwt-card--size-large mine rounded-lg shadow"/
    );
    assert.match(markup, /class="dwt-card-title text-sm"/);
  });
});

void describe('renderers', () => {
  void it('TEXT', () => {
    assert.match(
      content({ kind: 'TEXT', value: '12', label: 'machines' }),
      /dwt-figure">12<.*machines/
    );
  });

  void it('KPI with a good and a bad change, never color alone', () => {
    const up = content({
      kind: 'KPI',
      value: 1200,
      previous: 1000,
      format: 'currency',
      label: 'Revenue',
      hint: 'Incl. shipping',
    });
    assert.match(up, /\$1,200\.00/);
    assert.match(up, /dwt-delta dwt-delta--good dwt-delta--up/);
    assert.match(up, /▲<\/span> (<!-- -->)?\+20%/);
    assert.match(up, /vs (<!-- -->)?previous period/);
    assert.match(up, /Incl\. shipping/);

    const refunds = content({
      kind: 'KPI',
      value: 0.12,
      previous: 0.1,
      format: 'percent',
      label: 'Refund rate',
      higherIsBetter: false,
    });
    assert.match(refunds, /12%/);
    assert.match(refunds, /dwt-delta--bad dwt-delta--up/);
  });

  void it('KPI without a previous value shows no delta', () => {
    assert.doesNotMatch(
      content({
        kind: 'KPI',
        value: 3,
        format: 'number',
        label: 'Orders',
        previous: null,
      }),
      /dwt-delta/
    );
  });

  void it('GAUGE is an accessible meter, clamped', () => {
    const markup = content({
      kind: 'GAUGE',
      value: 15,
      max: 10,
      label: 'Unread',
    });
    assert.match(
      markup,
      /role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="15" aria-label="Unread"/
    );
    assert.match(markup, /width:100%/);
  });

  void it('TABLE with numeric columns, safe links and a footer', () => {
    const markup = content({
      kind: 'TABLE',
      columns: [{ label: 'Item' }, { label: 'Sold', numeric: true }],
      rows: [
        [{ text: 'Jig', href: 'https://example.com/jig' }, { text: '4' }],
        [{ text: 'Evil', href: 'javascript:alert(1)' }, { text: '1' }],
      ],
      footer: 'and 3 more',
    });
    assert.match(markup, /<th scope="col" class="dwt-numeric">Sold<\/th>/);
    assert.match(
      markup,
      /<a href="https:\/\/example\.com\/jig" rel="noreferrer" class="dwt-link">Jig<\/a>/
    );
    assert.doesNotMatch(markup, /javascript:/);
    assert.match(markup, /<span class="dwt-link">Evil<\/span>/);
    assert.match(markup, /<td class="dwt-numeric">4<\/td>/);
    assert.match(markup, /and 3 more/);
  });

  void it('BAR_LIST as a share of the total, or of the largest value', () => {
    const shares = content({
      kind: 'BAR_LIST',
      items: [
        { label: '5 ★', value: 30 },
        { label: '4 ★', value: 10, display: 'ten' },
      ],
      total: 40,
    });
    assert.match(shares, /30 \(75%\)/);
    assert.match(shares, /width:75%/);
    assert.match(shares, />ten</);
    const relative = content({
      kind: 'BAR_LIST',
      items: [
        { label: 'a', value: 5 },
        { label: 'b', value: 10 },
      ],
    });
    assert.match(relative, /width:50%.*width:100%/);
  });

  void it('ALERT_LIST with thumbnails, links, values and "and N more"', () => {
    const markup = content({
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
    assert.match(
      markup,
      /<img class="dwt-thumbnail" src="https:\/\/i\.etsystatic\.com\/1\.jpg" alt="" width="36" height="36" loading="lazy"/
    );
    assert.match(
      markup,
      /<a href="https:\/\/www\.etsy\.com\/listing\/1" rel="noreferrer" class="dwt-alert-title">Pencil jig<\/a>/
    );
    assert.match(markup, /dwt-thumbnail--placeholder/);
    assert.doesNotMatch(markup, /data:image/);
    assert.match(markup, /2 left/);
    assert.match(markup, /and 3 more/);
  });

  void it('ALERT_LIST with no items shows its empty text', () => {
    assert.match(
      content({
        kind: 'ALERT_LIST',
        items: [],
        total: 0,
        emptyText: 'Nothing low.',
      }),
      /dwt-empty">Nothing low\.</
    );
  });

  void it('uses the link target from settings', () => {
    const markup = renderToStaticMarkup(
      <WidgetSettingsProvider linkTarget="_blank">
        <WidgetContent
          data={{
            kind: 'TABLE',
            columns: [{ label: 'A' }],
            rows: [[{ text: 'x', href: '/a' }]],
          }}
        />
      </WidgetSettingsProvider>
    );
    assert.match(markup, /<a href="\/a" target="_blank" rel="noreferrer"/);
  });
});

const monthly: GraphWidgetData = {
  kind: 'GRAPH',
  chartType: 'bar',
  valueFormat: 'currency',
  xLabel: 'Month',
  series: [
    {
      name: 'Revenue',
      points: [
        { label: 'Aug', value: 120 },
        { label: 'Sep', value: 340 },
        { label: 'Oct', value: 80 },
      ],
    },
  ],
};

void describe('GraphWidget', () => {
  void it('is an accessible SVG with title, desc and a table twin', () => {
    const markup = html(
      <GraphWidget data={monthly} title="Revenue by month" />
    );
    assert.match(
      markup,
      /<svg viewBox="0 0 640 220" class="dwt-chart-svg" role="img" aria-labelledby="(\S+)-title \1-desc" tabindex="0"/
    );
    assert.match(markup, /<title id="[^"]+-title">Revenue by month<\/title>/);
    assert.match(
      markup,
      /<desc id="[^"]+-desc">Bar chart, 3 point\(s\) from Aug to Oct\. Revenue: latest \$80\.00, high \$340\.00, low \$80\.00\.<\/desc>/
    );
    assert.match(markup, /<summary>View as table<\/summary>/);
    assert.match(
      markup,
      /<th scope="col">Month<\/th><th scope="col" class="dwt-numeric">Revenue<\/th>/
    );
    assert.match(
      markup,
      /<th scope="row">Sep<\/th><td class="dwt-numeric">\$340\.00<\/td>/
    );
  });

  void it('draws one thin bar per value in series color, with no legend for one series', () => {
    const markup = html(<GraphWidget data={monthly} />);
    assert.equal(markup.match(/class="dwt-bar"/g)?.length, 3);
    assert.match(markup, /fill="var\(--dwt-series-1, #2a78d6\)"/);
    assert.doesNotMatch(markup, /dwt-legend/);
    assert.match(markup, />\$400</); // compact axis top: niceDomain rounds 340 up to 400
  });

  void it('shows a legend and grouped bars for several series', () => {
    const markup = html(
      <GraphWidget
        data={{
          ...monthly,
          series: [
            ...monthly.series,
            {
              name: 'Refunds',
              points: [
                { label: 'Aug', value: 10 },
                { label: 'Sep', value: 0 },
              ],
            },
          ],
        }}
      />
    );
    assert.match(markup, /class="dwt-legend"/);
    assert.match(markup, /Revenue<\/li>.*Refunds<\/li>/);
    assert.match(markup, /fill="var\(--dwt-series-2, #eb6834\)"/);
    // Zero and missing values draw no bar; the table shows a dash for the missing one.
    assert.equal(markup.match(/class="dwt-bar"/g)?.length, 4);
    assert.match(markup, /<td class="dwt-numeric">—<\/td>/);
  });

  void it('draws a line chart with markers, a wash and an end label', () => {
    const markup = html(
      <GraphWidget
        data={{ ...monthly, chartType: 'line', valueFormat: 'number' }}
      />
    );
    assert.match(markup, /class="dwt-line" d="M/);
    assert.match(markup, /stroke-width="2"/);
    assert.match(markup, /fill-opacity="0.1"/);
    assert.equal(markup.match(/class="dwt-marker"/g)?.length, 3);
    assert.match(markup, /class="dwt-end-label"[^>]*>80</);
  });

  void it('builds a chart model by position and shapes bars with a rounded data end', () => {
    const model = buildChartModel({
      ...monthly,
      series: [
        { name: 'a', points: [{ label: 'x', value: 1 }] },
        {
          name: 'b',
          points: [
            { label: 'x', value: 2 },
            { label: 'y', value: -1 },
          ],
        },
      ],
    });
    assert.deepEqual(model.labels, ['x', 'y']);
    assert.deepEqual(model.values, [
      [1, null],
      [2, -1],
    ]);
    assert.equal(
      barPath(0, 0, 10, 20, 'top'),
      'M0.00,20.00V4.00Q0.00,0.00 4.00,0.00H6.00Q10.00,0.00 10.00,4.00V20.00Z'
    );
    assert.match(barPath(0, 0, 10, 2, 'bottom'), /^M0\.00,0\.00V0\.00Q/);
  });
});

const definitions: WidgetDefinition[] = [
  { key: 'revenue', title: 'Revenue', kind: 'KPI', sortOrder: 1 },
  {
    key: 'stock',
    title: 'Low stock',
    kind: 'ALERT_LIST',
    sortOrder: 2,
    defaultSize: 'large',
  },
  { key: 'broken', title: 'Broken', kind: 'TEXT', sortOrder: 3 },
  { key: 'pending', title: 'Pending', kind: 'TEXT', sortOrder: 4 },
];

const widgets: DashboardWidget[] = [
  {
    definition: definitions[0]!,
    status: 'ok',
    data: { kind: 'KPI', value: 5, format: 'number', label: 'Orders' },
  },
  {
    definition: definitions[1]!,
    status: 'ok',
    data: {
      kind: 'ALERT_LIST',
      items: [{ title: 'Jig', valueLabel: '1 left' }],
      total: 4,
      emptyText: 'None.',
    },
  },
  {
    definition: definitions[2]!,
    status: 'error',
    error: 'Widget "broken": provider failed: boom',
  },
  { definition: definitions[3]!, status: 'loading' },
];

void describe('WidgetGrid and Dashboard', () => {
  void it('widgetTitle adds the alert total', () => {
    assert.equal(widgetTitle(widgets[1]!), 'Low stock (4)');
    assert.equal(widgetTitle(widgets[0]!), 'Revenue');
  });

  void it('WidgetGrid renders every widget in order with its state', () => {
    const markup = html(
      <WidgetGrid widgets={widgets} onRetry={() => undefined} />
    );
    assert.match(markup, /^<div class="dwt-grid">/);
    assert.match(
      markup,
      /Revenue<\/h2>.*Low stock \(4\)<\/h2>.*Broken<\/h2>.*Pending<\/h2>/
    );
    assert.match(markup, /dwt-card--size-large/);
    assert.match(markup, /provider failed: boom/);
    assert.match(markup, />Retry</);
    assert.match(markup, /Loading…/);
  });

  void it('Dashboard orders by layout, lists hidden widgets and offers controls', () => {
    const markup = renderToStaticMarkup(
      <Dashboard
        widgets={widgets}
        layout={{
          order: ['broken', 'revenue'],
          hidden: ['pending'],
          minimized: ['revenue'],
        }}
        onLayoutChange={() => undefined}
        locale="en-US"
        labels={{ hiddenWidgets: 'Hidden widgets:' }}
      />
    );
    assert.match(
      markup,
      /class="dwt-hidden-bar"><span class="dwt-hidden-label">Hidden widgets:<\/span>/
    );
    assert.match(markup, /aria-label="Show Pending"/);
    assert.match(markup, /Broken<\/h2>.*Low stock \(4\)<\/h2>/);
    assert.doesNotMatch(markup, /Pending<\/h2>/);
    // Minimized widgets leave the grid for their own bar.
    assert.doesNotMatch(markup, /Revenue<\/h2>/);
    assert.match(
      markup,
      /dwt-minimized-bar"><span class="dwt-hidden-label">Minimized:<\/span>/
    );
    assert.match(markup, /aria-label="Move Broken earlier"[^>]*disabled=""/);
    assert.match(markup, /aria-label="Move Low stock later"[^>]*disabled=""/);
    assert.match(markup, /aria-label="Expand Revenue"/);
  });

  void it('marks links that open in a new tab with an icon and hidden text', () => {
    const newTab = renderToStaticMarkup(
      <WidgetSettingsProvider linkTarget="_blank">
        <WidgetLink href="https://example.com/a">Shop</WidgetLink>
      </WidgetSettingsProvider>
    );
    assert.match(newTab, /dwt-external-icon/);
    assert.match(newTab, /\(opens in a new tab\)/);
    const sameTab = renderToStaticMarkup(
      <WidgetLink href="https://example.com/a">Shop</WidgetLink>
    );
    assert.doesNotMatch(sameTab, /dwt-external-icon/);
  });

  void it('Dashboard without onLayoutChange is read-only', () => {
    const markup = renderToStaticMarkup(<Dashboard widgets={widgets} />);
    assert.doesNotMatch(markup, /<button[^>]*aria-label="(Hide|Move)/);
  });

  void it('Dashboard says so when everything is hidden or there is nothing', () => {
    const allHidden = renderToStaticMarkup(
      <Dashboard
        widgets={widgets}
        layout={{
          order: [],
          hidden: definitions.map((d) => d.key),
          minimized: [],
        }}
        onLayoutChange={() => undefined}
      />
    );
    assert.match(allHidden, /Every widget is hidden/);
    assert.match(
      renderToStaticMarkup(<Dashboard widgets={[]} />),
      /No widgets to show\./
    );
  });

  void it('never renders a script-capable link from any widget', () => {
    const markup = html(
      <WidgetGrid
        widgets={[
          {
            definition: { key: 'x', title: 'x', kind: 'ALERT_LIST' },
            status: 'ok',
            data: {
              kind: 'ALERT_LIST',
              items: [
                { title: 't', href: 'JaVaScRiPt:alert(1)', valueLabel: 'v' },
              ],
              total: 1,
              emptyText: '',
            },
          },
        ]}
      />
    );
    assert.doesNotMatch(markup, /href=/);
  });
});

void describe('useWidgets (server rendering)', () => {
  void it('renders loading placeholders and starts no provider', () => {
    let calls = 0;
    const definitions: WidgetDefinition[] = [
      { key: 'a', title: 'Alpha', kind: 'TEXT', sortOrder: 1 },
      { key: 'b', title: 'Beta', kind: 'TEXT', sortOrder: 2 },
      {
        key: 'c',
        title: 'Hidden',
        kind: 'TEXT',
        sortOrder: 3,
        roles: ['admin'],
      },
    ];
    const providers = {
      a: () => (calls++, { kind: 'TEXT' as const, value: '1', label: 'a' }),
      b: () => (calls++, { kind: 'TEXT' as const, value: '2', label: 'b' }),
    };
    const context = { roles: ['member'] };
    function Page(): React.ReactElement {
      const { widgets } = useWidgets(definitions, providers, context);
      return <WidgetGrid widgets={widgets} />;
    }
    const markup = html(<Page />);
    assert.equal(calls, 0);
    assert.match(markup, /dwt-card--loading/);
    assert.match(markup, /Alpha/);
    assert.match(markup, /Beta/);
    assert.doesNotMatch(markup, /Hidden/);
    assert.equal((markup.match(/data-widget-key=/g) ?? []).length, 2);
    assert.match(markup, /data-widget-key="a"/);
  });

  void it('leaves a bare WidgetCard without a data-widget-key', () => {
    assert.doesNotMatch(
      renderToStaticMarkup(<WidgetCard title="T" />),
      /data-widget-key/
    );
    assert.match(
      renderToStaticMarkup(<WidgetCard title="T" widgetKey="k" />),
      /data-widget-key="k"/
    );
  });
});
