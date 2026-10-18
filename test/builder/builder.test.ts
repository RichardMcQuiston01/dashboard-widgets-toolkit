import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addView,
  availableViews,
  checkAgainstSource,
  defineSource,
  exposeOption,
  hideOption,
  mergeDefinitions,
  newWidget,
  parseDefinition,
  parseDefinitions,
  removeView,
  serializeDefinition,
  serializeDefinitions,
  uniqueWidgetKey,
  updateWidget,
  validatePatch,
  validateSourceDescription,
  type SourceDescription,
} from '../../src/builder/index.js';
import { withClones } from '../../src/core/clones.js';
import {
  providerKeyOf,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { duplicateWidget } from '../../src/core/duplicate.js';
import { createWidgetLoader } from '../../src/core/loader.js';
import { EMPTY_LAYOUT } from '../../src/core/layout.js';
import { resolveWidgets } from '../../src/core/resolve.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';

const productsSource: SourceDescription = defineSource({
  key: 'products',
  label: 'Product sales',
  kind: 'TABLE',
  columns: [
    { label: 'Product' },
    { label: 'Sold', numeric: true },
    { label: 'Revenue', numeric: true },
  ],
  options: [
    {
      key: 'limit',
      type: 'number',
      label: 'Rows',
      min: 3,
      max: 20,
      default: 5,
    },
    {
      key: 'order',
      type: 'sort',
      label: 'Order by',
      apply: 'client',
      columns: [
        { key: 'c1', label: 'Sold' },
        { key: 'c2', label: 'Revenue' },
      ],
      default: 'c2:desc',
    },
  ],
  views: [{ key: 'trend', label: 'Trend', kind: 'GRAPH' }],
  detail: { mode: 'client' },
});

function made(): WidgetDefinition {
  const result = newWidget(productsSource, {
    key: 'top-products',
    title: 'Top products',
  });
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value;
}

void describe('providerKeyOf', () => {
  it('prefers source, then sourceKey, then key', () => {
    assert.equal(providerKeyOf({ key: 'a' }), 'a');
    assert.equal(providerKeyOf({ key: 'a', sourceKey: 'b' }), 'b');
    assert.equal(providerKeyOf({ key: 'a', source: 'c' }), 'c');
    assert.equal(providerKeyOf({ key: 'a', sourceKey: 'b', source: 'c' }), 'c');
  });

  it('loads a builder widget, and a clone of one, through the source provider', async () => {
    const definition: WidgetDefinition = { ...made(), key: 'best' };
    const layout = { clones: [{ key: 'best-2', from: 'best' }] };
    const all = withClones([definition], layout);
    assert.equal(all.length, 2);
    assert.equal(all[1]?.sourceKey, 'best');
    assert.equal(all[1]?.source, 'products');
    assert.equal(providerKeyOf(all[1] as WidgetDefinition), 'products');
    const providers = {
      products: () => ({
        kind: 'TABLE' as const,
        columns: [{ label: 'Product' }],
        rows: [[{ text: 'Mug' }]],
      }),
    };
    const resolved = await resolveWidgets(all, providers, { roles: [] });
    assert.deepEqual(
      resolved.map((w) => w.status),
      ['ok', 'ok']
    );
    const loader = createWidgetLoader({
      definitions: all,
      providers,
      context: { roles: [] },
    });
    loader.loadAll();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(
      loader.getSnapshot().map((w) => w.status),
      ['ok', 'ok']
    );
    loader.dispose();
  });

  it('can duplicate a builder widget, which is not itself a clone', () => {
    const result = duplicateWidget([made()], EMPTY_LAYOUT, 'top-products');
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  it('is unchanged for definitions without source', () => {
    const result = validateWidgetDefinition({
      key: 'a',
      title: 'A',
      kind: 'TEXT',
    });
    assert.ok(result.ok);
    assert.equal(
      validateWidgetDefinition({
        key: 'a',
        title: 'A',
        kind: 'TEXT',
        source: '',
      }).ok,
      false
    );
    assert.equal(
      validateWidgetDefinition({
        key: 'a',
        title: 'A',
        kind: 'TEXT',
        source: 3,
      }).ok,
      false
    );
  });
});

void describe('validateSourceDescription / defineSource', () => {
  it('accepts a coherent description', () => {
    assert.ok(validateSourceDescription(productsSource).ok);
  });

  it('refuses sort columns past the listed columns, and a missing columns list', () => {
    const past = validateSourceDescription({
      ...productsSource,
      columns: [{ label: 'Product' }, { label: 'Sold', numeric: true }],
    });
    assert.ok(!past.ok);
    assert.match(past.error, /column c2 is past the 2 column/);
    const { columns: _columns, ...noColumns } = productsSource;
    const missing = validateSourceDescription(noColumns);
    assert.ok(!missing.ok);
    assert.match(missing.error, /needs "columns"/);
  });

  it('refuses reserved and duplicate view keys, and bad option defaults', () => {
    const views = validateSourceDescription({
      ...productsSource,
      views: [
        { key: 'base', label: 'B', kind: 'TABLE' },
        { key: 'x', label: 'X', kind: 'GRAPH' },
        { key: 'x', label: 'X2', kind: 'GRAPH' },
      ],
    });
    assert.ok(!views.ok);
    assert.match(views.error, /reserved/);
    assert.match(views.error, /used twice/);
    const badDefault = validateSourceDescription({
      ...productsSource,
      options: [
        {
          key: 'limit',
          type: 'number',
          label: 'Rows',
          min: 3,
          max: 20,
          default: 99,
        },
      ],
    });
    assert.ok(!badDefault.ok);
  });

  it('throws from defineSource for a bad description', () => {
    assert.throws(
      () => defineSource({ key: '', label: 'x', kind: 'TEXT' }),
      /key must be a non-empty string/
    );
  });
});

void describe('newWidget', () => {
  it('starts a valid definition over the source', () => {
    const widget = made();
    assert.equal(widget.kind, 'TABLE');
    assert.equal(widget.source, 'products');
    assert.ok(validateWidgetDefinition(widget).ok);
  });

  it('refuses a bad key and an empty title with a specific message', () => {
    const badKey = newWidget(productsSource, { key: 'no spaces', title: 'T' });
    assert.ok(!badKey.ok);
    assert.match(badKey.error, /"no spaces"/);
    const badTitle = newWidget(productsSource, { key: 'ok', title: '  ' });
    assert.ok(!badTitle.ok);
    assert.match(badTitle.error, /title must not be empty/);
  });

  it('copies a restricted filter list so an absent list never means "all"', () => {
    const source = defineSource({
      key: 's',
      label: 'S',
      kind: 'KPI',
      filters: ['period'],
    });
    const widget = newWidget(source, { key: 'w', title: 'W' });
    assert.ok(widget.ok);
    assert.deepEqual(widget.value.filters, ['period']);
  });
});

void describe('uniqueWidgetKey', () => {
  it('cleans the base and numbers clashes', () => {
    assert.equal(uniqueWidgetKey('Top Products!', []), 'Top-Products-');
    assert.equal(uniqueWidgetKey('a', ['a']), 'a-2');
    assert.equal(uniqueWidgetKey('a', ['a', 'a-2']), 'a-3');
    assert.equal(uniqueWidgetKey('   ', []), 'widget');
  });
});

void describe('updateWidget / validatePatch', () => {
  it('changes plain fields and removes one set to undefined', () => {
    const base = made();
    const changed = updateWidget(productsSource, base, {
      title: 'Best sellers',
      width: 6,
      roles: ['admin'],
      locked: { move: true },
    });
    assert.ok(changed.ok);
    assert.equal(changed.value.title, 'Best sellers');
    assert.equal(changed.value.width, 6);
    const cleared = updateWidget(productsSource, changed.value, {
      width: undefined,
    });
    assert.ok(cleared.ok);
    assert.equal('width' in cleared.value, false);
    assert.equal(base.title, 'Top products', 'input is not mutated');
  });

  it('refuses fields it does not own, naming the field', () => {
    const base = made();
    for (const field of ['key', 'kind', 'source', 'options', 'views']) {
      const result = updateWidget(productsSource, base, {
        [field]: 'x',
      } as never);
      assert.ok(!result.ok, field);
      assert.match(result.error, new RegExp(JSON.stringify(field)));
    }
  });

  it('refuses detail the source does not offer, or in another mode', () => {
    const noDetail = defineSource({ key: 'k', label: 'K', kind: 'TABLE' });
    const base = newWidget(noDetail, { key: 'w', title: 'W' });
    assert.ok(base.ok);
    const on = updateWidget(noDetail, base.value, { detail: true });
    assert.ok(!on.ok);
    assert.match(on.error, /offers no detail view/);
    const wrongMode = updateWidget(productsSource, made(), {
      detail: { mode: 'server' },
    });
    assert.ok(!wrongMode.ok);
    assert.match(wrongMode.error, /detail.mode must be "client"/);
    assert.ok(updateWidget(productsSource, made(), { detail: true }).ok);
  });

  it('refuses filters the source does not use', () => {
    const source = defineSource({
      key: 's',
      label: 'S',
      kind: 'KPI',
      filters: ['period'],
    });
    const base = newWidget(source, { key: 'w', title: 'W' });
    assert.ok(base.ok);
    const bad = updateWidget(source, base.value, {
      filters: ['period', 'store'],
    });
    assert.ok(!bad.ok);
    assert.match(bad.error, /"store", which the source does not use/);
    const all = updateWidget(source, base.value, { filters: undefined });
    assert.ok(!all.ok);
    assert.match(all.error, /filters must be set/);
  });

  it('reports each bad field apart, and a cross-field problem under ""', () => {
    const base = made();
    const bad = validatePatch(productsSource, base, {
      title: '',
      width: 99,
      description: 'ok',
    });
    assert.deepEqual(Object.keys(bad).sort(), ['title', 'width']);
    assert.deepEqual(
      validatePatch(productsSource, base, { title: 'Fine' }),
      {}
    );
    const cross = validatePatch(productsSource, base, {
      minWidth: 8,
      maxWidth: 4,
    });
    assert.deepEqual(Object.keys(cross), ['']);
  });

  it('bounds the title and description', () => {
    const base = made();
    const long = updateWidget(productsSource, base, { title: 'x'.repeat(81) });
    assert.ok(!long.ok);
    assert.match(long.error, /title is 81 characters; the most is 80/);
    const description = updateWidget(productsSource, base, {
      description: 'x'.repeat(501),
    });
    assert.ok(!description.ok);
  });
});

void describe('options', () => {
  it('exposes a template with its default, a label and a default override', () => {
    const plain = exposeOption(productsSource, made(), 'limit');
    assert.ok(plain.ok);
    assert.equal(plain.value.options?.[0]?.default, 5);
    const custom = exposeOption(productsSource, made(), 'limit', {
      label: 'How many',
      default: 10,
    });
    assert.ok(custom.ok);
    assert.equal(custom.value.options?.[0]?.label, 'How many');
    assert.equal(custom.value.options?.[0]?.default, 10);
  });

  it('refuses unknown, repeated and out-of-bounds exposures', () => {
    const unknown = exposeOption(productsSource, made(), 'nope');
    assert.ok(!unknown.ok);
    assert.match(
      unknown.error,
      /offers no option "nope" \(it offers "limit", "order"\)/
    );
    const once = exposeOption(productsSource, made(), 'limit');
    assert.ok(once.ok);
    const twice = exposeOption(productsSource, once.value, 'limit');
    assert.ok(!twice.ok);
    assert.match(twice.error, /already exposed/);
    const bounds = exposeOption(productsSource, made(), 'limit', {
      default: 50,
    });
    assert.ok(!bounds.ok);
    assert.match(bounds.error, /not a valid default/);
    const sort = exposeOption(productsSource, made(), 'order', {
      default: 'c9:asc',
    });
    assert.ok(!sort.ok);
  });

  it('hides an option, dropping the list when it empties', () => {
    const exposed = exposeOption(productsSource, made(), 'limit');
    assert.ok(exposed.ok);
    const hidden = hideOption(exposed.value, 'limit');
    assert.equal('options' in hidden, false);
    assert.equal(hideOption(hidden, 'limit'), hidden);
  });

  it('checkAgainstSource refuses a widened option', () => {
    const base = made();
    const widen = (option: object): ReturnType<typeof checkAgainstSource> =>
      checkAgainstSource(productsSource, {
        ...base,
        options: [option],
      } as unknown as WidgetDefinition);
    const range = widen({
      key: 'limit',
      type: 'number',
      label: 'Rows',
      min: 1,
      max: 20,
      default: 5,
    });
    assert.ok(!range.ok);
    assert.match(range.error, /outside the source's 3 to 20/);
    const type = widen({
      key: 'limit',
      type: 'boolean',
      label: 'R',
      default: true,
    });
    assert.ok(!type.ok);
    assert.match(type.error, /is a boolean option but the source's is number/);
    const apply = widen({
      key: 'order',
      type: 'sort',
      label: 'O',
      apply: 'provider',
      columns: [{ key: 'c1', label: 'Sold' }],
      default: 'c1:asc',
    });
    assert.ok(!apply.ok);
    assert.match(
      apply.error,
      /applies "provider" but the source applies "client"/
    );
    const column = widen({
      key: 'order',
      type: 'sort',
      label: 'O',
      apply: 'client',
      columns: [{ key: 'c0', label: 'Product' }],
      default: 'c0:asc',
    });
    assert.ok(!column.ok);
    assert.match(column.error, /"c0", which the source does not offer/);
    const stranger = widen({
      key: 'secret',
      type: 'text',
      label: 'S',
      maxLength: 5,
      default: '',
    });
    assert.ok(!stranger.ok);
    assert.match(stranger.error, /not one the source offers/);
  });
});

void describe('views', () => {
  it('lists the source views and the conversions its columns allow', () => {
    const choices = availableViews(productsSource, made());
    const keys = choices.map((c) => c.key);
    assert.deepEqual(keys, [
      'trend',
      'bars-0-1',
      'bars-0-2',
      'bar-chart-0',
      'line-chart-0',
    ]);
    const bars = choices.find((c) => c.key === 'bars-0-2');
    assert.equal(bars?.label, 'Revenue by Product (bars)');
    assert.equal(bars?.kind, 'BAR_LIST');
  });

  it('every offered view can be added, and none is offered twice', () => {
    let widget = made();
    for (const choice of availableViews(productsSource, widget)) {
      const added = addView(productsSource, widget, choice.view);
      assert.ok(added.ok, added.ok ? '' : added.error);
      widget = added.value;
    }
    assert.deepEqual(availableViews(productsSource, widget), []);
  });

  it('offers conversions per kind', () => {
    const bars = defineSource({ key: 'b', label: 'B', kind: 'BAR_LIST' });
    assert.deepEqual(
      availableViews(bars, { key: 'w', title: 'W', kind: 'BAR_LIST' }).map(
        (c) => c.key
      ),
      ['table', 'bar-chart', 'line-chart']
    );
    const graph = defineSource({ key: 'g', label: 'G', kind: 'GRAPH' });
    assert.deepEqual(
      availableViews(graph, { key: 'w', title: 'W', kind: 'GRAPH' }).map(
        (c) => c.key
      ),
      ['table']
    );
    const kpi = defineSource({ key: 'k', label: 'K', kind: 'KPI' });
    assert.deepEqual(
      availableViews(kpi, { key: 'w', title: 'W', kind: 'KPI' }),
      []
    );
  });

  it('refuses a view the source cannot serve, or on a non-numeric column', () => {
    const base = made();
    const stranger = addView(productsSource, base, {
      key: 'other',
      label: 'Other',
      kind: 'GRAPH',
    });
    assert.ok(!stranger.ok);
    assert.match(stranger.error, /not a view the source supplies/);
    const wrongKind = addView(productsSource, base, {
      key: 'trend',
      label: 'Trend',
      kind: 'KPI',
    });
    assert.ok(!wrongKind.ok);
    assert.match(wrongKind.error, /is KPI but the source supplies it as GRAPH/);
    const text = addView(productsSource, base, {
      key: 'bars',
      label: 'Bars',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 0 },
    });
    assert.ok(!text.ok);
    assert.match(text.error, /column 0 \(Product\) is not numeric/);
    const range = addView(productsSource, base, {
      key: 'bars',
      label: 'Bars',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 7 },
    });
    assert.ok(!range.ok);
    assert.match(range.error, /value column 7 is not in the source/);
  });

  it('removes a view and clears a default view that named it', () => {
    const added = addView(productsSource, made(), {
      key: 'trend',
      label: 'Trend',
      kind: 'GRAPH',
    });
    assert.ok(added.ok);
    const withDefault = updateWidget(productsSource, added.value, {
      defaultView: 'trend',
    });
    assert.ok(withDefault.ok);
    const removed = removeView(withDefault.value, 'trend');
    assert.equal('views' in removed, false);
    assert.equal('defaultView' in removed, false);
    assert.ok(validateWidgetDefinition(removed).ok);
    assert.equal(removeView(removed, 'trend'), removed);
    const bad = updateWidget(productsSource, made(), { defaultView: 'nope' });
    assert.ok(!bad.ok);
  });
});

void describe('never returns an invalid definition', () => {
  it('holds over a sequence of edits, good and bad', () => {
    let widget = made();
    const steps: ((w: WidgetDefinition) => {
      ok: boolean;
      value?: WidgetDefinition;
    })[] = [
      (w) => exposeOption(productsSource, w, 'limit'),
      (w) => exposeOption(productsSource, w, 'order', { default: 'c1:asc' }),
      (w) => updateWidget(productsSource, w, { width: 1 }),
      (w) => updateWidget(productsSource, w, { width: 6, fill: 'both' }),
      (w) => addView(productsSource, w, { key: 'x', label: 'x', kind: 'KPI' }),
      (w) => ({ ok: true, value: hideOption(w, 'limit') }),
      (w) => updateWidget(productsSource, w, { detail: { mode: 'server' } }),
      (w) => updateWidget(productsSource, w, { tableControls: true }),
      (w) => updateWidget(productsSource, w, { locked: true, roles: ['a'] }),
    ];
    for (const step of steps) {
      const result = step(widget);
      if (result.ok && result.value !== undefined) widget = result.value;
      assert.ok(validateWidgetDefinition(widget).ok);
      assert.ok(checkAgainstSource(productsSource, widget).ok);
    }
    assert.equal(widget.width, 6);
    assert.equal(widget.locked, true);
  });
});

void describe('storing and loading', () => {
  it('round-trips one definition with a stable key order', () => {
    const exposed = exposeOption(productsSource, made(), 'limit');
    assert.ok(exposed.ok);
    const text = serializeDefinition({
      ...exposed.value,
      width: 6,
    } as WidgetDefinition);
    const keys = Object.keys(JSON.parse(text) as object);
    assert.deepEqual(keys, [
      'key',
      'title',
      'kind',
      'source',
      'width',
      'options',
    ]);
    const parsed = parseDefinition(text, [productsSource]);
    assert.ok(parsed.ok);
    assert.equal(parsed.value.source.key, 'products');
    assert.equal(serializeDefinition(parsed.value.definition), text);
  });

  it('refuses bad JSON, an unregistered source and a widened definition', () => {
    const json = parseDefinition('{nope', [productsSource]);
    assert.ok(!json.ok);
    assert.match(json.error, /Not valid JSON/);
    const orphan = parseDefinition(
      JSON.stringify({ key: 'a', title: 'A', kind: 'TABLE', source: 'gone' }),
      [productsSource]
    );
    assert.ok(!orphan.ok);
    assert.match(
      orphan.error,
      /source "gone" is not registered \("products"\)/
    );
    const none = parseDefinition(
      JSON.stringify({ key: 'a', title: 'A', kind: 'TABLE' }),
      [productsSource]
    );
    assert.ok(!none.ok);
    assert.match(none.error, /source must be the key of a registered source/);
    const widened = parseDefinition(
      JSON.stringify({
        key: 'a',
        title: 'A',
        kind: 'TABLE',
        source: 'products',
        detail: { mode: 'server' },
      }),
      [productsSource]
    );
    assert.ok(!widened.ok);
  });

  it('returns valid rows and lists skipped ones with reasons', () => {
    const good = made();
    const text = JSON.stringify({
      version: 1,
      definitions: [
        good,
        { key: 'orphan', title: 'O', kind: 'TABLE', source: 'removed' },
        good,
        'not an object',
      ],
    });
    const parsed = parseDefinitions(text, [productsSource]);
    assert.ok(parsed.ok);
    assert.deepEqual(
      parsed.value.definitions.map((d) => d.key),
      ['top-products']
    );
    assert.deepEqual(
      parsed.value.skipped.map((s) => s.key),
      ['orphan', 'top-products', '#4']
    );
    assert.match(
      parsed.value.skipped[0]?.error ?? '',
      /"removed" is not registered/
    );
    assert.match(parsed.value.skipped[1]?.error ?? '', /appears twice/);
  });

  it('refuses an unknown version or shape for the whole list', () => {
    assert.ok(!parseDefinitions('[]', [productsSource]).ok);
    const version = parseDefinitions('{"version":2,"definitions":[]}', [
      productsSource,
    ]);
    assert.ok(!version.ok);
    assert.match(version.error, /version 2; this code reads version 1/);
    assert.ok(!parseDefinitions('{"version":1}', [productsSource]).ok);
    assert.ok(!parseDefinitions('null', [productsSource]).ok);
  });

  it('serializes a list that parses back unchanged', () => {
    const list = [made(), { ...made(), key: 'other' }];
    const text = serializeDefinitions(list);
    const parsed = parseDefinitions(text, [productsSource]);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value.definitions, list);
    assert.equal(parsed.value.skipped.length, 0);
  });

  it('merges with code winning and reports the clash', () => {
    const code: WidgetDefinition = {
      key: 'sales',
      title: 'Sales',
      kind: 'KPI',
    };
    const merged = mergeDefinitions(
      [code],
      [{ ...made(), key: 'sales' }, made(), made()]
    );
    assert.deepEqual(
      merged.definitions.map((d) => d.key),
      ['sales', 'top-products']
    );
    assert.equal(merged.definitions[0], code);
    assert.deepEqual(
      merged.clashes.map((c) => c.key),
      ['sales', 'top-products']
    );
  });
});

void describe('module boundaries', () => {
  it('keeps the core free of builder imports', () => {
    const coreDir = new URL('../../src/core/', import.meta.url);
    for (const name of readdirSync(coreDir)) {
      const text = readFileSync(new URL(name, coreDir), 'utf8');
      assert.ok(
        !/from '\.\.\/builder/.test(text),
        `${name} imports the builder`
      );
    }
  });
});
