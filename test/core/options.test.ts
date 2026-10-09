import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineWidget } from '../../src/core/definition.js';
import { createWidgetLoader } from '../../src/core/loader.js';
import {
  applyClientOptions,
  coerceOptionValue,
  optionsCacheSuffix,
  parseSortValue,
  resolveDateRange,
  resolveOptionValues,
  sameOptionValues,
  type WidgetOption,
} from '../../src/core/options.js';
import type { TableWidgetData, WidgetPayload } from '../../src/core/payload.js';
import {
  cacheKeyFor,
  resolveWidgets,
  type CachedPayload,
  type DashboardWidget,
  type ProviderOptions,
  type WidgetCache,
  type WidgetProviders,
} from '../../src/core/resolve.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';

// 2026-03-15 12:00 UTC.
const NOW: number = Date.UTC(2026, 2, 15, 12, 0, 0);

const limit: WidgetOption = {
  type: 'number',
  key: 'limit',
  label: 'Rows',
  min: 5,
  max: 50,
  step: 5,
  default: 10,
};
const metric: WidgetOption = {
  type: 'choice',
  key: 'metric',
  label: 'Metric',
  choices: [
    { value: 'units', label: 'Units' },
    { value: 'revenue', label: 'Revenue' },
  ],
  default: 'units',
};

const table: TableWidgetData = {
  kind: 'TABLE',
  columns: [
    { label: 'Name' },
    { label: 'Sold', numeric: true },
    { label: 'Price' },
  ],
  rows: [
    [{ text: 'Jig' }, { text: '7', value: 7 }, { text: '$1' }],
    [{ text: 'Gauge' }, { text: '30', value: 30 }, { text: '$2' }],
    [{ text: 'Vise' }, { text: '12', value: 12 }, { text: '$3' }],
  ],
  footer: 'and 9 more',
};

const names = (data: TableWidgetData): string[] =>
  data.rows.map((row) => row[0]?.text ?? '');

void describe('resolveDateRange', () => {
  void it('resolves presets to calendar days', () => {
    const at = (preset: string): string | undefined =>
      resolveDateRange(preset, { now: NOW });
    assert.equal(at('today'), '2026-03-15/2026-03-15');
    assert.equal(at('yesterday'), '2026-03-14/2026-03-14');
    assert.equal(at('last7'), '2026-03-09/2026-03-15');
    assert.equal(at('last30'), '2026-02-14/2026-03-15');
    assert.equal(at('last90'), '2025-12-16/2026-03-15');
    assert.equal(at('thisMonth'), '2026-03-01/2026-03-15');
    assert.equal(at('lastMonth'), '2026-02-01/2026-02-28');
    assert.equal(at('thisYear'), '2026-01-01/2026-03-15');
    assert.equal(at('lastYear'), '2025-01-01/2025-12-31');
  });

  void it('rolls back over a year boundary', () => {
    const january: number = Date.UTC(2026, 0, 10, 12);
    assert.equal(
      resolveDateRange('lastMonth', { now: january }),
      '2025-12-01/2025-12-31'
    );
  });

  void it('uses the time zone for today', () => {
    const lateNight: number = Date.UTC(2026, 2, 15, 1, 0, 0);
    assert.equal(
      resolveDateRange('today', {
        now: lateNight,
        timeZone: 'America/Los_Angeles',
      }),
      '2026-03-14/2026-03-14'
    );
    assert.equal(
      resolveDateRange('today', { now: lateNight }),
      '2026-03-15/2026-03-15'
    );
    assert.equal(
      resolveDateRange('today', { now: lateNight, timeZone: 'Not/AZone' }),
      '2026-03-15/2026-03-15'
    );
  });

  void it('keeps a valid interval and refuses anything else', () => {
    assert.equal(
      resolveDateRange('2026-01-01/2026-01-31'),
      '2026-01-01/2026-01-31'
    );
    for (const bad of [
      '2026-02-30/2026-03-01',
      '2026-03-02/2026-03-01',
      '2026-01-01',
      'last-week',
      '',
    ]) {
      assert.equal(resolveDateRange(bad, { now: NOW }), undefined, bad);
    }
  });
});

