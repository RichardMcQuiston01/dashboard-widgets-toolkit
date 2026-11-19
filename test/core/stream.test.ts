import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defineWidget,
  type WidgetDefinition,
} from '../../src/core/definition.js';
import { createWidgetLoader } from '../../src/core/loader.js';
import type { WidgetPayload } from '../../src/core/payload.js';
import type { DashboardWidget, WidgetContext } from '../../src/core/resolve.js';
import type {
  StreamHandlers,
  StreamStatus,
  WidgetStreams,
} from '../../src/core/stream.js';

const definitions: WidgetDefinition[] = [
  defineWidget({ key: 'live', title: 'Live', kind: 'TEXT', sortOrder: 10 }),
  defineWidget({ key: 'polled', title: 'Polled', kind: 'TEXT', sortOrder: 20 }),
];

function text(value: string): WidgetPayload {
  return { kind: 'TEXT', value, label: value };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function find(
  widgets: readonly DashboardWidget[],
  key: string
): DashboardWidget {
  const widget: DashboardWidget | undefined = widgets.find(
    (candidate) => candidate.definition.key === key
  );
  assert.ok(widget !== undefined, `no widget ${key}`);
  return widget;
}

/** A fake feed: records every start and lets the test push messages. */
function fakeFeed(): {
  readonly streams: WidgetStreams<WidgetContext>;
  readonly starts: StreamHandlers[];
  readonly cleanups: number[];
} {
  const starts: StreamHandlers[] = [];
  const cleanups: number[] = [];
  return {
    starts,
    cleanups,
    streams: {
      live: (_context, _definition, handlers) => {
        starts.push(handlers);
        return () => cleanups.push(starts.length);
      },
    },
  };
}

function build(
  feed: ReturnType<typeof fakeFeed>,
  extra: {
    minIntervalMs?: number;
    onStreamStatus?: (key: string, status: StreamStatus) => void;
  } = {}
): ReturnType<typeof createWidgetLoader> {
  return createWidgetLoader({
    definitions,
    providers: { polled: () => text('from provider') },
    streams: feed.streams,
    context: {},
    ...(extra.minIntervalMs === undefined
      ? {}
      : { minIntervalMs: extra.minIntervalMs }),
    ...(extra.onStreamStatus === undefined
      ? {}
      : { onStreamStatus: extra.onStreamStatus }),
  });
}

describe('widget streams', () => {
  it('stays loading until the first emit, then shows each emit', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    assert.equal(find(loader.getSnapshot(), 'live').status, 'loading');
    feed.starts[0]?.emit(text('one'));
    const first = find(loader.getSnapshot(), 'live');
    assert.equal(first.status, 'ok');
    feed.starts[0]?.emit(text('two'));
    const second = find(loader.getSnapshot(), 'live');
    assert.ok(second.status === 'ok' && second.data.kind === 'TEXT');
    assert.equal(second.data.value, 'two');
    assert.ok(second.updatedAt !== undefined);
    loader.dispose();
  });

  it('wins over a provider for the same key, others still use theirs', async () => {
    let providerCalls = 0;
    const loader = createWidgetLoader({
      definitions,
      providers: {
        live: () => {
          providerCalls += 1;
          return text('provider');
        },
        polled: () => text('from provider'),
      },
      streams: fakeFeed().streams,
      context: {},
    });
    loader.loadAll();
    await sleep(10);
    assert.equal(providerCalls, 0);
    assert.equal(find(loader.getSnapshot(), 'polled').status, 'ok');
    loader.dispose();
  });

  it('coalesces a burst to the newest payload per interval', async () => {
    const feed = fakeFeed();
    const loader = build(feed, { minIntervalMs: 40 });
    loader.loadAll();
    let renders = 0;
    let lastLive: DashboardWidget = find(loader.getSnapshot(), 'live');
    loader.subscribe(() => {
      const current: DashboardWidget = find(loader.getSnapshot(), 'live');
      if (current !== lastLive) renders += 1;
      lastLive = current;
    });
    const handlers = feed.starts[0];
    assert.ok(handlers !== undefined);
    for (let n = 1; n <= 20; n += 1) handlers.emit(text(`v${n}`));
    // The first showed at once; the other nineteen wait for one tick.
    const early = find(loader.getSnapshot(), 'live');
    assert.ok(early.status === 'ok' && early.data.kind === 'TEXT');
    assert.equal(early.data.value, 'v1');
    await sleep(80);
    const late = find(loader.getSnapshot(), 'live');
    assert.ok(late.status === 'ok' && late.data.kind === 'TEXT');
    assert.equal(late.data.value, 'v20');
    assert.equal(renders, 2);
    loader.dispose();
  });

  it('turns a malformed payload into an error, and recovers on the next good one', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    feed.starts[0]?.emit({ kind: 'KPI' } as unknown as WidgetPayload);
    const failed = find(loader.getSnapshot(), 'live');
    assert.ok(failed.status === 'error');
    assert.match(failed.error, /"live"/);
    feed.starts[0]?.emit(text('fine'));
    assert.equal(find(loader.getSnapshot(), 'live').status, 'ok');
    loader.dispose();
  });

  it('keeps the last good data with refreshError when a feed fails', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    feed.starts[0]?.emit(text('good'));
    feed.starts[0]?.fail(new Error('socket closed'));
    const kept = find(loader.getSnapshot(), 'live');
    assert.ok(kept.status === 'ok');
    assert.match(kept.refreshError ?? '', /socket closed/);
    feed.starts[0]?.emit(text('back'));
    const healed = find(loader.getSnapshot(), 'live');
    assert.ok(healed.status === 'ok');
    assert.equal(healed.refreshError, undefined);
    loader.dispose();
  });

  it('shows an error when a feed fails before any data, and when it throws', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    feed.starts[0]?.fail('no route');
    const failed = find(loader.getSnapshot(), 'live');
    assert.ok(failed.status === 'error' && /no route/.test(failed.error));
    loader.dispose();

    const throwing = createWidgetLoader({
      definitions,
      providers: {},
      streams: {
        live: () => {
          throw new Error('bad url');
        },
      },
      context: {},
    });
    throwing.load('live');
    const broken = find(throwing.getSnapshot(), 'live');
    assert.ok(broken.status === 'error' && /bad url/.test(broken.error));
    throwing.dispose();
  });

  it('aborts, cleans up and ignores late emits on dispose', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    const handlers = feed.starts[0];
    assert.ok(handlers !== undefined);
    loader.dispose();
    assert.equal(handlers.signal.aborted, true);
    assert.deepEqual(feed.cleanups, [1]);
    handlers.emit(text('late'));
    assert.equal(find(loader.getSnapshot(), 'live').status, 'loading');
  });

  it('reconnects on refresh(key) but not on polling-style refresh', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    feed.starts[0]?.emit(text('one'));
    loader.refresh(undefined, { skipInFlight: true });
    assert.equal(feed.starts.length, 1);
    loader.refresh('live');
    assert.equal(feed.starts.length, 2);
    assert.equal(feed.starts[0]?.signal.aborted, true);
    assert.deepEqual(feed.cleanups, [1]);
    const stale = find(loader.getSnapshot(), 'live');
    assert.ok(stale.status === 'ok' && stale.stale === true);
    feed.starts[0]?.emit(text('from the old feed'));
    feed.starts[1]?.emit(text('fresh'));
    const fresh = find(loader.getSnapshot(), 'live');
    assert.ok(fresh.status === 'ok' && fresh.data.kind === 'TEXT');
    assert.equal(fresh.data.value, 'fresh');
    assert.equal(fresh.stale, undefined);
    loader.dispose();
  });

  it('reports status, and closed when a stream stops', () => {
    const feed = fakeFeed();
    const seen: string[] = [];
    const loader = build(feed, {
      onStreamStatus: (key, status) => seen.push(`${key}:${status}`),
    });
    loader.loadAll();
    feed.starts[0]?.status('connected');
    feed.starts[0]?.status('reconnecting');
    loader.release(['live']);
    assert.deepEqual(seen, [
      'live:connected',
      'live:reconnecting',
      'live:closed',
    ]);
    assert.equal(find(loader.getSnapshot(), 'live').status, 'loading');
    loader.dispose();
  });

  it('stops the stream of a removed widget', () => {
    const feed = fakeFeed();
    const loader = build(feed);
    loader.loadAll();
    loader.setDefinitions(definitions.filter((d) => d.key !== 'live'));
    assert.equal(feed.starts[0]?.signal.aborted, true);
    loader.dispose();
  });
});
