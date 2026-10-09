import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import type { WidgetDefinition } from '../../src/core/definition.js';
import {
  createLayoutPersistence,
  memoryAdapter,
} from '../../src/core/storage.js';
import type { GraphWidgetData, WidgetData } from '../../src/core/payload.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  Dashboard,
  GraphWidget,
  WidgetCard,
  WidgetDetail,
  WidgetContent,
  WidgetGrid,
  WidgetLink,
  WidgetSettingsProvider,
  useStoredLayout,
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

void describe('detail view', () => {
  const data = {
    columns: [
      { key: 'name', label: 'Name', filterable: true },
      { key: 'sold', label: 'Sold', numeric: true },
    ],
    rows: [
      [
        { text: 'Jig', href: '/jig' },
        { text: '7', value: 7 },
      ],
      [{ text: 'Coaster' }, { text: '12', value: 12 }],
    ],
  };
  const query = {
    page: 1,
    pageSize: 1,
    sort: { column: 'sold', direction: 'desc' },
  } as const;

  void it('renders a sortable table with aria-sort, a summary and paging', () => {
    const markup = html(
      <WidgetDetail
        title="Products"
        data={data}
        query={query}
        onQueryChange={() => undefined}
      />
    );
    assert.match(
      markup,
      /<caption class="dwt-visually-hidden">Products<\/caption>/
    );
    assert.match(markup, /aria-sort="descending"/);
    assert.match(markup, /Showing 1–1 of 2 results/);
    assert.match(markup, /Coaster/);
    assert.doesNotMatch(markup, /Jig/);
    assert.match(markup, /Page 1 of 2/);
    assert.match(markup, /aria-label="Filter Name"|Filter Name/);
    assert.match(markup, /aria-label="Sort by Sold"/);
  });

  void it('shows loading, error with retry, and no-results states', () => {
    const noop = (): void => undefined;
    const loading = html(
      <WidgetDetail
        title="P"
        status="loading"
        query={query}
        onQueryChange={noop}
      />
    );
    assert.match(loading, /Loading…/);
    const failed = html(
      <WidgetDetail
        title="P"
        status="error"
        error="boom"
        onRetry={noop}
        query={query}
        onQueryChange={noop}
      />
    );
    assert.match(failed, /role="alert"/);
    assert.match(failed, />Retry</);
    const none = html(
      <WidgetDetail
        title="P"
        data={data}
        query={{ page: 1, pageSize: 5, search: 'zzz' }}
        onQueryChange={noop}
      />
    );
    assert.match(none, /No matching results\./);
  });

  void it('reports a query that names a missing column', () => {
    const markup = html(
      <WidgetDetail
        title="P"
        data={data}
        query={{
          page: 1,
          pageSize: 5,
          sort: { column: 'price', direction: 'asc' },
        }}
        onQueryChange={() => undefined}
      />
    );
    assert.match(markup, /sort column &quot;price&quot; does not exist/);
  });

  void it('adds a View button and clickable title to a card with onView', () => {
    const markup = html(<WidgetCard title="Top" onView={() => undefined} />);
    assert.match(markup, /aria-label="View Top"/);
    assert.match(markup, /dwt-card-title-button/);
    assert.doesNotMatch(html(<WidgetCard title="Top" />), /View Top/);
  });

  void it('Dashboard offers View only for widgets with detail data', () => {
    const table: DashboardWidget = {
      status: 'ok',
      definition: { key: 't', title: 'Complete', kind: 'TABLE', detail: true },
      data: {
        kind: 'TABLE',
        columns: [{ label: 'A' }],
        rows: [[{ text: 'x' }]],
      },
    };
    const truncated: DashboardWidget = {
      status: 'ok',
      definition: { key: 'u', title: 'Truncated', kind: 'TABLE', detail: true },
      data: {
        kind: 'TABLE',
        columns: [{ label: 'A' }],
        rows: [[{ text: 'x' }]],
        footer: 'and 9 more',
      },
    };
    const plain: DashboardWidget = {
      status: 'ok',
      definition: { key: 'p', title: 'Plain', kind: 'TABLE' },
      data: { kind: 'TABLE', columns: [{ label: 'A' }], rows: [] },
    };
    const markup = html(<Dashboard widgets={[table, truncated, plain]} />);
    assert.match(markup, /aria-label="View Complete"/);
    assert.doesNotMatch(markup, /View Truncated/);
    assert.doesNotMatch(markup, /View Plain/);
    const withLoader = html(
      <Dashboard
        widgets={[truncated]}
        loadDetail={() => ({ columns: [], rows: [] })}
      />
    );
    assert.match(withLoader, /aria-label="View Truncated"/);
  });
});

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

  void it('Dashboard withholds the controls a lock covers', () => {
    const lockedWidgets: DashboardWidget[] = [
      {
        definition: { ...definitions[0]!, locked: true },
        status: 'ok',
        data: { kind: 'KPI', value: 5, format: 'number', label: 'Orders' },
      },
      {
        definition: { ...definitions[1]!, locked: { hide: true } },
        status: 'loading',
      },
      { definition: definitions[2]!, status: 'loading' },
    ];
    const markup = renderToStaticMarkup(
      <Dashboard widgets={lockedWidgets} onLayoutChange={() => undefined} />
    );
    // Fully locked: no move, hide or minimize controls.
    assert.doesNotMatch(markup, /aria-label="Move Revenue/);
    assert.doesNotMatch(markup, /aria-label="Hide Revenue"/);
    assert.doesNotMatch(markup, /aria-label="Minimize Revenue"/);
    // Hide-locked: can still move and minimize.
    assert.match(markup, /aria-label="Move Low stock later"/);
    assert.doesNotMatch(markup, /aria-label="Hide Low stock"/);
    assert.match(markup, /aria-label="Hide Broken"/);
  });

  void it('Dashboard enforces a lock on a saved layout', () => {
    const lockedWidgets: DashboardWidget[] = [
      {
        definition: { ...definitions[0]!, locked: true },
        status: 'loading',
      },
    ];
    const markup = renderToStaticMarkup(
      <Dashboard
        widgets={lockedWidgets}
        layout={{ order: [], hidden: ['revenue'], minimized: ['revenue'] }}
        onLayoutChange={() => undefined}
      />
    );
    assert.match(markup, /Revenue<\/h2>/);
    assert.doesNotMatch(markup, /dwt-minimized-bar/);
  });

  void it('overrideLocks restores the controls', () => {
    const lockedWidgets: DashboardWidget[] = [
      {
        definition: { ...definitions[0]!, locked: true },
        status: 'loading',
      },
      { definition: definitions[2]!, status: 'loading' },
    ];
    const markup = renderToStaticMarkup(
      <Dashboard
        widgets={lockedWidgets}
        onLayoutChange={() => undefined}
        overrideLocks
      />
    );
    assert.match(markup, /aria-label="Move Revenue later"/);
    assert.match(markup, /aria-label="Hide Revenue"/);
  });

  void describe('edit mode', () => {
    const lockedWidgets: DashboardWidget[] = [
      {
        definition: { ...definitions[0]!, locked: true },
        status: 'loading',
      },
      { definition: definitions[1]!, status: 'loading' },
      { definition: definitions[2]!, status: 'loading' },
    ];
    const render = (props: Record<string, unknown> = {}): string =>
      renderToStaticMarkup(
        <Dashboard
          widgets={lockedWidgets}
          layout={{ order: [], hidden: ['broken'], minimized: [] }}
          onLayoutChange={() => undefined}
          {...props}
        />
      );

    void it('always mode is unchanged: no toolbar, controls and lock icon show', () => {
      const markup = render();
      assert.doesNotMatch(markup, /dwt-toolbar/);
      assert.match(markup, /aria-label="Hide Low stock"/);
      assert.match(markup, /aria-label="Revenue is locked"/);
      assert.doesNotMatch(markup, /dwt-dashboard--editing/);
    });

    void it('toggle mode shows only Customize until editing', () => {
      const markup = render({ editMode: 'toggle' });
      assert.match(markup, /aria-pressed="false"[^>]*>Customize</);
      assert.doesNotMatch(markup, /aria-label="Move /);
      assert.doesNotMatch(markup, /aria-label="Hide /);
      assert.doesNotMatch(markup, /dwt-hidden-bar/);
      assert.doesNotMatch(markup, /is locked/);
      // Minimizing stays available outside edit mode.
      assert.match(markup, /aria-label="Minimize Low stock"/);
      assert.doesNotMatch(markup, /Reset layout/);
    });

    void it('toggle mode while editing shows controls, lock icons and the toolbar', () => {
      const markup = render({ editMode: 'toggle', defaultEditing: true });
      assert.match(markup, /aria-pressed="true"[^>]*>Done</);
      assert.match(markup, />Reset layout</);
      assert.match(markup, /disabled=""[^>]*>Revert changes</);
      assert.match(markup, /aria-label="Hide Low stock"/);
      assert.match(markup, /class="dwt-hidden-bar"/);
      assert.match(markup, /aria-label="Revenue is locked"/);
      // A fully locked card has no controls.
      assert.doesNotMatch(markup, /aria-label="Hide Revenue"/);
      assert.doesNotMatch(markup, /aria-label="Minimize Revenue"/);
      assert.match(markup, /dwt-dashboard--editing/);
      assert.match(markup, /dwt-card--editing/);
    });

    void it('controlled editing and toolbar={false}', () => {
      const markup = render({
        editMode: 'toggle',
        editing: true,
        toolbar: false,
      });
      assert.doesNotMatch(markup, /dwt-toolbar/);
      assert.match(markup, /aria-label="Hide Low stock"/);
    });

    void it('overrideLocks names the lock "locked for viewers" and restores controls', () => {
      const markup = render({
        editMode: 'toggle',
        defaultEditing: true,
        overrideLocks: true,
      });
      assert.match(markup, /aria-label="Revenue is locked for viewers"/);
      assert.match(markup, /aria-label="Hide Revenue"/);
    });

    void it('has no toolbar without onLayoutChange', () => {
      const markup = renderToStaticMarkup(
        <Dashboard widgets={lockedWidgets} editMode="toggle" />
      );
      assert.doesNotMatch(markup, /dwt-toolbar/);
    });

    void it('labels can be overridden', () => {
      const markup = renderToStaticMarkup(
        <Dashboard
          widgets={lockedWidgets}
          onLayoutChange={() => undefined}
          editMode="toggle"
          labels={{ customize: 'Edit' }}
        />
      );
      assert.match(markup, />Edit</);
    });
  });

  void describe('pages', () => {
    const pageDefs = [
      { key: 'a', title: 'Alpha', kind: 'TEXT', width: 6, sortOrder: 1 },
      { key: 'b', title: 'Bravo', kind: 'TEXT', width: 6, sortOrder: 2 },
      { key: 'c', title: 'Charlie', kind: 'TEXT', width: 12, sortOrder: 3 },
      {
        key: 'pin',
        title: 'Pinned',
        kind: 'TEXT',
        width: 6,
        sortOrder: 4,
        locked: { move: true },
      },
    ] as const;
    const pageWidgets: DashboardWidget[] = pageDefs.map((definition) => ({
      definition: definition as never,
      status: 'ok' as const,
      data: {
        kind: 'TEXT' as const,
        value: `text of ${definition.key}`,
        label: definition.title,
      },
    }));
    const twoPages = {
      order: [],
      hidden: [],
      minimized: [],
      pages: [
        {
          key: 'p1',
          title: 'Sales',
          order: ['a', 'b'],
          hidden: [],
          minimized: [],
        },
        {
          key: 'p2',
          title: 'Stock',
          order: ['c'],
          hidden: [],
          minimized: [],
        },
      ],
    };
    const render = (props: Record<string, unknown> = {}): string =>
      renderToStaticMarkup(
        <Dashboard widgets={pageWidgets} layout={twoPages} {...props} />
      );

    void it('shows no page bar without pages or with one page', () => {
      assert.doesNotMatch(
        renderToStaticMarkup(<Dashboard widgets={pageWidgets} />),
        /role="tablist"/
      );
      const one = render({
        layout: { ...twoPages, pages: [twoPages.pages[0]] },
      });
      assert.doesNotMatch(one, /role="tablist"/);
      assert.doesNotMatch(one, /Add page/);
    });

    void it('shows a tab list for two pages, the first selected', () => {
      const markup = render();
      assert.match(markup, /role="tablist" aria-label="Pages"/);
      assert.match(
        markup,
        /role="tab"[^>]*aria-selected="true"[^>]*aria-label="Page 1 of 2: Sales"[^>]*tabindex="0"/
      );
      assert.match(
        markup,
        /role="tab"[^>]*aria-selected="false"[^>]*aria-label="Page 2 of 2: Stock"[^>]*tabindex="-1"/
      );
      assert.match(markup, /role="tabpanel"[^>]*aria-labelledby="[^"]*-tab-0"/);
      assert.match(markup, /aria-controls="([^"]+)"/);
    });

    void it('renders only the page in view', () => {
      const first = render();
      assert.match(first, /Alpha<\/h2>/);
      assert.match(first, /Bravo<\/h2>/);
      assert.doesNotMatch(first, /Charlie<\/h2>/);
      const second = render({ defaultActivePage: 'p2' });
      assert.match(second, /Charlie<\/h2>/);
      assert.doesNotMatch(second, /Alpha<\/h2>/);
      assert.match(
        second,
        /aria-selected="true"[^>]*aria-label="Page 2 of 2: Stock"/
      );
      assert.match(render({ activePage: 'p2' }), /Charlie<\/h2>/);
    });

    void it('falls back to the first page for an unknown active page', () => {
      assert.match(render({ activePage: 'nope' }), /Alpha<\/h2>/);
    });

    void it('puts a widget locked against moving on its home page', () => {
      const markup = render({
        widgets: [
          ...pageWidgets.slice(0, 3),
          {
            ...(pageWidgets[3] as DashboardWidget),
            definition: { ...pageDefs[3], page: 'Stock' } as never,
          },
        ],
        defaultActivePage: 'p2',
      });
      assert.match(markup, /Pinned<\/h2>/);
    });

    void it('says so when a page has no widgets', () => {
      const markup = render({
        widgets: pageWidgets.slice(0, 2),
        defaultActivePage: 'p2',
      });
      assert.match(markup, /This page has no widgets/);
    });

    void it('keeps the page bar for read-only viewers but no management', () => {
      const markup = render();
      assert.match(markup, /role="tablist"/);
      assert.doesNotMatch(markup, /Add page/);
      assert.doesNotMatch(markup, /Move Alpha to another page/);
    });

    void it('lists hidden widgets of the page in view only', () => {
      const markup = render({
        onLayoutChange: () => undefined,
        layout: {
          ...twoPages,
          pages: [
            { ...twoPages.pages[0], hidden: ['b'], order: ['a'] },
            twoPages.pages[1],
          ],
        },
      });
      assert.match(markup, /aria-label="Show Bravo"/);
      assert.doesNotMatch(markup, /aria-label="Show Charlie"/);
    });

    void it('offers page management and a move-to-page select while editing', () => {
      const markup = render({ onLayoutChange: () => undefined });
      assert.match(markup, />Add page</);
      assert.match(markup, /aria-label="Rename Sales"/);
      assert.match(markup, /aria-label="Move Sales page left"[^>]*disabled=""/);
      assert.match(markup, /aria-label="Move Sales page right"/);
      assert.match(markup, /aria-label="Delete Sales"/);
      assert.match(markup, /aria-label="Move Alpha to another page"/);
      assert.match(
        markup,
        /<option value="p2">Stock \(3 rows free\)<\/option>/
      );
      assert.match(markup, /<option value="__new-page__">New page…<\/option>/);
    });

    void it('counts free rows from the page maxRows, and maxPages hides New page', () => {
      const markup = render({
        onLayoutChange: () => undefined,
        maxRows: 2,
        maxPages: 2,
      });
      assert.match(markup, /Stock \(1 row free\)/);
      assert.doesNotMatch(markup, /New page…/);
      assert.match(markup, /disabled=""[^>]*>Add page</);
    });

    void it('offers no move-to-page select on a pinned widget or with one page', () => {
      const markup = render({
        onLayoutChange: () => undefined,
        defaultActivePage: 'p1',
        widgets: [
          pageWidgets[0] as DashboardWidget,
          {
            ...(pageWidgets[3] as DashboardWidget),
            definition: { ...pageDefs[3], page: 'Sales' } as never,
          },
        ],
      });
      assert.match(markup, /Move Alpha to another page/);
      assert.doesNotMatch(markup, /Move Pinned to another page/);
      const single = renderToStaticMarkup(
        <Dashboard widgets={pageWidgets} onLayoutChange={() => undefined} />
      );
      assert.doesNotMatch(single, /to another page/);
      assert.match(single, />Add page</);
    });

    void it('shows page management only while editing in toggle mode', () => {
      const idle = render({
        onLayoutChange: () => undefined,
        editMode: 'toggle',
      });
      assert.doesNotMatch(idle, /Add page/);
      assert.match(idle, /role="tablist"/);
      const editing = render({
        onLayoutChange: () => undefined,
        editMode: 'toggle',
        defaultEditing: true,
      });
      assert.match(editing, />Add page</);
    });

    void it('overrides page labels', () => {
      const markup = render({
        labels: {
          pageBar: 'Seiten',
          pageTabName: (i: number, n: number, t: string) =>
            `Seite ${i} von ${n}: ${t}`,
        },
      });
      assert.match(markup, /aria-label="Seiten"/);
      assert.match(markup, /aria-label="Seite 1 von 2: Sales"/);
    });
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

void describe('table controls', () => {
  const table: WidgetData = {
    kind: 'TABLE',
    columns: [{ label: 'Name' }, { label: 'Sold', numeric: true }],
    rows: [
      [{ text: 'b' }, { text: '2' }],
      [{ text: 'a' }, { text: '10' }],
    ],
    footer: 'and 5 more',
  };

  void it('renders a plain table by default', () => {
    const markup = content(table);
    assert.doesNotMatch(markup, /type="search"/);
    assert.doesNotMatch(markup, /dwt-detail-sort/);
    assert.match(markup, /and 5 more/);
  });

  void it('adds a search box and sort buttons when asked', () => {
    const markup = html(
      <WidgetContent
        data={table}
        tableControls={{ search: true, sort: true }}
      />
    );
    assert.match(markup, /type="search"/);
    assert.match(markup, /aria-label="Sort by Name"/);
    assert.match(markup, /aria-label="Sort by Sold"/);
    assert.match(markup, /and 5 more/);
  });

  void it('can turn the two controls on separately', () => {
    const sortOnly = html(
      <WidgetContent
        data={table}
        tableControls={{ search: false, sort: true }}
      />
    );
    assert.doesNotMatch(sortOnly, /type="search"/);
    assert.match(sortOnly, /dwt-detail-sort/);
    const searchOnly = html(
      <WidgetContent
        data={table}
        tableControls={{ search: true, sort: false }}
      />
    );
    assert.match(searchOnly, /type="search"/);
    assert.doesNotMatch(searchOnly, /dwt-detail-sort/);
  });
});

void describe('declared options in the UI', () => {
  const definition: WidgetDefinition = {
    key: 'sales',
    title: 'Sales',
    kind: 'TABLE',
    tableControls: true,
    options: [
      {
        key: 'order',
        type: 'sort',
        label: 'Order',
        columns: [
          { key: 'c0', label: 'Name' },
          { key: 'c1', label: 'Sold' },
        ],
        default: 'c1:desc',
        apply: 'client',
      },
    ],
  };
  const data: WidgetData = {
    kind: 'TABLE',
    columns: [{ label: 'Name' }, { label: 'Sold', numeric: true }],
    rows: [
      [{ text: 'b' }, { text: '2' }],
      [{ text: 'a' }, { text: '10' }],
    ],
  };

  void it('starts the header sort from the widget sort option', () => {
    const widget: DashboardWidget = {
      definition,
      status: 'ok',
      data,
      options: { order: 'c1:desc' },
    };
    const markup = html(<WidgetGrid widgets={[widget]} />);
    assert.match(markup, /aria-sort="descending"/);
  });

  void it('leaves headers unsorted without option values', () => {
    const widget: DashboardWidget = { definition, status: 'ok', data };
    const markup = html(<WidgetGrid widgets={[widget]} />);
    assert.doesNotMatch(markup, /aria-sort="(ascending|descending)"/);
  });
});

void describe('useStoredLayout', () => {
  const persistence = createLayoutPersistence(memoryAdapter());
  const defaultLayout = { order: ['a', 'b'], hidden: [], minimized: [] };
  const scope = { dashboardKey: 'sales', userKey: 'u1' };

  function Probe({
    initialLayout,
  }: {
    readonly initialLayout?: typeof defaultLayout;
  }): React.ReactElement {
    const stored = useStoredLayout({
      persistence,
      scope,
      definitions: [],
      defaultLayout,
      ...(initialLayout === undefined ? {} : { initialLayout }),
    });
    return (
      <p>
        {stored.status}|{stored.layout.order.join(',')}|{String(stored.error)}|
        {String(stored.backup)}
      </p>
    );
  }

  void it('renders the default layout while loading, with no effects', () => {
    assert.match(html(<Probe />), /loading\|a,b\|null\|null/);
  });

  void it('renders the initial layout from the server instead', () => {
    const markup = html(
      <Probe initialLayout={{ order: ['b'], hidden: [], minimized: [] }} />
    );
    assert.match(markup, /loading\|b\|null\|null/);
  });
});
