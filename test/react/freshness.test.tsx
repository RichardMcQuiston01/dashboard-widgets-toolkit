import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { defineWidget } from '../../src/core/definition.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import { WidgetGrid, WidgetSettingsProvider } from '../../src/react/index.js';

const definition = defineWidget({ key: 'rev', title: 'Revenue', kind: 'TEXT' });
const data = { kind: 'TEXT', value: '$10', label: 'Revenue' } as const;
const FIVE_MINUTES = 5 * 60_000;

function okWidget(extra: Record<string, unknown>): DashboardWidget {
  return { definition, status: 'ok', data, ...extra } as DashboardWidget;
}

function html(
  widget: DashboardWidget,
  props: Record<string, unknown> = {}
): string {
  return renderToStaticMarkup(
    <WidgetSettingsProvider locale="en-US">
      <WidgetGrid widgets={[widget]} {...props} />
    </WidgetSettingsProvider>
  );
}

void describe('freshness line', () => {
  void it('is off unless freshness is set', () => {
    const markup: string = html(
      okWidget({ updatedAt: Date.now() - FIVE_MINUTES })
    );
    assert.doesNotMatch(markup, /Updated/);
  });

  void it('says how old the data is', () => {
    const markup: string = html(
      okWidget({ updatedAt: Date.now() - FIVE_MINUTES }),
      { freshness: true }
    );
    assert.match(markup, /Updated 5 minutes ago/);
    assert.match(markup, /<time dateTime="[^"]+" title="[^"]+"/);
  });

  void it('says just now for fresh data', () => {
    assert.match(
      html(okWidget({ updatedAt: Date.now() }), { freshness: true }),
      /Updated just now/
    );
  });

  void it('shows nothing when the data has no time, or the card is not loaded', () => {
    assert.doesNotMatch(html(okWidget({}), { freshness: true }), /Updated/);
    assert.doesNotMatch(
      html({ definition, status: 'loading' }, { freshness: true }),
      /Updated/
    );
  });

  void it('flags a failed refresh and keeps showing the data', () => {
    const markup: string = html(
      okWidget({
        updatedAt: Date.now() - FIVE_MINUTES,
        refreshError: 'Widget "rev": provider failed: 503',
      }),
      { freshness: true }
    );
    assert.match(
      markup,
      /Couldn&#x27;t refresh\. Showing data from 5 minutes ago/
    );
    assert.match(
      markup,
      /role="status"[^>]*title="Widget &quot;rev&quot;: provider failed: 503"/
    );
    assert.match(markup, /\$10/);
    assert.doesNotMatch(markup, /Updated 5 minutes ago/);
  });
});

void describe('refresh button', () => {
  void it('needs onRefresh and a loaded card', () => {
    assert.doesNotMatch(html(okWidget({})), /Refresh Revenue/);
    assert.match(
      html(okWidget({}), { onRefresh: () => undefined }),
      /aria-label="Refresh Revenue"/
    );
    assert.doesNotMatch(
      html({ definition, status: 'loading' }, { onRefresh: () => undefined }),
      /Refresh Revenue/
    );
  });

  void it('is busy while the widget is stale', () => {
    const markup: string = html(okWidget({ stale: true }), {
      onRefresh: () => undefined,
    });
    assert.match(markup, /aria-label="Refreshing Revenue"/);
    assert.match(markup, /data-busy="true"/);
    assert.match(markup, /aria-disabled="true"/);
  });
});