void describe('resolveOptionValues', () => {
  const definition = {
    options: [
      limit,
      metric,
      { type: 'boolean', key: 'refunds', label: 'Refunds', default: false },
      { type: 'text', key: 'q', label: 'Search', maxLength: 10, default: '' },
      { type: 'color', key: 'accent', label: 'Accent', default: '#1c5cab' },
      {
        type: 'dateRange',
        key: 'period',
        label: 'Period',
        presets: [
          { value: 'last7', label: 'Last 7 days' },
          { value: 'last30', label: 'Last 30 days' },
        ],
        default: 'last30',
      },
      {
        type: 'sort',
        key: 'sort',
        label: 'Sort',
        columns: [{ key: 'c1', label: 'Sold' }],
      },
      {
        type: 'columns',
        key: 'columns',
        label: 'Columns',
        columns: [
          { key: 'c0', label: 'Name' },
          { key: 'c1', label: 'Sold' },
          { key: 'c2', label: 'Price' },
        ],
        default: ['c0', 'c1'],
      },
    ] as WidgetOption[],
  };
  const resolve = (chosen?: Record<string, unknown>) =>
    resolveOptionValues(definition, chosen, { now: NOW });

  void it('gives every default when nothing is chosen', () => {
    assert.deepEqual(resolve(), {
      limit: 10,
      metric: 'units',
      refunds: false,
      q: '',
      accent: '#1c5cab',
      period: '2026-02-14/2026-03-15',
      columns: ['c0', 'c1'],
    });
  });

  void it('takes valid choices, trimmed and normalized', () => {
    assert.deepEqual(
      resolve({
        limit: 25,
        metric: 'revenue',
        refunds: true,
        q: '  jig ',
        accent: '#ABCDEF',
        period: 'last7',
        sort: 'c1:desc',
        columns: ['c2', 'c0'],
      }),
      {
        limit: 25,
        metric: 'revenue',
        refunds: true,
        q: 'jig',
        accent: '#abcdef',
        period: '2026-03-09/2026-03-15',
        sort: 'c1:desc',
        columns: ['c2', 'c0'],
      }
    );
  });

  void it('ignores invalid values and unknown keys instead of failing', () => {
    const values = resolve({
      limit: 12, // off the step grid
      metric: 'profit',
      refunds: 'yes',
      q: 'a'.repeat(11),
      accent: 'red',
      period: 'thisYear', // a preset the option doesn't offer
      sort: 'c9:asc',
      columns: ['c0', 'c0'],
      surprise: 1,
    });
    assert.equal(values['limit'], 10);
    assert.equal(values['metric'], 'units');
    assert.equal(values['refunds'], false);
    assert.equal(values['q'], '');
    assert.equal(values['accent'], '#1c5cab');
    assert.equal(values['period'], '2026-02-14/2026-03-15');
    assert.equal('sort' in values, false);
    assert.deepEqual(values['columns'], ['c0', 'c1']);
    assert.equal('surprise' in values, false);
  });

  void it('rejects control characters in text and non-finite numbers', () => {
    assert.equal(
      coerceOptionValue(definition.options[3] as WidgetOption, 'a\u0000b'),
      undefined
    );
    assert.equal(coerceOptionValue(limit, Number.NaN), undefined);
    assert.equal(coerceOptionValue(limit, 4), undefined);
    assert.equal(coerceOptionValue(limit, 55), undefined);
  });

  void it('is empty for a definition with no options', () => {
    assert.deepEqual(resolveOptionValues({}, { a: 1 }), {});
    assert.equal(
      resolveOptionValues({}, undefined),
      resolveOptionValues({ options: [] }, undefined)
    );
  });

  void it('compares sets of values', () => {
    assert.equal(
      sameOptionValues({ a: 1, b: ['x'] }, { a: 1, b: ['x'] }),
      true
    );
    assert.equal(sameOptionValues({ a: 1 }, { a: 2 }), false);
    assert.equal(sameOptionValues({ a: ['x'] }, { a: ['x', 'y'] }), false);
    assert.equal(sameOptionValues({ a: 1 }, {}), false);
  });
});

