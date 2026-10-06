import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { emptyWidget } from '../../src/core/payload.js';
import {
  loadingWidgets,
  resolvePayload,
  resolveWidgets,
  widgetsFor,
  type WidgetContext,
  type WidgetProviders,
} from '../../src/core/resolve.js';

interface ShopContext extends WidgetContext {
  readonly shopId: string;
}

const definitions: WidgetDefinition[] = [
  defineWidget({ key: 'later', title: 'Later', kind: 'TEXT', sortOrder: 20 }),
  defineWidget({ key: 'first', title: 'First', kind: 'GAUGE', sortOrder: 10 }),
  defineWidget({ key: 'broken', title: 'Broken', kind: 'TEXT', sortOrder: 30 }),
  defineWidget({ key: 'off', title: 'Off', kind: 'TEXT', active: false }),
  defineWidget({
    key: 'admin',
    title: 'Admin',
    kind: 'TEXT',
    roles: ['admin'],
  }),
  defineWidget({
    key: 'nothing',
    title: 'Nothing',
    kind: 'TABLE',
    sortOrder: 40,
  }),
  defineWidget({
    key: 'unregistered',
    title: 'Unregistered',
    kind: 'TEXT',
    sortOrder: 50,
  }),
  defineWidget({
    key: 'wrong-kind',
    title: 'Wrong kind',
    kind: 'KPI',
    sortOrder: 60,
  }),
];

void describe('resolveWidgets', () => {
  const calls: string[] = [];
  const providers: WidgetProviders<ShopContext> = {
    later: async (context) => {
      calls.push('later');
      return { kind: 'TEXT', value: context.shopId, label: 'shop' };
    },
    first: () => {
      calls.push('first');
      return { kind: 'GAUGE', value: 1, max: 2, label: 'half' };
    },
    broken: async () => {
      throw new Error('database is locked');
    },
    off: () => {
      calls.push('off');
      return { kind: 'TEXT', value: '', label: '' };
    },
    admin: () => {
      calls.push('admin');
      return { kind: 'TEXT', value: 'secret', label: '' };
    },
    nothing: () => ({ kind: 'TABLE', columns: [{ label: 'A' }], rows: [] }),
    'wrong-kind': () => ({ kind: 'TEXT', value: '1', label: 'x' }),
  };

  void it('resolves in sort order, captures failures per widget, never rejects', async () => {
    const resolved = await resolveWidgets(definitions, providers, {
      shopId: 'shop-1',
      roles: ['member'],
    });
    assert.deepEqual(
      resolved.map((w) => [w.definition.key, w.status]),
      [
        ['first', 'ok'],
        ['later', 'ok'],
        ['broken', 'error'],
        ['nothing', 'empty'],
        ['unregistered', 'error'],
        ['wrong-kind', 'error'],
      ]
    );
    const byKey = new Map(resolved.map((w) => [w.definition.key, w]));
    const later = byKey.get('later');
    assert.ok(later?.status === 'ok' && later.data.kind === 'TEXT');
    assert.equal(later.data.value, 'shop-1');
    const broken = byKey.get('broken');
    assert.ok(broken?.status === 'error');
    assert.equal(
      broken.error,
      'Widget "broken": provider failed: database is locked'
    );
    const missing = byKey.get('unregistered');
    assert.ok(missing?.status === 'error');
    assert.match(missing.error, /no provider is registered/);
    const wrong = byKey.get('wrong-kind');
    assert.ok(wrong?.status === 'error');
    assert.match(
      wrong.error,
      /expected kind KPI from its definition, got TEXT/
    );
  });

  void it('skips inactive and role-filtered widgets without running them', () => {
    assert.ok(!calls.includes('off'));
    assert.ok(!calls.includes('admin'));
  });

  void it('shows role-restricted widgets to matching roles', async () => {
    const resolved = await resolveWidgets(definitions, providers, {
      shopId: 's',
      roles: ['admin'],
    });
    assert.ok(resolved.some((w) => w.definition.key === 'admin'));
  });

  void it('does not use inherited properties as providers', async () => {
    const [resolved] = await resolveWidgets(
      [{ key: 'toString', title: 't', kind: 'TEXT' }],
      {},
      {}
    );
    assert.equal(resolved?.status, 'error');
  });

  void it('handles non-Error throws', async () => {
    const [resolved] = await resolveWidgets(
      [{ key: 'x', title: 'x', kind: 'TEXT' }],
      {
        x: () => {
          throw { code: 42 };
        },
      },
      {}
    );
    assert.ok(resolved?.status === 'error');
    assert.equal(resolved.error, 'Widget "x": provider failed: {"code":42}');
  });
});

void describe('resolvePayload', () => {
  const definition: WidgetDefinition = {
    key: 'stock',
    title: 'Low stock',
    kind: 'ALERT_LIST',
  };

  void it('marks explicit empty states and empty lists as empty', () => {
    assert.deepEqual(
      resolvePayload(definition, emptyWidget('Not synced yet.')),
      {
        definition,
        status: 'empty',
        emptyText: 'Not synced yet.',
      }
    );
    const resolved = resolvePayload(definition, {
      kind: 'ALERT_LIST',
      items: [],
      total: 0,
      emptyText: 'Nothing low on stock.',
    });
    assert.ok(resolved.status === 'empty');
    assert.equal(resolved.emptyText, 'Nothing low on stock.');
  });

  void it('turns invalid JSON from an API into an error widget', () => {
    const resolved = resolvePayload(definition, {
      kind: 'ALERT_LIST',
      items: 'x',
    });
    assert.ok(resolved.status === 'error');
    assert.match(
      resolved.error,
      /^Widget "stock" \(ALERT_LIST\): items must be an array/
    );
  });

  void it('can skip validation for trusted providers', () => {
    const resolved = resolvePayload(
      { key: 't', title: 't', kind: 'TEXT' },
      { kind: 'TEXT', value: 'v', label: 'l' },
      { validate: false }
    );
    assert.equal(resolved.status, 'ok');
  });
});

void describe('widgetsFor and loadingWidgets', () => {
  void it('filters and sorts definitions for a viewer', () => {
    assert.deepEqual(
      widgetsFor(definitions, undefined).map((d) => d.key),
      ['first', 'later', 'broken', 'nothing', 'unregistered', 'wrong-kind']
    );
  });

  void it('builds loading placeholders', () => {
    assert.deepEqual(loadingWidgets(definitions.slice(0, 1)), [
      { definition: definitions[0], status: 'loading' },
    ]);
  });
});
