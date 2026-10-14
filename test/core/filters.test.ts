import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineWidget } from '../../src/core/definition.js';
import {
  MAX_DASHBOARD_FILTERS,
  filterCacheParts,
  filterValuesFor,
  resolveFilterValues,
  usesFilter,
  type DashboardFilter,
} from '../../src/core/filters.js';
import { createWidgetLoader } from '../../src/core/loader.js';
import type { WidgetPayload } from '../../src/core/payload.js';
import {
  cacheKeyFor,
  filterValuesOf,
  resolveWidget,
  type CachedPayload,
  type ProviderOptions,
  type WidgetCache,
  type WidgetProviders,
} from '../../src/core/resolve.js';
import {
  validateDashboardFilters,
  validateWidgetDefinition,
} from '../../src/core/validate.js';

const NOW: number = Date.UTC(2026, 9, 14, 12, 0, 0);

const filters: readonly DashboardFilter[] = [
  {
    key: 'period',
    label: 'Period',
    type: 'dateRange',
    default: 'last30',
  },
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
];

function text(value: string): WidgetPayload {
  return { kind: 'TEXT', value, label: value };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

void describe('resolveFilterValues', () => {
  void it('uses the defaults, resolving a date range to an interval', () => {
    assert.deepEqual(resolveFilterValues(filters, undefined, { now: NOW }), {
      period: '2026-09-15/2026-10-14',
      store: 'all',
    });
  });

  void it('takes valid choices and ignores invalid or undeclared ones', () => {
    const values = resolveFilterValues(
      filters,
      { period: 'last7', store: 'nowhere', extra: 1 },
      { now: NOW }
    );
    assert.deepEqual(values, {
      period: '2026-10-08/2026-10-14',
      store: 'all',
    });
    assert.deepEqual(
      resolveFilterValues(filters, { store: 'north' }, { now: NOW }).store,
      'north'
    );
  });

  void it('is empty when the dashboard has no filters', () => {
    assert.deepEqual(resolveFilterValues(undefined, { a: 1 }), {});
    assert.deepEqual(resolveFilterValues([], { a: 1 }), {});
  });
});

void describe('which widgets use a filter', () => {
  const values = resolveFilterValues(filters, { store: 'north' }, { now: NOW });

  void it('gives a widget every filter unless it lists the ones it uses', () => {
    assert.equal(usesFilter({}, 'store'), true);
    assert.equal(usesFilter({ filters: ['period'] }, 'store'), false);
    assert.deepEqual(filterValuesFor({}, values), values);
    assert.deepEqual(filterValuesFor({ filters: ['store'] }, values), {
      store: 'north',
    });
    assert.deepEqual(filterValuesFor({ filters: [] }, values), {});
    assert.deepEqual(filterValuesFor({ filters: ['gone'] }, values), {});
  });

  void it('keeps cache keys plain on defaults and apart otherwise', () => {
    const onDefaults = resolveFilterValues(filters, undefined, { now: NOW });
    assert.deepEqual(
      filterCacheParts({}, filters, onDefaults, { now: NOW }),
      []
    );
    assert.deepEqual(filterCacheParts({}, filters, values, { now: NOW }), [
      'filter.store=%22north%22',
    ]);
    assert.deepEqual(
      filterCacheParts({ filters: ['period'] }, filters, values, { now: NOW }),
      []
    );
  });
});

void describe('validateDashboardFilters', () => {
  void it('accepts the filters above', () => {
    const result = validateDashboardFilters(filters);
    assert.ok(result.ok);
    assert.equal(result.value.length, 2);
  });

  void it('names what is wrong', () => {
    const notArray = validateDashboardFilters({});
    assert.ok(!notArray.ok);
    assert.match(notArray.error, /Dashboard filters: must be an array/);

    const sort = validateDashboardFilters([
      { key: 'order', label: 'Order', type: 'sort', columns: [] },
    ]);
    assert.ok(!sort.ok);
    assert.match(
      sort.error,
      /filters\[0\]\.type "sort" describes a single widget/
    );

    const twice = validateDashboardFilters([filters[1], filters[1]]);
    assert.ok(!twice.ok);
    assert.match(
      twice.error,
      /filters\[1\]\.key "store" is used by another option/
    );

    const bad = validateDashboardFilters([
      {
        key: 'store',
        label: 'Store',
        type: 'choice',
        choices: [],
        default: 'a',
      },
    ]);
    assert.ok(!bad.ok);
    assert.match(bad.error, /filters\[0\]\.choices/);
  });

  void it('limits how many filters there can be', () => {
    const many = Array.from({ length: MAX_DASHBOARD_FILTERS + 1 }, (_, i) => ({
      key: `f${i}`,
      label: `F${i}`,
      type: 'boolean',
      default: false,
    }));
    const result = validateDashboardFilters(many);
    assert.ok(!result.ok);
    assert.match(result.error, /the most a dashboard may have is 12/);
  });
});

void describe('a definition that lists its filters', () => {
  void it('is valid with keys, and says what is wrong otherwise', () => {
    const base = { key: 'a', title: 'A', kind: 'TEXT' };
    assert.ok(validateWidgetDefinition({ ...base, filters: ['period'] }).ok);
    assert.ok(validateWidgetDefinition({ ...base, filters: [] }).ok);
    const notArray = validateWidgetDefinition({ ...base, filters: 'period' });
    assert.ok(!notArray.ok);
    assert.match(notArray.error, /filters must be an array/);
    const twice = validateWidgetDefinition({
      ...base,
      filters: ['period', 'period'],
    });
    assert.ok(!twice.ok);
    assert.match(twice.error, /filters\[1\] "period" is listed twice/);
    const bad = validateWidgetDefinition({ ...base, filters: ['1bad'] });
    assert.ok(!bad.ok);
    assert.match(bad.error, /filters\[0\] must be a filter key/);
  });
});

void describe('providers and cache keys', () => {
  const sales = defineWidget({ key: 'sales', title: 'Sales', kind: 'TEXT' });
  const stores = defineWidget({
    key: 'stores',
    title: 'Stores',
    kind: 'TEXT',
    filters: ['store'],
  });
  const fixed = defineWidget({
    key: 'fixed',
    title: 'Fixed',
    kind: 'TEXT',
    filters: [],
  });

  void it('hands a provider the filters it uses', async () => {
    const seen: Record<string, unknown> = {};
    const provider =
      (name: string) =>
      (_context: unknown, _definition: unknown, options: ProviderOptions) => {
        seen[name] = options.filters;
        return text(name);
      };
    const resolveOptions = {
      filters,
      filterValues: { store: 'north' },
      now: NOW,
    };
    for (const definition of [sales, stores, fixed]) {
      const widget = await resolveWidget(
        definition,
        provider(definition.key),
        {},
        resolveOptions
      );
      assert.equal(widget.status, 'ok');
    }
    assert.deepEqual(seen['sales'], {
      period: '2026-09-15/2026-10-14',
      store: 'north',
    });
    assert.deepEqual(seen['stores'], { store: 'north' });
    assert.deepEqual(seen['fixed'], {});
  });

  void it('tells the loaded widget which filters it was loaded with', async () => {
    const widget = await resolveWidget(
      stores,
      () => text('x'),
      {},
      { filters, filterValues: { store: 'north' }, now: NOW }
    );
    assert.deepEqual(widget.filters, { store: 'north' });
    const none = await resolveWidget(fixed, () => text('x'), {}, { filters });
    assert.equal(none.filters, undefined);
    const noFilters = await resolveWidget(sales, () => text('x'), {});
    assert.equal(noFilters.filters, undefined);
  });

  void it('keeps the plain cache key on defaults and adds the filters used', () => {
    const base = { filters, now: NOW };
    assert.equal(cacheKeyFor(sales, base), 'sales');
    assert.equal(
      cacheKeyFor(sales, { ...base, filterValues: { store: 'north' } }),
      'sales?filter.store=%22north%22'
    );
    assert.equal(
      cacheKeyFor(fixed, { ...base, filterValues: { store: 'north' } }),
      'fixed'
    );
    assert.deepEqual(
      filterValuesOf(stores, { ...base, filterValues: { store: 'north' } }),
      { store: 'north' }
    );
  });

  void it('puts the view, the filters and the options in one key', () => {
    const widget = defineWidget({
      key: 'mix',
      title: 'Mix',
      kind: 'TEXT',
      options: [
        {
          key: 'top',
          label: 'Top',
          type: 'number',
          min: 1,
          max: 20,
          default: 5,
        },
      ],
      views: [{ key: 'alt', label: 'Alt', kind: 'TEXT' }],
    });
    const key = cacheKeyFor(
      widget,
      {
        filters,
        filterValues: { store: 'north' },
        optionValues: { mix: { top: 10 } },
        viewValues: { mix: 'alt' },
      },
      { top: 10 }
    );
    assert.equal(key, 'mix?view=alt&filter.store=%22north%22&top=10');
  });
});

void describe('the loader and dashboard filters', () => {
  const sales = defineWidget({
    key: 'sales',
    title: 'Sales',
    kind: 'TEXT',
    sortOrder: 1,
  });
  const stores = defineWidget({
    key: 'stores',
    title: 'Stores',
    kind: 'TEXT',
    sortOrder: 2,
    filters: ['store'],
  });
  const fixed = defineWidget({
    key: 'fixed',
    title: 'Fixed',
    kind: 'TEXT',
    sortOrder: 3,
    filters: [],
  });

  function setup(cache?: MemoryCache) {
    const calls: { key: string; store: unknown }[] = [];
    const providers: WidgetProviders = {
      sales: (_c, _d, o) => (
        calls.push({ key: 'sales', store: o.filters['store'] }),
        text(`sales ${String(o.filters['store'])}`)
      ),
      stores: (_c, _d, o) => (
        calls.push({ key: 'stores', store: o.filters['store'] }),
        text(`stores ${String(o.filters['store'])}`)
      ),
      fixed: () => (calls.push({ key: 'fixed', store: undefined }), text('f')),
    };
    const loader = createWidgetLoader({
      definitions: [sales, stores, fixed],
      providers,
      context: {},
      filters,
      now: NOW,
      ...(cache === undefined ? {} : { cache }),
    });
    return { calls, loader };
  }

  void it('loads with the initial filter values', async () => {
    const calls: unknown[] = [];
    const loader = createWidgetLoader({
      definitions: [sales],
      providers: {
        sales: (_c, _d, o) => (calls.push(o.filters['store']), text('x')),
      },
      context: {},
      filters,
      filterValues: { store: 'north' },
      now: NOW,
    });
    loader.loadAll();
    await sleep(5);
    assert.deepEqual(calls, ['north']);
    loader.dispose();
  });

  void it('reloads only the widgets that use a changed filter', async () => {
    const { calls, loader } = setup();
    loader.loadAll();
    await sleep(5);
    assert.equal(calls.length, 3);

    loader.setFilterValues({ store: 'north' });
    // What was shown stays, marked stale, until the new data arrives.
    const staleNow = loader
      .getSnapshot()
      .filter((widget) => widget.status === 'ok' && widget.stale === true)
      .map((widget) => widget.definition.key);
    assert.deepEqual(staleNow, ['sales', 'stores']);
    await sleep(5);
    assert.deepEqual(calls.slice(3), [
      { key: 'sales', store: 'north' },
      { key: 'stores', store: 'north' },
    ]);
    const texts = loader
      .getSnapshot()
      .map((widget) => (widget.status === 'ok' ? widget.data : null));
    assert.deepEqual(
      texts.map((data) => (data?.kind === 'TEXT' ? data.value : null)),
      ['sales north', 'stores north', 'f']
    );

    // A filter nobody but the first widget uses.
    loader.setFilterValues({ store: 'north', period: 'last7' });
    await sleep(5);
    assert.deepEqual(
      calls.slice(5).map((call) => call.key),
      ['sales']
    );
    loader.dispose();
  });

  void it('does nothing when the resolved values do not change', async () => {
    const { calls, loader } = setup();
    loader.loadAll();
    await sleep(5);
    loader.setFilterValues({ store: 'all' });
    loader.setFilterValues({ store: 'bogus' });
    await sleep(5);
    assert.equal(calls.length, 3);
    loader.dispose();
  });

  void it('lets a widget that has not started load with the new values', async () => {
    const { calls, loader } = setup();
    loader.setFilterValues({ store: 'north' });
    loader.load('stores');
    await sleep(5);
    assert.deepEqual(calls, [{ key: 'stores', store: 'north' }]);
    loader.dispose();
  });

  void it('brings an earlier answer back from the cache for the same choices', async () => {
    const cache = new MemoryCache();
    const { calls, loader } = setup(cache);
    loader.loadAll();
    await sleep(5);
    loader.setFilterValues({ store: 'north' });
    await sleep(5);
    assert.ok(cache.entries.has('sales'));
    assert.ok(cache.entries.has('sales?filter.store=%22north%22'));
    const before = calls.length;
    loader.setFilterValues({});
    // The cached answer for the defaults is shown at once (stale) while the
    // provider is asked again.
    await sleep(0);
    const sales0 = loader.getSnapshot()[0];
    assert.equal(sales0?.status, 'ok');
    assert.equal(
      sales0?.status === 'ok' && sales0.data.kind === 'TEXT'
        ? sales0.data.value
        : '',
      'sales all'
    );
    await sleep(5);
    assert.equal(calls.length, before + 2);
    loader.dispose();
  });
});
