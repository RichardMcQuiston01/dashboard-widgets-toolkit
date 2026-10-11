import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { EMPTY_LAYOUT } from '../../src/core/layout.js';
import { createWidgetLoader } from '../../src/core/loader.js';
import type {
  GraphWidgetData,
  KpiWidgetData,
  WidgetPayload,
} from '../../src/core/payload.js';
import {
  cacheKeyFor,
  resolvePayload,
  resolveWidgets,
  type CachedPayload,
  type DashboardWidget,
  type WidgetCache,
  type WidgetProviders,
} from '../../src/core/resolve.js';
import {
  setWidgetSettings,
  viewValuesFromLayout,
} from '../../src/core/settings.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';
import {
  applyView,
  isProviderView,
  loadViewKey,
  loadViewKind,
} from '../../src/core/views.js';

const kpi: KpiWidgetData = {
  kind: 'KPI',
  value: 10,
  format: 'number',
  label: 'Revenue',
};
const trend: GraphWidgetData = {
  kind: 'GRAPH',
  series: [{ name: 'Revenue', points: [{ label: 'Jan', value: 1 }] }],
  chartType: 'line',
  valueFormat: 'number',
};

const revenue: WidgetDefinition = defineWidget({
  key: 'revenue',
  title: 'Revenue',
  kind: 'KPI',
  views: [{ key: 'trend', label: 'Trend', kind: 'GRAPH' }],
});

/** Provider that answers by `options.view` and records what it was asked. */
function recorder(): { providers: WidgetProviders; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    providers: {
      revenue: (_context, _definition, { view }): WidgetPayload => {
        asked.push(view);
        return view === 'trend' ? trend : kpi;
      },
    },
  };
}

class MemoryCache implements WidgetCache {
  readonly entries = new Map<string, CachedPayload>();
  get(key: string): CachedPayload | undefined {
    return this.entries.get(key);
  }
  set(key: string, entry: CachedPayload): void {
    this.entries.set(key, entry);
  }
}

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

void describe('which view is loaded', () => {
  void it('asks the provider only for views it supplies; everything else is base', () => {
    assert.equal(isProviderView({}), true);
    assert.equal(loadViewKey(revenue, undefined), 'base');
    assert.equal(loadViewKey(revenue, 'trend'), 'trend');
    assert.equal(loadViewKey(revenue, 'nope'), 'base');
    assert.equal(loadViewKind(revenue, 'trend'), 'GRAPH');
    const converted = defineWidget({
      key: 't',
      title: 'T',
      kind: 'TABLE',
      views: [
        {
          key: 'bars',
          label: 'Bars',
          kind: 'BAR_LIST',
          convert: { type: 'tableToBarList', label: 0, value: 1 },
        },
      ],
    });
    assert.equal(loadViewKey(converted, 'bars'), 'base');
  });

  void it('falls back to defaultView', () => {
    const widget = { ...revenue, defaultView: 'trend' };
    assert.equal(loadViewKey(widget, undefined), 'trend');
    assert.equal(loadViewKey(widget, 'base'), 'base');
  });
});

void describe('resolving a provider view', () => {
  void it('passes the view to the provider, validates against the view’s kind and stamps it', async () => {
    const { providers, asked } = recorder();
    const [base] = await resolveWidgets([revenue], providers, {});
    assert.equal(base?.status, 'ok');
    assert.equal(base?.status === 'ok' && base.view, 'base');
    const [view] = await resolveWidgets(
      [revenue],
      providers,
      {},
      {
        viewValues: { revenue: 'trend' },
      }
    );
    assert.equal(view?.status === 'ok' && view.data.kind, 'GRAPH');
    assert.equal(view?.status === 'ok' && view.view, 'trend');
    assert.deepEqual(asked, ['base', 'trend']);
  });

  void it('rejects a payload of the wrong kind for the view', () => {
    const resolved = resolvePayload(revenue, kpi, {
      viewValues: { revenue: 'trend' },
    });
    assert.equal(resolved.status, 'error');
    assert.match(
      resolved.status === 'error' ? resolved.error : '',
      /expected kind GRAPH from its definition, got KPI/
    );
  });

  void it('does not stamp widgets that declare no views', async () => {
    const plain = defineWidget({ key: 'p', title: 'P', kind: 'TEXT' });
    const [widget] = await resolveWidgets(
      [plain],
      { p: () => ({ kind: 'TEXT', value: 'x', label: 'x' }) },
      {}
    );
    assert.equal(widget?.status === 'ok' && 'view' in widget, false);
  });

  void it('caches each provider view apart and leaves base keys alone', () => {
    assert.equal(cacheKeyFor(revenue, {}), 'revenue');
    assert.equal(
      cacheKeyFor(revenue, { viewValues: { revenue: 'trend' } }),
      'revenue?view=trend'
    );
    const withOptions = defineWidget({
      ...revenue,
      options: [
        {
          type: 'number',
          key: 'limit',
          label: 'L',
          min: 1,
          max: 9,
          default: 3,
        },
      ],
    });
    assert.equal(
      cacheKeyFor(
        withOptions,
        { viewValues: { revenue: 'trend' } },
        { limit: 5 }
      ),
      'revenue?view=trend&limit=5'
    );
  });
});