void describe('parseSortValue', () => {
  void it('reads column and direction', () => {
    assert.deepEqual(parseSortValue('c1:desc'), {
      column: 'c1',
      direction: 'desc',
    });
    assert.equal(parseSortValue('c1'), undefined);
    assert.equal(parseSortValue('c1:up'), undefined);
    assert.equal(parseSortValue(':asc'), undefined);
  });
});

void describe('cache keys', () => {
  const sortOption: WidgetOption = {
    type: 'sort',
    key: 'sort',
    label: 'Sort',
    columns: [{ key: 'c1', label: 'Sold' }],
    default: 'c1:desc',
    apply: 'client',
  };
  const definition = defineWidget({
    key: 'top',
    title: 'Top',
    kind: 'TABLE',
    options: [limit, metric, sortOption],
  });
  const suffix = (chosen?: Record<string, unknown>): string =>
    optionsCacheSuffix(
      definition,
      resolveOptionValues(definition, chosen, { now: NOW }),
      { now: NOW }
    );

  void it('is empty on defaults, so the plain key stays', () => {
    assert.equal(suffix(), '');
    assert.equal(
      cacheKeyFor(definition, {}, resolveOptionValues(definition, undefined)),
      'top'
    );
  });

  void it('lists non-default choices in key order and ignores client-applied ones', () => {
    assert.equal(
      suffix({ metric: 'revenue', limit: 20 }),
      '?limit=20&metric=%22revenue%22'
    );
    assert.equal(suffix({ sort: 'c1:asc' }), '');
  });

  void it('is added to a custom cache key too', () => {
    const values = resolveOptionValues(definition, { limit: 20 });
    assert.equal(
      cacheKeyFor(definition, { cacheKey: (d) => `v2:${d.key}` }, values),
      'v2:top?limit=20'
    );
  });

  void it('is stable for a relative date range left on its default', () => {
    const ranged = defineWidget({
      key: 'r',
      title: 'R',
      kind: 'TEXT',
      options: [
        { type: 'dateRange', key: 'period', label: 'P', default: 'last30' },
      ],
    });
    const values = resolveOptionValues(ranged, undefined, { now: NOW });
    assert.equal(optionsCacheSuffix(ranged, values, { now: NOW }), '');
  });
});

