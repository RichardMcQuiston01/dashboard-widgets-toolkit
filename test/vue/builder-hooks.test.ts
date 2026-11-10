import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineComponent, h, ref } from 'vue';

import {
  defineBuilderPolicy,
  defineSource,
  exposeOption,
  newWidget,
  type BuilderPolicy,
  type SourceDescription,
} from '../../src/builder/index.js';
import type { WidgetDefinition } from '../../src/core/definition.js';
import {
  WidgetOptionsForm,
  WidgetPreview,
  WidgetViewsForm,
  useWidgetDraft,
  type WidgetDraft,
} from '../../src/vue/index.js';
import {
  findAll,
  mountComponent,
  settle,
  textOf,
  type FakeNode,
  type Mounted,
} from './mount.js';

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
      key: 'mode',
      type: 'choice',
      label: 'Mode',
      choices: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
      default: 'a',
    },
  ],
  sample: {
    kind: 'TABLE',
    columns: [{ label: 'Product' }, { label: 'Sold' }, { label: 'Revenue' }],
    rows: [
      [{ text: 'Mug' }, { text: '10', value: 10 }, { text: '$50', value: 50 }],
    ],
  },
});

function start(key = 'w'): WidgetDefinition {
  const created = newWidget(source, { key, title: 'Best sellers' });
  assert.ok(created.ok);
  return created.value;
}

function mountDraft(
  initial: WidgetDefinition,
  options: Parameters<typeof useWidgetDraft>[2] = {}
): { readonly draft: () => WidgetDraft; readonly mounted: Mounted } {
  let captured: WidgetDraft | undefined;
  const Page = defineComponent(() => {
    const draft = useWidgetDraft(source, initial, options);
    captured = draft;
    return () =>
      h('div', [
        h(WidgetOptionsForm, { draft }),
        h(WidgetViewsForm, { draft }),
        h(WidgetPreview, { source, definition: draft.candidate }),
        h('span', { class: 'dirty' }, String(draft.dirty)),
      ]);
  });
  const mounted = mountComponent(Page);
  return {
    draft: () => {
      assert.ok(captured);
      return captured;
    },
    mounted,
  };
}

function buttonLabelled(root: FakeNode, text: string): FakeNode {
  const found = findAll(root, 'button').find((b) => textOf(b) === text);
  assert.ok(found, `a button reading ${JSON.stringify(text)}`);
  return found;
}

void describe('useWidgetDraft in Vue', () => {
  it('edits plain fields as a pending patch and commits them', async () => {
    const { draft, mounted } = mountDraft(start());
    assert.equal(draft().dirty, false);
    draft().setField('title', '');
    await settle();
    assert.equal(draft().dirty, true);
    assert.ok(
      draft().problems['title'] !== undefined,
      'an empty title is a problem'
    );
    assert.equal(
      draft().candidate.title,
      'Best sellers',
      'candidate keeps the last valid one'
    );
    assert.equal(
      textOf(findAll(mounted.root, 'span')[0] ?? mounted.root).includes('true'),
      true
    );
    draft().setField('title', 'Top');
    await settle();
    assert.equal(draft().candidate.title, 'Top');
    const committed = draft().commit();
    assert.ok(committed.ok);
    await settle();
    assert.equal(draft().definition.title, 'Top');
    assert.equal(draft().dirty, false);
    mounted.unmount();
  });

  it('re-renders the forms when an option is added from the form', async () => {
    const { draft, mounted } = mountDraft(start());
    assert.doesNotMatch(textOf(mounted.root), /Remove/);
    const add = buttonLabelled(mounted.root, 'Add Rows');
    (add.props['onClick'] as () => void)();
    await settle();
    assert.equal(draft().definition.options?.length, 1);
    assert.match(textOf(mounted.root), /Remove/);
    assert.doesNotMatch(textOf(mounted.root), /Add Rows/);
    assert.match(textOf(mounted.root), /Add Mode/);
    mounted.unmount();
  });

  it('shows a refused change beside the option, and Remove clears it', async () => {
    const created = exposeOption(source, start(), 'limit', {
      label: 'How many',
    });
    assert.ok(created.ok);
    const { draft, mounted } = mountDraft(created.value);
    const labelInput = findAll(mounted.root, 'input').find(
      (input) => input.props['value'] === 'How many'
    );
    assert.ok(labelInput);
    (labelInput.props['onInput'] as (event: unknown) => void)({
      target: { value: '' },
    });
    await settle();
    assert.equal(
      findAll(mounted.root, 'p').filter((p) => p.props['role'] === 'alert')
        .length,
      1
    );
    (buttonLabelled(mounted.root, 'Remove').props['onClick'] as () => void)();
    await settle();
    assert.equal(draft().definition.options?.length ?? 0, 0);
    assert.equal(
      findAll(mounted.root, 'p').filter((p) => p.props['role'] === 'alert')
        .length,
      0
    );
    mounted.unmount();
  });

  it('adds and removes a view through the views form', async () => {
    const { draft, mounted } = mountDraft(start());
    const select = findAll(mounted.root, 'select')[0];
    assert.ok(select);
    const option = findAll(select, 'option').find(
      (o) => o.props['value'] !== ''
    );
    assert.ok(option);
    (select.props['onChange'] as (event: unknown) => void)({
      target: { value: option.props['value'] },
    });
    await settle();
    assert.equal(draft().definition.views?.length, 1);
    const remove = findAll(mounted.root, 'button').find(
      (b) =>
        typeof b.props['aria-label'] === 'string' &&
        /^Remove /.test(b.props['aria-label'])
    );
    assert.ok(remove);
    (remove.props['onClick'] as () => void)();
    await settle();
    assert.equal(draft().definition.views?.length ?? 0, 0);
    mounted.unmount();
  });

  it('follows a source and a policy given as refs', async () => {
    const policy = ref<BuilderPolicy>(
      defineBuilderPolicy({
        sources: ['products'],
        maxWidgets: 3,
        keyPrefix: 'u-1-',
        maxOptions: 1,
        maxViews: 0,
      })
    );
    const { draft, mounted } = mountDraft(start('u-1-w'), { policy });
    assert.deepEqual(draft().editable, [
      'title',
      'description',
      'width',
      'defaultView',
    ]);
    assert.equal(draft().limits.optionsLeft, 1);
    assert.equal(draft().limits.viewsLeft, 0);
    const refused = draft().addView({
      key: 'x',
      label: 'X',
      kind: 'BAR_LIST',
      convert: { type: 'tableToBarList', label: 0, value: 1 },
    });
    assert.equal(refused.ok, false);
    policy.value = defineBuilderPolicy({
      sources: ['products'],
      maxWidgets: 3,
      keyPrefix: 'u-1-',
      maxOptions: 2,
      maxViews: 2,
    });
    assert.equal(draft().limits.optionsLeft, 2);
    mounted.unmount();
  });

  it('refuses to commit a field the policy does not allow', () => {
    const { draft, mounted } = mountDraft(start('u-1-w'), {
      policy: defineBuilderPolicy({
        sources: ['products'],
        maxWidgets: 3,
        keyPrefix: 'u-1-',
      }),
    });
    draft().setField('roles', ['admin']);
    assert.ok(draft().problems['roles'] !== undefined);
    const outcome = draft().commit();
    assert.equal(outcome.ok, false);
    mounted.unmount();
  });
});
