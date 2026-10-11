import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanClones,
  parseClones,
  serializeClones,
  withClones,
} from '../../src/core/clones.js';
import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import {
  canDuplicate,
  deleteClone,
  duplicateWidget,
  nextCloneKey,
  suggestedViewTitle,
} from '../../src/core/duplicate.js';
import {
  EMPTY_LAYOUT,
  parseLayout,
  serializeLayout,
  type DashboardLayout,
} from '../../src/core/layout.js';
import { normalizeLayout } from '../../src/core/pages.js';
import { resolveWidgets } from '../../src/core/resolve.js';
import { effectiveDefinitions } from '../../src/core/settings.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';

const orders = defineWidget({
  key: 'orders',
  title: 'Recent Orders',
  kind: 'TABLE',
  width: 6,
});
const revenue = defineWidget({
  key: 'revenue',
  title: 'Revenue',
  kind: 'TEXT',
  width: 6,
});
const policy = defineWidget({
  key: 'policy',
  title: 'Policy',
  kind: 'TEXT',
  locked: { clone: true },
});
const definitions: WidgetDefinition[] = [orders, revenue, policy];

void describe('parse and serialize', () => {
  void it('round-trips and leaves old layouts byte-identical', () => {
    const layout: DashboardLayout = {
      ...EMPTY_LAYOUT,
      clones: [{ key: 'orders#1', from: 'orders' }],
    };
    assert.deepEqual(
      parseLayout(serializeLayout(layout)).clones,
      layout.clones
    );
    assert.equal(
      serializeLayout(EMPTY_LAYOUT),
      '{"order":[],"hidden":[],"minimized":[]}'
    );
  });

  void it('drops malformed, repeated and self-referencing entries', () => {
    assert.deepEqual(
      parseClones([
        { key: 'a#1', from: 'a' },
        { key: 'a#1', from: 'a' },
        { key: 'x', from: 'x' },
        { key: '', from: 'a' },
        { key: 3, from: 'a' },
        'nope',
      ]),
      [{ key: 'a#1', from: 'a' }]
    );
    assert.equal(parseClones('x'), undefined);
    assert.equal(serializeClones([]), undefined);
  });
});

void describe('withClones', () => {
  const layout: DashboardLayout = {
    ...EMPTY_LAYOUT,
    clones: [
      { key: 'orders#2', from: 'orders' },
      { key: 'orders#1', from: 'orders' },
    ],
  };

  void it('adds each clone right after its original with a numbered title and no locks', () => {
    const all = withClones(definitions, layout);
    assert.deepEqual(
      all.map((d) => d.key),
      ['orders', 'orders#2', 'orders#1', 'revenue', 'policy']
    );
    const clone = all[1];
    assert.equal(clone?.title, 'Recent Orders (#2)');
    assert.equal(clone?.sourceKey, 'orders');
    assert.equal(all[2]?.title, 'Recent Orders (#1)');
    assert.equal(clone?.width, 6);
  });

  void it('does not give a clone its original’s locks', () => {
    const locked = defineWidget({
      key: 'l',
      title: 'L',
      kind: 'TEXT',
      locked: { move: true },
    });
    const all = withClones([locked], {
      clones: [{ key: 'l#1', from: 'l' }],
    });
    assert.equal(all[1]?.locked, undefined);
  });

  void it('is idempotent and returns the same array when there is nothing to add', () => {
    const once = withClones(definitions, layout);
    assert.equal(withClones(once, layout), once);
    assert.equal(withClones(definitions, EMPTY_LAYOUT), definitions);
  });

  void it('skips clones of unknown widgets, of clones, of locked widgets and key clashes', () => {
    const bad: DashboardLayout = {
      ...EMPTY_LAYOUT,
      clones: [
        { key: 'ghost#1', from: 'ghost' },
        { key: 'policy#1', from: 'policy' },
        { key: 'revenue', from: 'orders' },
        { key: 'orders#1', from: 'orders' },
        { key: 'orders#1#1', from: 'orders#1' },
      ],
    };
    const all = withClones(definitions, bad);
    assert.deepEqual(
      all.map((d) => d.key),
      ['orders', 'orders#1', 'revenue', 'policy']
    );
    assert.equal(
      withClones(definitions, bad, { overrideLocks: true }).some(
        (d) => d.key === 'policy#1'
      ),
      true
    );
    assert.equal(cleanClones(definitions, undefined), undefined);
  });
});

