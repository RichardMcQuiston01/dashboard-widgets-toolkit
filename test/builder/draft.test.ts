import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clearDraftField,
  commitDraft,
  defineSource,
  draftCandidate,
  draftProblems,
  exposeOption,
  isDirty,
  newDraft,
  newWidget,
  previewWidget,
  setDraftField,
  updateOption,
  type SourceDescription,
} from '../../src/builder/index.js';
import type { WidgetDefinition } from '../../src/core/definition.js';

const source: SourceDescription = defineSource({
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
  sample: {
    kind: 'TABLE',
    columns: [{ label: 'Product' }, { label: 'Sold' }, { label: 'Revenue' }],
    rows: [
      [{ text: 'Mug' }, { text: '10', value: 10 }, { text: '$50', value: 50 }],
      [{ text: 'Cap' }, { text: '30', value: 30 }, { text: '$20', value: 20 }],
    ],
  },
});

function made(): WidgetDefinition {
  const result = newWidget(source, { key: 'w', title: 'Widget' });
  assert.ok(result.ok);
  return result.value;
}

void describe('draft state', () => {
  it('holds edits as a pending patch and leaves the definition alone', () => {
    let state = newDraft(made());
    assert.equal(isDirty(state), false);
    state = setDraftField(state, 'title', '');
    assert.equal(isDirty(state), true);
    assert.equal(state.definition.title, 'Widget');
    assert.deepEqual(Object.keys(draftProblems(source, state)), ['title']);
    assert.equal(draftCandidate(source, state), state.definition);
  });

  it('shows a valid pending edit in the candidate, and commits it', () => {
    let state = setDraftField(newDraft(made()), 'title', 'Best sellers');
    assert.deepEqual(draftProblems(source, state), {});
    assert.equal(draftCandidate(source, state).title, 'Best sellers');
    const committed = commitDraft(source, state);
    assert.ok(committed.ok);
    assert.equal(committed.value.definition.title, 'Best sellers');
    assert.equal(isDirty(committed.value), false);
    state = clearDraftField(setDraftField(state, 'width', 99), 'width');
    assert.deepEqual(draftProblems(source, state), {});
  });

  it('refuses to commit with problems, naming the fields', () => {
    const state = setDraftField(
      setDraftField(newDraft(made()), 'title', ''),
      'width',
      99
    );
    const committed = commitDraft(source, state);
    assert.ok(!committed.ok);
    assert.match(committed.error, /title:/);
    assert.match(committed.error, /width:/);
    const clean = commitDraft(source, newDraft(made()));
    assert.ok(clean.ok);
  });
});

void describe('updateOption', () => {
  it('changes the label and the default of an exposed option', () => {
    const exposed = exposeOption(source, made(), 'limit');
    assert.ok(exposed.ok);
    const changed = updateOption(source, exposed.value, 'limit', {
      label: 'How many',
      default: 12,
    });
    assert.ok(changed.ok);
    assert.equal(changed.value.options?.[0]?.label, 'How many');
    assert.equal(changed.value.options?.[0]?.default, 12);
  });

  it('refuses unexposed options, empty labels and defaults outside the source', () => {
    const none = updateOption(source, made(), 'limit', { label: 'x' });
    assert.ok(!none.ok);
    assert.match(none.error, /option "limit" is not exposed/);
    const exposed = exposeOption(source, made(), 'limit');
    assert.ok(exposed.ok);
    const empty = updateOption(source, exposed.value, 'limit', { label: ' ' });
    assert.ok(!empty.ok);
    assert.match(empty.error, /label must not be empty/);
    const out = updateOption(source, exposed.value, 'limit', { default: 99 });
    assert.ok(!out.ok);
    assert.match(out.error, /not a valid default/);
  });
});

void describe('previewWidget', () => {
  it('makes an ok widget from the sample', () => {
    const preview = previewWidget(source, made());
    assert.ok(preview.ok);
    assert.equal(preview.value.status, 'ok');
  });

  it('applies a client sort by its default and by chosen values', () => {
    const exposed = exposeOption(source, made(), 'order');
    assert.ok(exposed.ok);
    const rowsOf = (values?: Record<string, string>): string[] => {
      const preview = previewWidget(source, exposed.value, {
        ...(values === undefined ? {} : { optionValues: values }),
      });
      assert.ok(preview.ok);
      assert.equal(preview.value.status, 'ok');
      const data = (
        preview.value as unknown as { data: { rows: { text: string }[][] } }
      ).data;
      return data.rows.map((row) => row[0]?.text ?? '');
    };
    assert.deepEqual(rowsOf(), ['Mug', 'Cap']); // revenue desc
    assert.deepEqual(rowsOf({ order: 'c1:desc' }), ['Cap', 'Mug']); // sold desc
  });

  it('builds a converted view and refuses a provider view', () => {
    const bars = {
      ...made(),
      views: [
        {
          key: 'bars',
          label: 'Bars',
          kind: 'BAR_LIST' as const,
          convert: { type: 'tableToBarList' as const, label: 0, value: 2 },
        },
        { key: 'trend', label: 'Trend', kind: 'GRAPH' as const },
      ],
    };
    const preview = previewWidget(source, bars, { view: 'bars' });
    assert.ok(preview.ok);
    assert.equal(preview.value.status, 'ok');
    assert.equal(preview.value.definition.kind, 'BAR_LIST');
    const provider = previewWidget(source, bars, { view: 'trend' });
    assert.ok(!provider.ok);
    assert.match(provider.error, /built by the provider/);
    const base = previewWidget(source, bars, { view: 'base' });
    assert.ok(base.ok);
    assert.equal(base.value.definition.kind, 'TABLE');
  });

  it('says so when the source has no sample, or the sample does not fit', () => {
    const { sample: _sample, ...noSample } = source;
    const missing = previewWidget(noSample, made());
    assert.ok(!missing.ok);
    assert.match(missing.error, /has no "sample"/);
    const wrong = previewWidget(
      { ...source, sample: { kind: 'TEXT', value: 'hi', label: 'Hi' } },
      made()
    );
    assert.ok(!wrong.ok);
  });
});
