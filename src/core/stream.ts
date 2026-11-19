/**
 * Live (push) data for a widget. A provider answers once; a stream keeps
 * calling `emit` for as long as the widget is on screen. Like a provider it is
 * only a contract: the toolkit never opens a socket itself, the consumer's
 * stream function does (a WebSocket, an `EventSource`, a timer, an in-memory
 * store), and credentials stay in consumer code.
 */

import type { WidgetDefinition } from './definition.js';
import type { WidgetPayload } from './payload.js';
import type { ProviderOptions, WidgetContext } from './resolve.js';

/** What a stream reports about its connection. */
export type StreamStatus = 'connected' | 'reconnecting' | 'closed';

/** Handed to a stream when it starts. */
export interface StreamHandlers extends Pick<
  ProviderOptions,
  'options' | 'view' | 'filters'
> {
  /**
   * Replaces the widget's current payload. Validated like a provider result:
   * a malformed message becomes an error on the card (or `refreshError` when
   * the card already has data), and the next good message recovers it.
   */
  readonly emit: (payload: WidgetPayload) => void;
  /**
   * Reports a failure. The card keeps any data it has and says the feed
   * failed; with no data it shows an error. The next `emit` recovers it.
   */
  readonly fail: (cause: unknown) => void;
  /** Reports the connection state to the loader's `onStreamStatus`. */
  readonly status: (status: StreamStatus) => void;
  /**
   * Aborted when the stream must stop: the widget was refreshed, its options,
   * view or filters changed, it was removed or released, or the dashboard was
   * torn down. The returned cleanup function runs at the same moment, so a
   * stream may use either.
   */
  readonly signal: AbortSignal;
}

/**
 * Starts a live feed for one widget and returns an optional cleanup function
 * (close the socket there). It may throw; that is reported as a failure.
 */
export type WidgetStream<C = WidgetContext> = (
  context: C,
  definition: WidgetDefinition,
  handlers: StreamHandlers
) => void | (() => void);

/** Streams keyed by widget key (or `source.providerKey`). They win over providers. */
export type WidgetStreams<C = WidgetContext> = Readonly<
  Record<string, WidgetStream<C>>
>;
