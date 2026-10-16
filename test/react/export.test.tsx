import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { defineWidget } from '../../src/core/definition.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import {
  WidgetDetail,
  WidgetGrid,
  WidgetSettingsProvider,
  type ExportFormat,
} from '../../src/react/index.js';

const widgets: DashboardWidget[] = [
  {
    definition: defineWidget({ key: 'orders', title: 'Orders', kind: 'TABLE' }),
    status: 'ok',
    data: {
      kind: 'TABLE',
      columns: [{ label: 'Order' }],
      rows: [[{ text: '#1' }]],
    },
  },
  {
    definition: defineWidget({ key: 'note', title: 'Note', kind: 'TEXT' }),
    status: 'ok',
    data: { kind: 'TEXT', value: 'hello', label: 'Greeting' },
  },
  {
    definition: defineWidget({ key: 'slow', title: 'Slow', kind: 'TABLE' }),
    status: 'loading',
  },
];

function html(formats?: readonly 'csv'[]): string {
  return renderToStaticMarkup(
    <WidgetSettingsProvider locale="en-US">
      <WidgetGrid
        widgets={widgets}
        {...(formats === undefined ? {} : { exportFormats: formats })}
      />
    </WidgetSettingsProvider>
  );
}

void describe('Download CSV button', () => {
  void it('is off unless exportFormats lists csv', () => {
    assert.doesNotMatch(html(), /Download .* as CSV/);
    assert.doesNotMatch(html([]), /Download .* as CSV/);
  });

  void it('shows only on loaded cards that have rows', () => {
    const markup: string = html(['csv']);
    assert.match(markup, /aria-label="Download Orders as CSV"/);
    assert.doesNotMatch(markup, /Download Note as CSV/);
    assert.doesNotMatch(markup, /Download Slow as CSV/);
  });
});

void describe('detail view Download CSV', () => {
  const data = {
    columns: [{ key: 'a', label: 'Name' }],
    rows: [[{ text: 'Ann' }]],
  };
  const query = { page: 1, pageSize: 25 };

  function detailHtml(props: Record<string, unknown>): string {
    return renderToStaticMarkup(
      <WidgetSettingsProvider locale="en-US">
        <WidgetDetail
          title="Orders"
          data={{
            ...data,
            ...(props['server'] === true ? { totalRows: 1 } : {}),
          }}
          query={query}
          onQueryChange={() => undefined}
          {...(props['server'] === true ? { mode: 'server' as const } : {})}
          {...(props['formats'] === undefined
            ? {}
            : { exportFormats: props['formats'] as readonly 'csv'[] })}
          {...(props['all'] === true ? { onExportAll: () => data } : {})}
        />
      </WidgetSettingsProvider>
    );
  }

  void it('is off unless exportFormats lists csv', () => {
    assert.doesNotMatch(detailHtml({}), /Download Orders as CSV/);
  });

  void it('shows in client mode', () => {
    assert.match(detailHtml({ formats: ['csv'] }), /Download Orders as CSV/);
  });

  void it('needs onExportAll in server mode', () => {
    assert.doesNotMatch(
      detailHtml({ formats: ['csv'], server: true }),
      /Download Orders as CSV/
    );
    assert.match(
      detailHtml({ formats: ['csv'], server: true, all: true }),
      /Download Orders as CSV/
    );
  });
});

void describe('chart SVG and PNG buttons', () => {
  const chart: DashboardWidget = {
    definition: defineWidget({ key: 'rev', title: 'Revenue', kind: 'GRAPH' }),
    status: 'ok',
    data: {
      kind: 'GRAPH',
      chartType: 'bar',
      valueFormat: 'number',
      series: [{ name: 'A', points: [{ label: 'Jan', value: 1 }] }],
    },
  };

  function chartHtml(formats: readonly ExportFormat[]): string {
    return renderToStaticMarkup(
      <WidgetSettingsProvider locale="en-US">
        <WidgetGrid widgets={[chart, ...widgets]} exportFormats={formats} />
      </WidgetSettingsProvider>
    );
  }

  void it('adds them only to charts, and only when listed', () => {
    const markup: string = chartHtml(['svg', 'png']);
    assert.match(markup, /aria-label="Download Revenue as SVG"/);
    assert.match(markup, /aria-label="Download Revenue as PNG"/);
    assert.doesNotMatch(markup, /Download Revenue as CSV/);
    assert.doesNotMatch(markup, /Download Orders as (SVG|PNG)/);
    assert.doesNotMatch(chartHtml(['csv']), /as (SVG|PNG)/);
  });

  void it('puts CSV on charts too', () => {
    assert.match(chartHtml(['csv']), /Download Revenue as CSV/);
  });
});
