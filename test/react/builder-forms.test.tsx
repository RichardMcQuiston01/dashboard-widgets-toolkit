import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import {
  defineSource,
  exposeOption,
  newWidget,
  type SourceDescription,
} from '../../src/builder/index.js';
import {
  WidgetOptionsForm,
  WidgetPreview,
  WidgetViewsForm,
  useWidgetDraft,
} from '../../src/react/index.js';
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

function start(): WidgetDefinition {
  const created = newWidget(source, { key: 'w', title: 'Best sellers' });
  assert.ok(created.ok);
  const exposed = exposeOption(source, created.value, 'limit', {
    label: 'How many',
  });
  assert.ok(exposed.ok);
  return exposed.value;
}

function Harness(): React.ReactElement {
  const draft = useWidgetDraft(source, start());
  return (
    <div>
      <WidgetOptionsForm draft={draft} />
      <WidgetViewsForm draft={draft} />
      <WidgetPreview source={source} definition={draft.candidate} />
      <span data-dirty={String(draft.dirty)} />
    </div>
  );
}

void describe('builder forms', () => {
  it('lists exposed options with a label, default and Remove, and the others to add', () => {
    const html = renderToStaticMarkup(<Harness />);
    assert.match(html, /Options viewers can change/);
    assert.match(html, /value="How many"/);
    assert.match(html, /Remove/);
    assert.match(html, /Available from the source/);
    assert.match(html, /Add Mode/);
    assert.doesNotMatch(html, /Add Rows/);
  });

  it('offers the conversions the source columns allow, and none when exhausted', () => {
    const html = renderToStaticMarkup(<Harness />);
    assert.match(html, /Add a view/);
    assert.match(html, /Revenue by Product \(bars\)/);
    assert.match(html, /No other views\./);
  });

  it('previews the widget from the sample with the real card', () => {
    const html = renderToStaticMarkup(<Harness />);
    assert.match(html, /dwt-builder-preview/);
    assert.match(html, /Best sellers/);
    assert.match(html, /Mug/);
    assert.match(html, /data-dirty="false"/);
  });

  it('says why when there is nothing to preview with', () => {
    const { sample: _sample, ...noSample } = source;
    const created = newWidget(noSample, { key: 'w', title: 'W' });
    assert.ok(created.ok);
    const html = renderToStaticMarkup(
      <WidgetPreview source={noSample} definition={created.value} />
    );
    assert.match(html, /Add a &quot;sample&quot; to the source/);
  });

  it('takes its words from labels', () => {
    const draftLabels = { optionsHeading: 'Choix', viewsHeading: 'Vues' };
    function Fr(): React.ReactElement {
      const draft = useWidgetDraft(source, start());
      return (
        <>
          <WidgetOptionsForm draft={draft} labels={draftLabels} />
          <WidgetViewsForm draft={draft} labels={draftLabels} />
        </>
      );
    }
    const html = renderToStaticMarkup(<Fr />);
    assert.match(html, /Choix/);
    assert.match(html, /Vues/);
  });
});
