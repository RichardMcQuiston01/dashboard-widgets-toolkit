import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineComponent, h } from 'vue';

import { defineWidget } from '../../src/core/definition.js';
import type { WidgetPayload } from '../../src/core/payload.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import type { StreamHandlers, StreamStatus } from '../../src/core/stream.js';
import { useWidgets } from '../../src/vue/index.js';
import { mountComponent, settle } from './mount.js';

const definitions = [
  defineWidget({ key: 'live', title: 'Live', kind: 'TEXT' }),
];

function text(value: string): WidgetPayload {
  return { kind: 'TEXT', value, label: value };
}

describe('useWidgets with streams (Vue)', () => {
  it('shows what a stream emits, reports status and stops on unmount', async () => {
    const starts: StreamHandlers[] = [];
    const seen: string[] = [];
    let latest: () => readonly DashboardWidget[] = () => [];
    const Probe = defineComponent({
      setup() {
        const result = useWidgets(
          definitions,
          {},
          {},
          {
            streams: {
              live: (_context, _definition, handlers) => {
                starts.push(handlers);
              },
            },
            onStreamStatus: (key: string, status: StreamStatus) =>
              seen.push(`${key}:${status}`),
          }
        );
        latest = () => result.widgets.value;
        return () => h('div');
      },
    });
    const mounted = mountComponent(Probe);
    await settle();
    assert.equal(starts.length, 1);
    assert.equal(latest()[0]?.status, 'loading');
    starts[0]?.status('connected');
    starts[0]?.emit(text('tick'));
    await settle();
    const shown = latest()[0];
    assert.ok(shown?.status === 'ok' && shown.data.kind === 'TEXT');
    assert.equal(shown.data.value, 'tick');
    mounted.unmount();
    assert.equal(starts[0]?.signal.aborted, true);
    assert.deepEqual(seen, ['live:connected', 'live:closed']);
  });
});
