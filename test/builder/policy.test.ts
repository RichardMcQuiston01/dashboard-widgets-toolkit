import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addView,
  defineBuilderPolicy,
  defineSource,
  editableFields,
  exposeOption,
  newWidget,
  optionsLeft,
  parseViewerDefinitions,
  serializeDefinitions,
  updateWidget,
  validateBuilderPolicy,
  validateViewerSave,
  viewerSources,
  viewerWidgetKey,
  viewsLeft,
  type BuilderPolicy,
  type SourceDescription,
} from '../../src/builder/index.js';
import type { WidgetDefinition } from '../../src/core/definition.js';

const products: SourceDescription = defineSource({
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
    { key: 'strict', type: 'boolean', label: 'Strict', default: false },
  ],
  detail: true,
});
const countries: SourceDescription = defineSource({
  key: 'countries',
  label: 'Countries',
  kind: 'BAR_LIST',
  filters: ['period'],
});
const secret: SourceDescription = defineSource({
  key: 'secret',
  label: 'Secret',
  kind: 'KPI',
});
const sources: readonly SourceDescription[] = [products, countries, secret];

const policy: BuilderPolicy = defineBuilderPolicy({
  sources: ['products', 'countries'],
  maxWidgets: 2,
  keyPrefix: 'u-8f3a-',
});

function made(
  source: SourceDescription = products,
  key = 'u-8f3a-mine'
): WidgetDefinition {
  const result = newWidget(source, { key, title: 'Mine' });
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value;
}

function save(
  submitted: unknown,
  extra: Partial<Parameters<typeof validateViewerSave>[0]> = {}
): ReturnType<typeof validateViewerSave> {
  return validateViewerSave({
    policy,
    sources,
    submitted,
    owned: [],
    ...extra,
  });
}

void describe('defineBuilderPolicy', () => {
  it('accepts a coherent policy and exposes the defaults', () => {
    assert.ok(validateBuilderPolicy(policy).ok);
    assert.deepEqual(editableFields(policy), [
      'title',
      'description',
      'width',
      'defaultView',
    ]);
  });

  it('names every problem and throws from defineBuilderPolicy', () => {
    const bad = validateBuilderPolicy({
      sources: ['a', 'a', ' '],
      maxWidgets: -1,
      keyPrefix: 'no spaces',
      editable: ['title', 'key' as never, 'title'],
      maxOptions: 99,
      maxViews: 99,
      maxSize: 10,
    });
    assert.ok(!bad.ok);
    for (const part of [
      'sources must list',
      'maxWidgets',
      'keyPrefix',
      'editable names "key"',
      'editable lists a field twice',
      'maxOptions',
      'maxViews',
      'maxSize',
    ]) {
      assert.match(bad.error, new RegExp(part), part);
    }
    assert.throws(
      () => defineBuilderPolicy({ sources: [], maxWidgets: 1, keyPrefix: '!' }),
      /keyPrefix/
    );
  });

  it('requires the prefix to end in a separator, so prefixes never overlap', () => {
    const bad = validateBuilderPolicy({
      sources: [],
      maxWidgets: 1,
      keyPrefix: 'u1',
    });
    assert.ok(!bad.ok);
    assert.match(bad.error, /must end with/);
    assert.ok(
      validateBuilderPolicy({ sources: [], maxWidgets: 1, keyPrefix: 'u-1-' })
        .ok
    );
    const user1 = defineBuilderPolicy({
      sources: ['products'],
      maxWidgets: 5,
      keyPrefix: 'u-1-',
    });
    const other = made(products, 'u-12-mine');
    const result = validateViewerSave({
      policy: user1,
      sources,
      submitted: other,
      owned: [],
    });
    assert.ok(!result.ok);
    assert.match(result.error, /key must start with "u-1-"/);
  });

  it('allows a policy with no sources: it allows none', () => {
    const none = defineBuilderPolicy({
      sources: [],
      maxWidgets: 1,
      keyPrefix: 'u-1-',
    });
    assert.deepEqual(viewerSources(none, sources), []);
  });
});

void describe('viewerSources and viewerWidgetKey', () => {
  it('offers only listed and registered sources', () => {
    assert.deepEqual(
      viewerSources(policy, sources).map((s) => s.key),
      ['products', 'countries']
    );
    const unknown = { ...policy, sources: ['gone', 'products'] };
    assert.deepEqual(
      viewerSources(unknown, sources).map((s) => s.key),
      ['products']
    );
  });

  it('prefixes, cleans, numbers and keeps keys valid', () => {
    assert.equal(
      viewerWidgetKey(policy, 'Top Sellers!', []),
      'u-8f3a-top-sellers-'
    );
    assert.equal(
      viewerWidgetKey(policy, 'mine', ['u-8f3a-mine']),
      'u-8f3a-mine-2'
    );
    assert.equal(viewerWidgetKey(policy, '   ', []), 'u-8f3a-widget');
    const long = viewerWidgetKey(policy, 'x'.repeat(200), []);
    assert.ok(long.length <= 64, String(long.length));
    const widget = newWidget(products, { key: long, title: 'T' });
    assert.ok(widget.ok);
  });
});

