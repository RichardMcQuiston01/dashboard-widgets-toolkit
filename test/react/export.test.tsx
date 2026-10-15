import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { defineWidget } from '../../src/core/definition.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import { WidgetGrid, WidgetSettingsProvider } from '../../src/react/index.js';

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
