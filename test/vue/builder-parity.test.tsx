import { describe, it } from 'node:test';

import { defineComponent, h as vueH } from 'vue';

import {
  defineBuilderPolicy,
  defineSource,
  exposeOption,
  newWidget,
  type BuilderLabels,
  type BuilderPolicy,
  type SourceDescription,
} from '../../src/builder/index.js';
import type { WidgetDefinition } from '../../src/core/definition.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { assertParity } from './helpers.js';

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
  if (!created.ok) throw new Error(created.error);
  const exposed = exposeOption(source, created.value, 'limit', {
    label: 'How many',
  });
  if (!exposed.ok) throw new Error(exposed.error);
  return exposed.value;
}

interface Variant {
  readonly labels?: Partial<BuilderLabels>;
  readonly policy?: BuilderPolicy;
  readonly key?: string;
}

function labelsProp(variant: Variant): { labels?: Partial<BuilderLabels> } {
  return variant.labels === undefined ? {} : { labels: variant.labels };
}

function reactHarness(variant: Variant): React.ReactElement {
  function Harness(): React.ReactElement {
    const draft = reactApi.useWidgetDraft(source, start(variant.key), {
      ...(variant.policy === undefined ? {} : { policy: variant.policy }),
    });
    return (
      <div>
        <reactApi.WidgetOptionsForm draft={draft} {...labelsProp(variant)} />
        <reactApi.WidgetViewsForm draft={draft} {...labelsProp(variant)} />
        <reactApi.WidgetPreview
          source={source}
          definition={draft.candidate}
          {...labelsProp(variant)}
        />
      </div>
    );
  }
  return <Harness />;
}

function vueHarness(variant: Variant) {
  return {
    component: defineComponent(() => {
      const draft = vueApi.useWidgetDraft(source, start(variant.key), {
        ...(variant.policy === undefined ? {} : { policy: variant.policy }),
      });
      return () =>
        vueH('div', [
          vueH(vueApi.WidgetOptionsForm, { draft, labels: variant.labels }),
          vueH(vueApi.WidgetViewsForm, { draft, labels: variant.labels }),
          vueH(vueApi.WidgetPreview, {
            source,
            definition: draft.candidate,
            ...labelsProp(variant),
          }),
        ]);
    }),
    props: {},
  };
}

function parity(name: string, variant: Variant = {}): void {
  void it(name, async () => {
    await assertParity(name, reactHarness(variant), vueHarness(variant));
  });
}

void describe('Widget Builder: Vue draws what React draws', () => {
  parity('options, views and preview');
  parity('with custom labels', {
    labels: { optionsHeading: 'Choix', viewsHeading: 'Vues' },
  });
  parity('under a policy that has reached its limits', {
    key: 'u-1-w',
    policy: defineBuilderPolicy({
      sources: ['products'],
      maxWidgets: 3,
      keyPrefix: 'u-1-',
      maxOptions: 1,
      maxViews: 0,
    }),
  });
});

void describe('Widget Builder: a preview with nothing to draw', () => {
  const { sample: _sample, ...noSample } = source;
  void it('says why when the source has no sample', async () => {
    const created = newWidget(noSample, { key: 'w', title: 'W' });
    if (!created.ok) throw new Error(created.error);
    await assertParity(
      'no sample',
      <reactApi.WidgetPreview source={noSample} definition={created.value} />,
      {
        component: vueApi.WidgetPreview,
        props: { source: noSample, definition: created.value },
      }
    );
  });
});