void describe('applyClientOptions', () => {
  const sortOption: WidgetOption = {
    type: 'sort',
    key: 'sort',
    label: 'Sort',
    columns: [
      { key: 'c0', label: 'Name' },
      { key: 'c1', label: 'Sold' },
    ],
    default: 'c1:desc',
    apply: 'client',
  };
  const columnsOption: WidgetOption = {
    type: 'columns',
    key: 'columns',
    label: 'Columns',
    columns: [
      { key: 'c0', label: 'Name' },
      { key: 'c1', label: 'Sold' },
      { key: 'c2', label: 'Price' },
    ],
    default: ['c0', 'c1', 'c2'],
    apply: 'client',
  };
  const definition = { options: [sortOption, columnsOption] };
  const apply = (chosen: Record<string, unknown> | undefined, data = table) =>
    applyClientOptions(
      definition,
      data,
      resolveOptionValues(definition, chosen)
    ) as TableWidgetData;

  void it('sorts table rows numerically from value, keeping the footer', () => {
    const sorted = apply(undefined);
    assert.deepEqual(names(sorted), ['Gauge', 'Vise', 'Jig']);
    assert.equal(sorted.footer, 'and 9 more');
    assert.deepEqual(names(apply({ sort: 'c1:asc' })), [
      'Jig',
      'Vise',
      'Gauge',
    ]);
    assert.deepEqual(names(apply({ sort: 'c0:asc' })), [
      'Gauge',
      'Jig',
      'Vise',
    ]);
  });

  void it('trims and reorders columns, after sorting by a hidden one', () => {
    const result = apply({ sort: 'c1:desc', columns: ['c2', 'c0'] });
    assert.deepEqual(
      result.columns.map((c) => c.label),
      ['Price', 'Name']
    );
    assert.deepEqual(
      result.rows.map((row) => row.map((cell) => cell.text)),
      [
        ['$2', 'Gauge'],
        ['$3', 'Vise'],
        ['$1', 'Jig'],
      ]
    );
  });

  void it('ignores a sort column the table does not have', () => {
    const narrow: TableWidgetData = {
      ...table,
      columns: table.columns.slice(0, 1),
      rows: table.rows.map((row) => row.slice(0, 1)),
    };
    assert.deepEqual(names(apply({ sort: 'c1:desc' }, narrow)), names(narrow));
  });

  void it('sorts a bar list by value or label', () => {
    const barDefinition = {
      options: [
        {
          type: 'sort',
          key: 'sort',
          label: 'Sort',
          columns: [
            { key: 'label', label: 'Name' },
            { key: 'value', label: 'Value' },
          ],
          apply: 'client',
        } as WidgetOption,
      ],
    };
    const bars = {
      kind: 'BAR_LIST' as const,
      items: [
        { label: 'b', value: 2 },
        { label: 'a', value: 9 },
        { label: 'c', value: 5 },
      ],
    };
    const labels = (chosen: string): string[] =>
      (
        applyClientOptions(
          barDefinition,
          bars,
          resolveOptionValues(barDefinition, { sort: chosen })
        ) as typeof bars
      ).items.map((item) => item.label);
    assert.deepEqual(labels('value:desc'), ['a', 'c', 'b']);
    assert.deepEqual(labels('label:asc'), ['a', 'b', 'c']);
  });

  void it('leaves other payloads and provider-applied options alone', () => {
    const kpi = { kind: 'TEXT' as const, value: 'x', label: 'x' };
    assert.equal(applyClientOptions(definition, kpi, { sort: 'c1:desc' }), kpi);
    const providerSide = {
      options: [{ ...sortOption, apply: 'provider' }] as WidgetOption[],
    };
    assert.equal(
      applyClientOptions(providerSide, table, { sort: 'c1:desc' }),
      table
    );
  });
});