void describe('loader.setView', () => {
  void it('loads only the chosen provider view, shows loading meanwhile, then the view’s data', async () => {
    const { providers, asked } = recorder();
    const loader = createWidgetLoader({
      definitions: [revenue],
      providers,
      context: {},
    });
    loader.loadAll();
    await tick();
    assert.deepEqual(asked, ['base']);
    loader.setView('revenue', 'trend');
    assert.equal(loader.getSnapshot()[0]?.status, 'loading');
    await tick();
    const widget = loader.getSnapshot()[0] as DashboardWidget;
    assert.equal(widget.status === 'ok' && widget.view, 'trend');
    assert.deepEqual(asked, ['base', 'trend']);
    loader.dispose();
  });

  void it('does nothing when the new view loads the same payload', async () => {
    const converted = defineWidget({
      key: 'c',
      title: 'C',
      kind: 'KPI',
      views: [
        { key: 'trend', label: 'Trend', kind: 'GRAPH' },
        {
          key: 'again',
          label: 'Again',
          kind: 'TABLE',
          convert: { type: 'graphToTable' },
        },
      ],
    });
    let calls = 0;
    const loader = createWidgetLoader({
      definitions: [converted],
      providers: { c: () => (calls++, kpi) },
      context: {},
    });
    loader.loadAll();
    await tick();
    loader.setView('c', 'again');
    loader.setView('c', undefined);
    await tick();
    assert.equal(calls, 1);
    loader.dispose();
  });

  void it('brings an earlier answer for the same view back from the cache', async () => {
    const { providers, asked } = recorder();
    const cache = new MemoryCache();
    const loader = createWidgetLoader({
      definitions: [revenue],
      providers,
      context: {},
      cache,
    });
    loader.loadAll();
    await tick();
    loader.setView('revenue', 'trend');
    await tick();
    loader.setView('revenue', 'base');
    await tick();
    assert.deepEqual([...cache.entries.keys()].sort(), [
      'revenue',
      'revenue?view=trend',
    ]);
    assert.equal(asked.length, 3);
    loader.dispose();
  });

  void it('starts on the viewValues it was given and on defaultView', async () => {
    const { providers, asked } = recorder();
    const loader = createWidgetLoader({
      definitions: [revenue],
      providers,
      context: {},
      viewValues: { revenue: 'trend' },
    });
    loader.loadAll();
    await tick();
    assert.deepEqual(asked, ['trend']);
    loader.dispose();
    const asked2 = recorder();
    const second = createWidgetLoader({
      definitions: [{ ...revenue, defaultView: 'trend' }],
      providers: asked2.providers,
      context: {},
    });
    second.loadAll();
    await tick();
    assert.deepEqual(asked2.asked, ['trend']);
    second.dispose();
  });
});

void describe('applyView with a provider view', () => {
  void it('keeps the payload and sets the kind', () => {
    const widget: DashboardWidget = {
      definition: revenue,
      status: 'ok',
      data: trend,
      view: 'trend',
    };
    const shown = applyView(widget, 'trend');
    assert.equal(shown.definition.kind, 'GRAPH');
    assert.equal(shown.status === 'ok' && shown.data.kind, 'GRAPH');
  });

  void it('shows loading instead of data loaded for another view, in either direction', () => {
    const base: DashboardWidget = {
      definition: revenue,
      status: 'ok',
      data: kpi,
      view: 'base',
    };
    const toTrend = applyView(base, 'trend');
    assert.equal(toTrend.status, 'loading');
    assert.equal(toTrend.definition.kind, 'GRAPH');
    const held: DashboardWidget = {
      definition: revenue,
      status: 'ok',
      data: trend,
      view: 'trend',
    };
    const toBase = applyView(held, 'base');
    assert.equal(toBase.status, 'loading');
    assert.equal(toBase.definition.kind, 'KPI');
  });
});

void describe('viewValuesFromLayout and validation', () => {
  void it('lists widgets with provider views, empty when nothing is chosen or locked', () => {
    const converted = defineWidget({
      key: 'c',
      title: 'C',
      kind: 'TABLE',
      views: [
        {
          key: 'b',
          label: 'B',
          kind: 'BAR_LIST',
          convert: { type: 'tableToBarList', label: 0, value: 1 },
        },
      ],
    });
    const locked = { ...revenue, key: 'locked', locked: { options: true } };
    const layout = setWidgetSettings(
      setWidgetSettings(EMPTY_LAYOUT, 'revenue', { view: 'trend' }),
      'locked',
      { view: 'trend' }
    );
    assert.deepEqual(
      viewValuesFromLayout([revenue, converted, locked], layout),
      {
        revenue: 'trend',
        locked: '',
      }
    );
    assert.deepEqual(viewValuesFromLayout([revenue], EMPTY_LAYOUT), {
      revenue: '',
    });
    assert.deepEqual(
      viewValuesFromLayout([locked], layout, { overrideLocks: true }),
      { locked: 'trend' }
    );
  });

  void it('accepts a view with no convert, and still checks kind and key', () => {
    assert.ok(
      validateWidgetDefinition({
        key: 'r',
        title: 'R',
        kind: 'KPI',
        views: [{ key: 'trend', label: 'Trend', kind: 'GRAPH' }],
      }).ok
    );
    const bad = validateWidgetDefinition({
      key: 'r',
      title: 'R',
      kind: 'KPI',
      views: [{ key: 'trend', label: 'Trend', kind: 'CHART' }],
    });
    assert.ok(!bad.ok);
    assert.match(bad.error, /views\[0\]\.kind/);
  });
});
