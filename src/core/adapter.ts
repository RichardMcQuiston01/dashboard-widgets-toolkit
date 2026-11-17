/**
 * Adapters: describe once how to get raw data (a `DataSource`) and once how to
 * turn it into a widget payload (a pure mapper), and `defineAdapter` makes a
 * normal `WidgetProvider` from the pair. Nothing here fetches anything: the
 * source's `load` is your code (a `fetch`, a Prisma query), which gets the
 * cancellation signal, and a mapper is a plain function that is easy to test.
 * See `docs/design/widget-extensions.md`, section 6.
 */

import { providerKeyOf, type WidgetDefinition } from './definition.js';
import {
  isWidgetEmptyState,
  type WidgetDataOf,
  type WidgetEmptyState,
  type WidgetKind,
  type WidgetPayload,
} from './payload.js';
import {
  type ProviderOptions,
  type WidgetContext,
  type WidgetProvider,
  type WidgetProviders,
} from './resolve.js';
import { err, ok, type Result } from './result.js';
import { BASE_VIEW_KEY } from './views.js';

/** Gets raw data. Knows about transports, auth and pagination; the core does not. */
export interface DataSource<C extends WidgetContext, Raw> {
  /** Names the source; widgets that share a request share it (see `scope`). */
  readonly id: string;
  /**
   * Loads the raw data. Pass `options.signal` to `fetch` (or any cancellable
   * call) so a refresh or timeout stops the work.
   */
  load(context: C, options: ProviderOptions): Promise<Raw> | Raw;
  /**
   * Opts in to sharing one load between widgets: while a load with the same
   * `id` and the same scope string is still running, another call waits for it
   * instead of loading again. Return a string naming everything that changes
   * the request (the user, a date range, the option values it reads). Absent:
   * never shared. The shared load gets the first caller's options, and its
   * signal aborts only when every waiting caller has aborted.
   */
  readonly scope?: (context: C, options: ProviderOptions) => string;
}

/** Raw data in, widget payload out. Pure, so it can be tested with a plain object. */
export type Mapper<Raw, K extends WidgetKind, C extends WidgetContext> = (
  raw: Raw,
  context: C,
  options: ProviderOptions
) => WidgetDataOf<K> | WidgetEmptyState;

/**
 * What `defineAdapter` returns: a `WidgetProvider`, tagged with the kind it
 * builds and the source it reads, so `bindProviders` can check it against the
 * widget it is registered for.
 */
export type Adapter<
  C extends WidgetContext = WidgetContext,
  K extends WidgetKind = WidgetKind,
> = WidgetProvider<C> & {
  readonly kind: K;
  readonly sourceId: string;
};

interface SharedLoad {
  readonly controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
}

/** Loads that are running and shared, by `id` and scope. */
const sharedLoads = new Map<string, SharedLoad>();

function loadFromSource<C extends WidgetContext, Raw>(
  source: DataSource<C, Raw>,
  context: C,
  options: ProviderOptions
): Promise<Raw> {
  const scope: string | undefined = source.scope?.(context, options);
  if (scope === undefined) {
    return (async (): Promise<Raw> => source.load(context, options))();
  }
  const key = `${source.id}\u0000${scope}`;
  let shared: SharedLoad | undefined = sharedLoads.get(key);
  if (shared === undefined || shared.controller.signal.aborted) {
    const controller = new AbortController();
    const created: SharedLoad = {
      controller,
      subscribers: 0,
      promise: (async (): Promise<Raw> =>
        source.load(context, { ...options, signal: controller.signal }))(),
    };
    const forget = (): void => {
      if (sharedLoads.get(key) === created) sharedLoads.delete(key);
    };
    created.promise.then(forget, forget);
    sharedLoads.set(key, created);
    shared = created;
  }
  const waiting: SharedLoad = shared;
  waiting.subscribers += 1;
  const leave = (): void => {
    waiting.subscribers -= 1;
    if (waiting.subscribers === 0) {
      waiting.controller.abort(options.signal.reason);
    }
  };
  if (options.signal.aborted) leave();
  else options.signal.addEventListener('abort', leave, { once: true });
  return (waiting.promise as Promise<Raw>).finally(() =>
    options.signal.removeEventListener('abort', leave)
  );
}