void describe('duplicateWidget', () => {
  void it('adds a clone after the original, copying width, view and options but not the title', () => {
    const layout: DashboardLayout = {
      ...EMPTY_LAYOUT,
      order: ['revenue', 'orders'],
      settings: {
        orders: { title: 'Mine', width: 8, options: { limit: 3 }, view: 'x' },
      },
    };
    const result = duplicateWidget(definitions, layout, 'orders');
    assert.ok(result.ok);
    assert.equal(result.value.key, 'orders#1');
    assert.deepEqual(result.value.layout.clones, [
      { key: 'orders#1', from: 'orders' },
    ]);
    assert.deepEqual(result.value.layout.settings?.['orders#1'], {
      width: 8,
      options: { limit: 3 },
      view: 'x',
    });
    assert.deepEqual(result.value.layout.order, [
      'revenue',
      'orders',
      'orders#1',
      'policy',
    ]);
  });

  void it('numbers the next clone and clones the original when given a clone', () => {
    const first = duplicateWidget(definitions, EMPTY_LAYOUT, 'orders');
    assert.ok(first.ok);
    const all = withClones(definitions, first.value.layout);
    const second = duplicateWidget(all, first.value.layout, 'orders#1');
    assert.ok(second.ok);
    assert.equal(second.value.key, 'orders#2');
    assert.deepEqual(second.value.layout.clones?.[1], {
      key: 'orders#2',
      from: 'orders',
    });
    assert.equal(nextCloneKey(all, first.value.layout, 'orders'), 'orders#2');
  });

  void it('refuses a widget locked against cloning, and an unknown one', () => {
    const locked = duplicateWidget(definitions, EMPTY_LAYOUT, 'policy');
    assert.ok(!locked.ok);
    assert.match(locked.error, /"policy" is locked against duplicating/);
    assert.equal(canDuplicate(definitions, 'policy'), false);
    assert.equal(
      canDuplicate(definitions, 'policy', { overrideLocks: true }),
      true
    );
    const unknown = duplicateWidget(definitions, EMPTY_LAYOUT, 'nope');
    assert.ok(!unknown.ok);
  });

  void it('refuses when a paged layout has no room, and says how wide', () => {
    const wide = [
      defineWidget({ key: 'a', title: 'A', kind: 'TEXT', width: 12 }),
    ];
    const paged: DashboardLayout = {
      ...EMPTY_LAYOUT,
      pages: [
        {
          key: 'p1',
          title: 'Home',
          order: ['a'],
          hidden: [],
          minimized: [],
          maxRows: 1,
        },
      ],
    };
    const result = duplicateWidget(wide, paged, 'a');
    assert.ok(!result.ok);
    assert.match(
      result.error,
      /Page "Home" has no room for a widget 12 wide \(it holds 1 rows\)/
    );
    const roomy = duplicateWidget(
      wide,
      {
        ...paged,
        pages: [
          {
            key: 'p1',
            title: 'Home',
            order: ['a'],
            hidden: [],
            minimized: [],
            maxRows: 2,
          },
        ],
      },
      'a'
    );
    assert.ok(roomy.ok);
  });

  void it('puts the clone on the original’s page', () => {
    const paged: DashboardLayout = {
      ...EMPTY_LAYOUT,
      pages: [
        {
          key: 'p1',
          title: 'One',
          order: ['revenue'],
          hidden: [],
          minimized: [],
        },
        {
          key: 'p2',
          title: 'Two',
          order: ['orders'],
          hidden: [],
          minimized: [],
        },
      ],
    };
    const result = duplicateWidget([orders, revenue], paged, 'orders');
    assert.ok(result.ok);
    assert.deepEqual(result.value.layout.pages?.[1]?.order, [
      'orders',
      'orders#1',
    ]);
    assert.deepEqual(result.value.layout.pages?.[0]?.order, ['revenue']);
  });
});

void describe('deleteClone', () => {
  void it('removes the entry, settings and every list entry; ignores originals', () => {
    const made = duplicateWidget(definitions, EMPTY_LAYOUT, 'orders');
    assert.ok(made.ok);
    const withSettings: DashboardLayout = {
      ...made.value.layout,
      hidden: ['orders#1'],
      minimized: ['orders#1'],
      settings: { 'orders#1': { width: 4 }, revenue: { width: 3 } },
    };
    const after = deleteClone(withSettings, 'orders#1');
    assert.equal(after.clones, undefined);
    assert.deepEqual(after.order, ['orders', 'revenue', 'policy']);
    assert.deepEqual(after.hidden, []);
    assert.deepEqual(after.minimized, []);
    assert.deepEqual(after.settings, { revenue: { width: 3 } });
    assert.equal(deleteClone(withSettings, 'orders'), withSettings);
    assert.equal(deleteClone(EMPTY_LAYOUT, 'orders#1'), EMPTY_LAYOUT);
  });
});