void describe('validateWidgetDefinition options', () => {
  const base = { key: 'top', title: 'Top', kind: 'TABLE' } as const;
  const error = (options: unknown, kind: string = 'TABLE'): string => {
    const result = validateWidgetDefinition({ ...base, kind, options });
    assert.equal(result.ok, false, JSON.stringify(options));
    return result.ok ? '' : result.error;
  };

  void it('accepts every option type', () => {
    const result = validateWidgetDefinition({
      ...base,
      options: [
        limit,
        metric,
        { type: 'boolean', key: 'refunds', label: 'R', default: true },
        { type: 'text', key: 'q', label: 'Q', maxLength: 20, default: '' },
        { type: 'color', key: 'accent', label: 'A', default: '#aabbcc' },
        {
          type: 'dateRange',
          key: 'period',
          label: 'P',
          presets: [{ value: 'last7', label: '7' }],
          default: 'last7',
        },
        {
          type: 'sort',
          key: 'sort',
          label: 'S',
          columns: [{ key: 'c1', label: 'Sold' }],
          default: 'c1:desc',
          apply: 'client',
        },
        {
          type: 'columns',
          key: 'columns',
          label: 'C',
          columns: [
            { key: 'c0', label: 'N' },
            { key: 'c1', label: 'S' },
          ],
          default: ['c0'],
        },
      ],
    });
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  void it('names the path and the allowed values', () => {
    assert.match(
      error([metric, { ...metric, key: 'm2', default: 'profit' }]),
      /options\[1\]\.default must be one of "units", "revenue", got "profit"\./
    );
  });

  void it('checks keys, types and the list itself', () => {
    assert.match(error('x'), /options must be an array, got string\./);
    assert.match(error([3]), /options\[0\] must be an object, got number\./);
    assert.match(
      error([{ type: 'nope' }]),
      /options\[0\]\.type must be one of "choice"/
    );
    assert.match(
      error([{ ...metric, key: '1bad' }]),
      /options\[0\]\.key must be letters/
    );
    assert.match(
      error([metric, metric]),
      /options\[1\]\.key "metric" is used by another option\./
    );
    assert.match(
      error(
        Array.from({ length: 21 }, (_, i) => ({ ...metric, key: `m${i}` }))
      ),
      /lists 21 options; the most a widget may declare is 20\./
    );
  });

  void it('checks choices and numbers', () => {
    assert.match(
      error([{ ...metric, choices: [] }]),
      /options\[0\]\.choices must be a non-empty array/
    );
    assert.match(
      error([
        {
          ...metric,
          choices: [
            { value: 'a', label: 'A' },
            { value: 'a', label: 'B' },
          ],
          default: 'a',
        },
      ]),
      /choices\[1\]\.value "a" is used twice\./
    );
    assert.match(
      error([{ ...limit, default: 70 }]),
      /default \(70\) must be between min \(5\) and max \(50\)\./
    );
    assert.match(
      error([{ ...limit, default: 12 }]),
      /must be 5 plus a whole number of steps of 5\./
    );
    assert.match(
      error([{ ...limit, min: 9, max: 3 }]),
      /min \(9\) must not be more than max \(3\)\./
    );
    assert.match(
      error([{ ...limit, step: 0 }]),
      /step must be a number above 0/
    );
  });

  void it('checks text, colors and date ranges', () => {
    const text = {
      type: 'text',
      key: 'q',
      label: 'Q',
      maxLength: 3,
      default: '',
    };
    assert.match(
      error([{ ...text, default: 'abcd' }]),
      /default is 4 characters; maxLength is 3\./
    );
    assert.match(
      error([{ ...text, maxLength: 900 }]),
      /maxLength must be a whole number from 1 to 500/
    );
    assert.match(
      error([{ type: 'color', key: 'c', label: 'C', default: 'blue' }]),
      /default must be a color like "#1c5cab", got "blue"\./
    );
    assert.match(
      error([
        { type: 'dateRange', key: 'p', label: 'P', default: 'last-week' },
      ]),
      /default must be one of "today"/
    );
    assert.match(
      error([
        {
          type: 'dateRange',
          key: 'p',
          label: 'P',
          presets: [{ value: 'last7', label: '7' }],
          default: 'last30',
        },
      ]),
      /default must be one of "last7" or an interval/
    );
  });

  void it('checks sort and columns options against the kind', () => {
    const sort = {
      type: 'sort',
      key: 'sort',
      label: 'S',
      columns: [{ key: 'c1', label: 'Sold' }],
    };
    assert.match(
      error([sort], 'KPI'),
      /is a sort option, which only applies to TABLE and BAR_LIST widgets, but kind is "KPI"\./
    );
    assert.match(
      error(
        [
          {
            type: 'columns',
            key: 'c',
            label: 'C',
            columns: [{ key: 'label', label: 'L' }],
            default: ['label'],
          },
        ],
        'BAR_LIST'
      ),
      /columns option, which only applies to TABLE widgets/
    );
    assert.match(
      error([sort, { ...sort, key: 'other' }]),
      /is a second sort option; a widget has at most one\./
    );
    assert.match(
      error([{ ...sort, columns: [{ key: 'label', label: 'L' }] }]),
      /columns\[0\]\.key "label" is not a column of a TABLE widget \("c0", "c1", \.\.\.\)\./
    );
    assert.match(
      error([{ ...sort, default: 'c1:up' }]),
      /default must look like "c1:desc"/
    );
    assert.match(
      error([{ ...sort, default: 'c2:asc' }]),
      /default must be one of "c1", got "c2"\./
    );
    assert.match(
      error([{ ...sort, apply: 'both' }]),
      /apply must be one of "provider", "client"/
    );
    assert.match(
      error([
        {
          type: 'columns',
          key: 'c',
          label: 'C',
          columns: [{ key: 'c0', label: 'N' }],
          default: ['c0', 'c0'],
        },
      ]),
      /default lists "c0" twice\./
    );
    assert.match(
      error([
        {
          type: 'columns',
          key: 'c',
          label: 'C',
          columns: [{ key: 'c0', label: 'N' }],
          default: ['c3'],
        },
      ]),
      /default has "c3", which is not one of the columns/
    );
    const barSort = validateWidgetDefinition({
      key: 'b',
      title: 'B',
      kind: 'BAR_LIST',
      options: [
        {
          type: 'sort',
          key: 'sort',
          label: 'S',
          columns: [{ key: 'value', label: 'V' }],
          default: 'value:desc',
        },
      ],
    });
    assert.ok(barSort.ok);
  });
});

void describe('options reach providers and widgets', () => {
  const definition = defineWidget({
    key: 'top',
    title: 'Top',
    kind: 'TABLE',
    options: [
      limit,
      {
        type: 'sort',
        key: 'sort',
        label: 'Sort',
        columns: [{ key: 'c1', label: 'Sold' }],
        default: 'c1:desc',
        apply: 'client',
      },
    ],
  });
  const plain = defineWidget({ key: 'plain', title: 'Plain', kind: 'TEXT' });
  const payload = (): WidgetPayload => table;

  void it('hands the resolved options to the provider and records them on the widget', async () => {
    const seen: ProviderOptions['options'][] = [];
    const providers: WidgetProviders = {
      top: (_context, _definition, options) => {
        seen.push(options.options);
        return payload();
      },
      plain: (_context, _definition, options) => {
        seen.push(options.options);
        return { kind: 'TEXT', value: 'x', label: 'x' };
      },
    };
    const [top, plainWidget] = await resolveWidgets(
      [definition, plain],
      providers,
      {},
      { optionValues: { top: { limit: 25, junk: 1 } } }
    );
    assert.deepEqual(seen[0], { limit: 25, sort: 'c1:desc' });
    assert.deepEqual(seen[1], {});
    assert.deepEqual(top?.status === 'ok' ? top.options : undefined, {
      limit: 25,
      sort: 'c1:desc',
    });
    // The client-applied sort ran on the way out.
    assert.deepEqual(
      top?.status === 'ok' ? names(top.data as TableWidgetData) : [],
      ['Gauge', 'Vise', 'Jig']
    );
    // A widget with no options is unchanged: no `options` field at all.
    assert.equal('options' in (plainWidget as object), false);
  });

  void it('stores and finds cached payloads under the option-aware key', async () => {
    const stored: string[] = [];
    const cache: WidgetCache = {
      get: () => undefined,
      set: (key: string, _entry: CachedPayload) => {
        stored.push(key);
      },
    };
    const providers: WidgetProviders = { top: payload };
    await resolveWidgets([definition], providers, {}, { cache });
    await resolveWidgets(
      [definition],
      providers,
      {},
      { cache, optionValues: { top: { limit: 25 } } }
    );
    assert.deepEqual(stored, ['top', 'top?limit=25']);
  });
});

void describe('loader setOptions', () => {
  const definition = defineWidget({
    key: 'top',
    title: 'Top',
    kind: 'TABLE',
    options: [
      limit,
      {
        type: 'sort',
        key: 'sort',
        label: 'Sort',
        columns: [{ key: 'c1', label: 'Sold' }],
        default: 'c1:desc',
        apply: 'client',
      },
    ],
  });
  const other = defineWidget({ key: 'other', title: 'Other', kind: 'TEXT' });

  function setup(extra: { cache?: WidgetCache } = {}) {
    const calls: { key: string; options: ProviderOptions['options'] }[] = [];
    const providers: WidgetProviders = {
      top: (_context, _definition, options) => {
        calls.push({ key: 'top', options: options.options });
        return table;
      },
      other: (_context, _definition, options) => {
        calls.push({ key: 'other', options: options.options });
        return { kind: 'TEXT', value: 'x', label: 'x' };
      },
    };
    const loader = createWidgetLoader({
      definitions: [definition, other],
      providers,
      context: {},
      ...extra,
    });
    const find = (key: string): DashboardWidget | undefined =>
      loader.getSnapshot().find((w) => w.definition.key === key);
    return { loader, calls, find };
  }
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

  void it('reloads only the widget whose provider-facing choice changed', async () => {
    const { loader, calls, find } = setup();
    loader.loadAll();
    await settle();
    assert.equal(calls.length, 2);
    loader.setOptions('top', { limit: 25 });
    const during = find('top');
    assert.equal(during?.status === 'ok' && during.stale, true);
    await settle();
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2], {
      key: 'top',
      options: { limit: 25, sort: 'c1:desc' },
    });
    const after = find('top');
    assert.equal(after?.status === 'ok' && after.stale, undefined);
    assert.deepEqual(after?.status === 'ok' ? after.options : undefined, {
      limit: 25,
      sort: 'c1:desc',
    });
    loader.dispose();
  });

  void it('re-sorts without asking the provider when only a client option changed', async () => {
    const { loader, calls, find } = setup();
    loader.loadAll();
    await settle();
    loader.setOptions('top', { sort: 'c1:asc' });
    assert.equal(calls.length, 2);
    const widget = find('top');
    assert.deepEqual(
      widget?.status === 'ok' ? names(widget.data as TableWidgetData) : [],
      ['Jig', 'Vise', 'Gauge']
    );
    loader.dispose();
  });

  void it('does nothing when the resolved values stay the same', async () => {
    const { loader, calls } = setup();
    loader.loadAll();
    await settle();
    loader.setOptions('top', { limit: 10 }); // the default
    loader.setOptions('top', { limit: 999 }); // invalid: ignored
    loader.setOptions('other', { anything: 1 }); // declares no options
    loader.setOptions('missing', { limit: 5 });
    await settle();
    assert.equal(calls.length, 2);
    loader.dispose();
  });

  void it('uses the choice when a widget that has not started loads later', async () => {
    const { loader, calls } = setup();
    loader.setOptions('top', { limit: 40 });
    assert.equal(calls.length, 0);
    loader.load('top');
    await settle();
    assert.deepEqual(calls[0]?.options, { limit: 40, sort: 'c1:desc' });
    loader.dispose();
  });

  void it('starts from the options it was created with', async () => {
    const calls: unknown[] = [];
    const loader = createWidgetLoader({
      definitions: [definition],
      providers: {
        top: (_c, _d, options) => {
          calls.push(options.options);
          return table;
        },
      },
      context: {},
      optionValues: { top: { limit: 30 } },
    });
    loader.loadAll();
    await settle();
    assert.deepEqual(calls, [{ limit: 30, sort: 'c1:desc' }]);
    loader.dispose();
  });

  void it('shows an earlier answer for the same choices from the cache while reloading', async () => {
    const entries = new Map<string, CachedPayload>();
    const cache: WidgetCache = {
      get: (key) => entries.get(key),
      set: (key, entry) => {
        entries.set(key, entry);
      },
    };
    const { loader, calls, find } = setup({ cache });
    loader.loadAll();
    await settle();
    loader.setOptions('top', { limit: 25 });
    await settle();
    assert.deepEqual([...entries.keys()].sort(), [
      'other',
      'top',
      'top?limit=25',
    ]);
    loader.setOptions('top', { limit: 10 });
    assert.equal(calls.length, 3);
    await settle();
    assert.equal(calls.length, 4);
    assert.equal(find('top')?.status, 'ok');
    loader.dispose();
  });

  void it('ignores setOptions after dispose', async () => {
    const { loader, calls } = setup();
    loader.loadAll();
    await settle();
    loader.dispose();
    loader.setOptions('top', { limit: 25 });
    await settle();
    assert.equal(calls.length, 2);
  });
});