/**
 * A provider from a source and a mapper. It works wherever a provider does
 * (`resolveWidgets`, `useWidgets`, `bindProviders`). A throw from `load` or the
 * mapper is named by the resolver with the widget's key; a payload the mapper
 * gets wrong is reported by the validator with its field path.
 *
 * It checks the widget's kind against `kind` and the mapped payload against
 * `kind` for the widget's own (base) view; a view the provider supplies is a
 * different kind, so those need a provider of their own.
 */
export function defineAdapter<
  C extends WidgetContext,
  Raw,
  K extends WidgetKind,
>(
  kind: K,
  source: DataSource<C, Raw>,
  map: Mapper<Raw, NoInfer<K>, C>
): Adapter<C, K> {
  const provider = async (
    context: C,
    definition: WidgetDefinition,
    options: ProviderOptions
  ): Promise<WidgetPayload> => {
    const quotedKey: string = JSON.stringify(definition.key);
    const quotedSource: string = JSON.stringify(source.id);
    const isBaseView: boolean = options.view === BASE_VIEW_KEY;
    if (isBaseView && definition.kind !== kind) {
      throw new Error(
        `Widget ${quotedKey} is a ${definition.kind}, but the adapter for source ${quotedSource} builds ${kind}.`
      );
    }
    const raw: Raw = await loadFromSource(source, context, options);
    const payload: WidgetPayload = map(raw, context, options);
    if (isBaseView && !isWidgetEmptyState(payload) && payload.kind !== kind) {
      throw new Error(
        `Widget ${quotedKey}: the mapper for source ${quotedSource} returned ${payload.kind}, but the adapter was defined for ${kind}.`
      );
    }
    return payload;
  };
  return Object.assign(provider, { kind, sourceId: source.id });
}

/** Whether a provider is an `Adapter` (made by `defineAdapter`). */
export function isAdapter(provider: unknown): provider is Adapter {
  if (typeof provider !== 'function') return false;
  const tagged = provider as { kind?: unknown; sourceId?: unknown };
  return typeof tagged.kind === 'string' && typeof tagged.sourceId === 'string';
}

/** Options for `bindProviders`. */
export interface BindProvidersOptions {
  /**
   * Allow providers no definition uses. By default one is reported, since it
   * is usually a typo in a key. Set this when the list is not every widget
   * that can exist (the Widget Builder's `source` keys, clones of widgets you
   * will add later).
   */
  readonly allowUnused?: boolean;
}

/**
 * Checks that `providers` (providers and adapters, by key) and `definitions`
 * fit together, and returns the providers for `resolveWidgets` / `useWidgets`:
 * every active widget has one (under its `providerKeyOf`), an adapter builds
 * the kind its widget is, and no provider is registered for nothing. The
 * error lists every problem at once.
 */
export function bindProviders<C extends WidgetContext>(
  definitions: readonly WidgetDefinition[],
  providers: WidgetProviders<C>,
  options: BindProvidersOptions = {}
): Result<WidgetProviders<C>> {
  const problems: string[] = [];
  const used = new Set<string>();
  for (const definition of definitions) {
    const key: string = providerKeyOf(definition);
    used.add(key);
    if (definition.active === false) continue;
    const quotedKey: string = JSON.stringify(definition.key);
    const provider: WidgetProvider<C> | undefined = providers[key];
    if (provider === undefined) {
      problems.push(
        `Widget ${quotedKey}: no provider or adapter is registered under ${JSON.stringify(key)}.`
      );
    } else if (isAdapter(provider) && provider.kind !== definition.kind) {
      problems.push(
        `Widget ${quotedKey} is a ${definition.kind}, but the adapter registered under ${JSON.stringify(key)} (source ${JSON.stringify(provider.sourceId)}) builds ${provider.kind}.`
      );
    }
  }
  if (options.allowUnused !== true) {
    for (const key of Object.keys(providers)) {
      if (!used.has(key)) {
        problems.push(
          `Provider ${JSON.stringify(key)} is registered, but no widget uses it (a typo in the key?).`
        );
      }
    }
  }
  return problems.length > 0 ? err(problems.join('\n')) : ok({ ...providers });
}
