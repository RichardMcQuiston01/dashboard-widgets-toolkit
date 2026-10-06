import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fromLegacyDefinition,
  upgradeLegacyWidgetData,
} from '../../src/core/compat.js';
import {
  defineWidget,
  isWidgetVisibleTo,
  sortDefinitions,
} from '../../src/core/definition.js';
import { emptyTextFor, isWidgetKind } from '../../src/core/payload.js';
import { describeUnknownError } from '../../src/core/result.js';
import { labelStride, niceDomain, niceStep } from '../../src/core/scale.js';
import { isSafeHref, isSafeImageUrl } from '../../src/core/url.js';
import { validateWidgetData } from '../../src/core/validate.js';
import * as root from '../../src/index.js';

void describe('scale', () => {
  void it('rounds steps up to 1, 2 or 5 × 10^n', () => {
    assert.deepEqual(
      [0, 0.3, 1, 1.5, 3, 7, 12, 4500].map(niceStep),
      [1, 0.5, 1, 2, 5, 10, 20, 5000]
    );
  });

  void it('builds a domain that includes zero', () => {
    assert.deepEqual(niceDomain([120, 340, 80]), {
      min: 0,
      max: 400,
      ticks: [0, 100, 200, 300, 400],
    });
    assert.deepEqual(niceDomain([-30, 45]).ticks, [-40, -20, 0, 20, 40, 60]);
    assert.deepEqual(niceDomain([]), { min: 0, max: 1, ticks: [0, 0.5, 1] });
    assert.deepEqual(niceDomain([0.1, 0.3]).ticks, [0, 0.1, 0.2, 0.3]);
  });

  void it('thins x labels to at most six', () => {
    assert.equal(labelStride(12), 2);
    assert.equal(labelStride(5), 1);
    assert.equal(labelStride(0), 1);
  });
});

void describe('url safety', () => {
  void it('allows http(s), mailto and relative links only', () => {
    for (const ok of [
      'https://a.b/c',
      'http://a',
      'mailto:x@y.z',
      '/items/1',
      'items?id=2',
      '#top',
    ]) {
      assert.ok(isSafeHref(ok), ok);
    }
    for (const bad of [
      'javascript:alert(1)',
      ' JavaScript:x',
      'java\tscript:x',
      'data:text/html,x',
      'vbscript:x',
      '',
    ]) {
      assert.ok(!isSafeHref(bad), bad);
    }
  });

  void it('allows http(s) and relative images only', () => {
    assert.ok(isSafeImageUrl('https://i.etsystatic.com/x.jpg'));
    assert.ok(!isSafeImageUrl('mailto:x@y.z'));
    assert.ok(!isSafeImageUrl('data:image/png;base64,AAAA'));
  });
});

void describe('definitions', () => {
  void it('sorts stably by sortOrder', () => {
    const sorted = sortDefinitions([
      defineWidget({ key: 'b', title: 'B', kind: 'TEXT', sortOrder: 2 }),
      defineWidget({ key: 'a', title: 'A', kind: 'TEXT' }),
      defineWidget({ key: 'c', title: 'C', kind: 'TEXT', sortOrder: 0 }),
    ]);
    assert.deepEqual(
      sorted.map((d) => d.key),
      ['a', 'c', 'b']
    );
  });

  void it('checks active and roles (empty roles means everyone)', () => {
    const base = { key: 'k', title: 'K', kind: 'TEXT' } as const;
    assert.ok(isWidgetVisibleTo(base, undefined));
    assert.ok(isWidgetVisibleTo({ ...base, roles: [] }, undefined));
    assert.ok(!isWidgetVisibleTo({ ...base, active: false }, ['admin']));
    assert.ok(!isWidgetVisibleTo({ ...base, roles: ['admin'] }, undefined));
    assert.ok(!isWidgetVisibleTo({ ...base, roles: ['admin'] }, ['member']));
    assert.ok(
      isWidgetVisibleTo({ ...base, roles: ['admin', 'owner'] }, ['owner'])
    );
  });
});

void describe('payload helpers', () => {
  void it('recognises kinds and empty content', () => {
    assert.ok(isWidgetKind('BAR_LIST'));
    assert.ok(!isWidgetKind('bar_list'));
    assert.equal(
      emptyTextFor({ kind: 'BAR_LIST', items: [] }),
      'Nothing to show yet.'
    );
    assert.equal(
      emptyTextFor({
        kind: 'GRAPH',
        series: [{ name: 'a', points: [] }],
        chartType: 'line',
        valueFormat: 'number',
      }),
      'Nothing to show yet.'
    );
    assert.equal(emptyTextFor({ kind: 'TEXT', value: '', label: '' }), null);
  });

  void it('describes thrown values', () => {
    assert.equal(describeUnknownError(new Error('boom')), 'boom');
    assert.equal(describeUnknownError(new TypeError('')), 'TypeError');
    assert.equal(describeUnknownError('plain'), 'plain');
    assert.equal(describeUnknownError(undefined), 'undefined');
  });
});

void describe('Maker Toolkit compatibility', () => {
  void it('upgrades legacy TABLE and GRAPH payloads to valid ones', () => {
    const table = upgradeLegacyWidgetData({
      kind: 'TABLE',
      columns: ['Catalog', 'Count'],
      rows: [['Machines', '12']],
    });
    assert.deepEqual(table, {
      kind: 'TABLE',
      columns: [{ label: 'Catalog' }, { label: 'Count' }],
      rows: [[{ text: 'Machines' }, { text: '12' }]],
    });
    assert.ok(validateWidgetData(table).ok);

    const graph = upgradeLegacyWidgetData({
      kind: 'GRAPH',
      points: [{ label: 'Wood', value: 4 }],
    });
    assert.deepEqual(graph, {
      kind: 'GRAPH',
      series: [{ name: 'Value', points: [{ label: 'Wood', value: 4 }] }],
      chartType: 'bar',
      valueFormat: 'number',
    });
    assert.ok(validateWidgetData(graph).ok);
  });

  void it('leaves TEXT, GAUGE and new shapes alone', () => {
    const text = { kind: 'TEXT', value: '3', label: 'x' };
    assert.equal(upgradeLegacyWidgetData(text), text);
    assert.equal(upgradeLegacyWidgetData(null), null);
  });

  void it('maps legacy definitions', () => {
    assert.deepEqual(
      fromLegacyDefinition({
        widgetKey: 'catalog-totals',
        title: 'Catalog',
        description: null,
        viewType: 'TABLE',
        sortOrder: 3,
      }),
      { key: 'catalog-totals', title: 'Catalog', kind: 'TABLE', sortOrder: 3 }
    );
    assert.equal(
      fromLegacyDefinition({
        widgetKey: 'x',
        title: 'x',
        description: 'd',
        viewType: 'PIE',
        sortOrder: 0,
      }),
      null
    );
  });
});

void describe('package root', () => {
  void it('re-exports the core', () => {
    assert.equal(typeof root.resolveWidgets, 'function');
    assert.equal(typeof root.validateWidgetData, 'function');
    assert.equal(typeof root.parseLayout, 'function');
    assert.deepEqual(root.WIDGET_KINDS, [
      'TEXT',
      'KPI',
      'GAUGE',
      'TABLE',
      'BAR_LIST',
      'ALERT_LIST',
      'GRAPH',
    ]);
  });
});