void describe('normalizeLayout with clones', () => {
  void it('drops a clone whose original is gone, with its settings and place', () => {
    const layout: DashboardLayout = {
      ...EMPTY_LAYOUT,
      order: ['ghost#1', 'orders'],
      clones: [{ key: 'ghost#1', from: 'ghost' }],
      settings: { 'ghost#1': { width: 4 } },
    };
    const result = normalizeLayout(definitions, layout);
    assert.equal(result.clones, undefined);
    assert.equal(result.settings, undefined);
    assert.deepEqual(result.order, ['orders']);
  });

  void it('keeps valid clones, their settings and title uniqueness, and is idempotent', () => {
    const layout: DashboardLayout = {
      ...EMPTY_LAYOUT,
      order: ['orders', 'orders#1'],
      clones: [{ key: 'orders#1', from: 'orders' }],
      settings: { 'orders#1': { width: 4, title: 'Revenue' } },
    };
    const once = normalizeLayout(definitions, layout);
    assert.deepEqual(once.clones, layout.clones);
    assert.equal(once.settings?.['orders#1']?.width, 4);
    assert.equal(once.settings?.['orders#1']?.title, 'Revenue (#2)');
    assert.equal(normalizeLayout(definitions, once), once);
    // Also stable when given definitions that already include the clones.
    assert.equal(normalizeLayout(withClones(definitions, once), once), once);
  });

  void it('removes a clone of a widget locked against cloning', () => {
    const layout: DashboardLayout = {
      ...EMPTY_LAYOUT,
      clones: [{ key: 'policy#1', from: 'policy' }],
    };
    assert.equal(normalizeLayout(definitions, layout).clones, undefined);
    assert.notEqual(
      normalizeLayout(definitions, layout, { overrideLocks: true }).clones,
      undefined
    );
  });
});

void describe('loading a clone', () => {
  void it('uses the original’s provider and keeps the clone’s key and options', async () => {
    const calls: string[] = [];
    const all = withClones(definitions, {
      clones: [{ key: 'revenue#1', from: 'revenue' }],
    });
    const widgets = await resolveWidgets(
      all,
      {
        revenue: (_ctx, definition) => {
          calls.push(definition.key);
          return { kind: 'TEXT', value: '$1', label: 'Revenue' };
        },
        orders: () => ({ kind: 'TABLE', columns: [], rows: [] }),
        policy: () => ({ kind: 'TEXT', value: 'x', label: 'x' }),
      },
      {}
    );
    assert.deepEqual(calls, ['revenue', 'revenue#1']);
    assert.equal(
      widgets.find((w) => w.definition.key === 'revenue#1')?.status,
      'ok'
    );
  });
});

void describe('misc', () => {
  void it('suggests a title with the view label, cut to the limit', () => {
    assert.equal(
      suggestedViewTitle('Recent Orders', 'Line Chart'),
      'Recent Orders Line Chart'
    );
    assert.equal(suggestedViewTitle('x'.repeat(100), 'Chart').length, 80);
  });

  void it('applies a clone’s own settings on top of the copied definition', () => {
    const all = withClones(definitions, {
      clones: [{ key: 'orders#1', from: 'orders' }],
    });
    const effective = effectiveDefinitions(all, {
      settings: { 'orders#1': { width: 4, title: 'Orders (small)' } },
    });
    const clone = effective.find((d) => d.key === 'orders#1');
    assert.equal(clone?.width, 4);
    assert.equal(clone?.title, 'Orders (small)');
    assert.equal(effective.find((d) => d.key === 'orders')?.width, 6);
  });

  void it('validates locked.clone as a boolean', () => {
    assert.ok(
      validateWidgetDefinition({
        key: 'a',
        title: 'A',
        kind: 'TEXT',
        locked: { clone: true },
      }).ok
    );
    const bad = validateWidgetDefinition({
      key: 'a',
      title: 'A',
      kind: 'TEXT',
      locked: { clone: 'yes' },
    });
    assert.ok(!bad.ok);
    assert.match(bad.error, /locked\.clone/);
  });
});