void describe('validateViewerSave: a new widget', () => {
  it('accepts a widget over an allowed source with the prefix', () => {
    const result = save(made());
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  it('refuses anything that is not a definition', () => {
    assert.ok(!save('nope').ok);
    assert.ok(
      !save({
        key: 'u-8f3a-x',
        title: 'T',
        kind: 'TABLE',
        source: 'products',
        width: 99,
      }).ok
    );
  });

  it('refuses an unregistered source, and one the policy does not list', () => {
    const missing = save({
      key: 'u-8f3a-x',
      title: 'T',
      kind: 'TABLE',
      source: 'gone',
    });
    assert.ok(!missing.ok);
    assert.match(missing.error, /source "gone" is not registered/);
    const denied = save(made(secret, 'u-8f3a-s'));
    assert.ok(!denied.ok);
    assert.match(
      denied.error,
      /source "secret" is not one this viewer may build on/
    );
  });

  it('refuses a widget the source would refuse', () => {
    const wide = { ...made(), kind: 'GRAPH' };
    const result = save(wide);
    assert.ok(!result.ok);
    assert.match(result.error, /kind must be TABLE/);
  });

  it('refuses a key without the prefix, or only the prefix', () => {
    const other = save(made(products, 'someone-elses'));
    assert.ok(!other.ok);
    assert.match(other.error, /key must start with "u-8f3a-"/);
    const bare = save(made(products, 'u-8f3a-'));
    assert.ok(!bare.ok);
  });

  it('enforces the quota and a repeated key', () => {
    const a = made(products, 'u-8f3a-a');
    const b = made(products, 'u-8f3a-b');
    assert.ok(save(made(products, 'u-8f3a-c'), { owned: [a] }).ok);
    const full = save(made(products, 'u-8f3a-c'), { owned: [a, b] });
    assert.ok(!full.ok);
    assert.match(full.error, /already owns 2 widget\(s\); the most is 2/);
    const again = save(made(products, 'u-8f3a-a'), { owned: [a] });
    assert.ok(!again.ok);
    assert.match(again.error, /already exists/);
  });

  it('refuses fields outside editable, naming them', () => {
    for (const patch of [
      { roles: ['admin'] },
      { locked: true },
      { active: false },
      { sortOrder: -100 },
      { page: 'home' },
      { fill: 'both' },
      { detail: true },
    ]) {
      const result = save({ ...made(), ...patch });
      assert.ok(!result.ok, JSON.stringify(patch));
      assert.match(
        result.error,
        new RegExp(`${Object.keys(patch)[0]} is not a field`)
      );
    }
    assert.ok(save({ ...made(), description: 'Hi', width: 6 }).ok);
  });

  it('allows a field the policy adds to editable', () => {
    const wider = {
      ...policy,
      editable: [...editableFields(policy), 'detail' as const],
    };
    const result = save({ ...made(), detail: true }, { policy: wider });
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  it('accepts the filters newWidget copies from a restricted source', () => {
    const widget = made(countries, 'u-8f3a-c');
    assert.deepEqual(widget.filters, ['period']);
    const result = save(widget);
    assert.ok(result.ok, result.ok ? '' : result.error);
    const changed = save({ ...widget, filters: [] });
    assert.ok(!changed.ok);
    assert.match(changed.error, /filters is not a field/);
  });

  it('enforces the option, view and size limits', () => {
    const tight: BuilderPolicy = {
      ...policy,
      maxOptions: 1,
      maxViews: 0,
      maxSize: 400,
    };
    const one = exposeOption(products, made(), 'limit');
    assert.ok(one.ok);
    assert.ok(save(one.value, { policy: tight }).ok);
    const two = exposeOption(products, one.value, 'strict');
    assert.ok(two.ok);
    const over = save(two.value, { policy: tight });
    assert.ok(!over.ok);
    assert.match(
      over.error,
      /exposes 2 options; the most this viewer may is 1/
    );
    const withView = addView(products, made(), {
      key: 'bars',
      label: 'Bars',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 2 },
    });
    assert.ok(withView.ok);
    const views = save(withView.value, { policy: tight });
    assert.ok(!views.ok);
    assert.match(views.error, /has 1 views; the most this viewer may add is 0/);
    const huge = save(
      { ...made(), description: 'x'.repeat(490) },
      { policy: tight }
    );
    assert.ok(!huge.ok);
    assert.match(huge.error, /characters stored; the most is 400/);
  });
});

void describe('validateViewerSave: an update', () => {
  it('accepts a change to an editable field', () => {
    const previous = made();
    const next = updateWidget(products, previous, {
      title: 'Renamed',
      width: 6,
    });
    assert.ok(next.ok);
    const result = save(next.value, { previous, owned: [previous] });
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  it('keeps the key and the source fixed', () => {
    const previous = made();
    const rekeyed = save(
      { ...previous, key: 'u-8f3a-other' },
      { previous, owned: [previous] }
    );
    assert.ok(!rekeyed.ok);
    assert.match(rekeyed.error, /key cannot change/);
    const moved = save(made(countries, previous.key), {
      previous,
      owned: [previous],
    });
    assert.ok(!moved.ok);
    assert.match(moved.error, /source cannot change/);
  });

  it('lets a value an administrator set survive, and refuses a viewer changing it', () => {
    const adminSet: WidgetDefinition = { ...made(), roles: ['staff'] };
    const edited = { ...adminSet, title: 'Renamed' };
    const kept = save(edited, { previous: adminSet, owned: [adminSet] });
    assert.ok(kept.ok, kept.ok ? '' : kept.error);
    const dropped = save(
      { ...edited, roles: undefined },
      { previous: adminSet, owned: [adminSet] }
    );
    assert.ok(!dropped.ok);
    assert.match(dropped.error, /roles is not a field/);
    const widened = save(
      { ...edited, roles: [] },
      { previous: adminSet, owned: [adminSet] }
    );
    assert.ok(!widened.ok);
  });

  it('does not count the widget against its own quota, nor block an edit over quota', () => {
    const a = made(products, 'u-8f3a-a');
    const b = made(products, 'u-8f3a-b');
    const tightened: BuilderPolicy = { ...policy, maxWidgets: 1 };
    const next = updateWidget(products, a, { title: 'A2' });
    assert.ok(next.ok);
    const result = save(next.value, {
      policy: tightened,
      previous: a,
      owned: [a, b],
    });
    assert.ok(result.ok, result.ok ? '' : result.error);
  });

  it('refuses an uneditable title', () => {
    const noTitle: BuilderPolicy = { ...policy, editable: ['description'] };
    const previous = made();
    const result = save(
      { ...previous, title: 'Hacked' },
      { policy: noTitle, previous, owned: [previous] }
    );
    assert.ok(!result.ok);
    assert.match(result.error, /title is not a field/);
    assert.ok(
      save(made(), { policy: noTitle }).ok,
      'a new widget is still named'
    );
  });
});

void describe('parseViewerDefinitions', () => {
  it('returns allowed rows and skips the others with a reason, keeping admin fields', () => {
    const ok1 = { ...made(products, 'u-8f3a-ok'), roles: ['staff'] };
    const foreign = made(products, 'someone-elses');
    const denied = made(secret, 'u-8f3a-denied');
    const text = serializeDefinitions([ok1, foreign, denied]);
    const parsed = parseViewerDefinitions(text, sources, policy);
    assert.ok(parsed.ok);
    assert.deepEqual(
      parsed.value.definitions.map((d) => d.key),
      ['u-8f3a-ok']
    );
    assert.deepEqual(parsed.value.skipped.map((s) => s.key).sort(), [
      'someone-elses',
      'u-8f3a-denied',
    ]);
    assert.match(
      parsed.value.skipped.find((s) => s.key === 'u-8f3a-denied')?.error ?? '',
      /not one this viewer may build on/
    );
  });

  it('still skips unregistered sources and bad envelopes like parseDefinitions', () => {
    const orphan = {
      key: 'u-8f3a-o',
      title: 'O',
      kind: 'TABLE',
      source: 'removed',
    };
    const text = JSON.stringify({ version: 1, definitions: [orphan] });
    const parsed = parseViewerDefinitions(text, sources, policy);
    assert.ok(parsed.ok);
    assert.equal(parsed.value.definitions.length, 0);
    assert.match(
      parsed.value.skipped[0]?.error ?? '',
      /"removed" is not registered/
    );
    assert.ok(!parseViewerDefinitions('{nope', sources, policy).ok);
  });

  it('is not tied to the quota: every allowed row comes back', () => {
    const rows = ['a', 'b', 'c'].map((n) => made(products, `u-8f3a-${n}`));
    const parsed = parseViewerDefinitions(
      serializeDefinitions(rows),
      sources,
      policy
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.value.definitions.length, 3);
  });
});

void describe('optionsLeft and viewsLeft', () => {
  it('count what the policy still allows, and are unlimited without one', () => {
    const tight: BuilderPolicy = { ...policy, maxOptions: 2, maxViews: 1 };
    const one = exposeOption(products, made(), 'limit');
    assert.ok(one.ok);
    assert.equal(optionsLeft(tight, made()), 2);
    assert.equal(optionsLeft(tight, one.value), 1);
    assert.equal(viewsLeft(tight, made()), 1);
    assert.equal(optionsLeft(undefined, one.value), Infinity);
    assert.equal(viewsLeft(undefined, one.value), Infinity);
    const zero: BuilderPolicy = { ...policy, maxOptions: 0 };
    assert.equal(optionsLeft(zero, made()), 0);
  });
});
