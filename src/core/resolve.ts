/**
 * Runs each widget's data provider and collects the outcome per widget, so
 * one failing provider never breaks the rest of the dashboard. The package
 * never fetches anything itself: providers are the consumer's functions
 * (a Prisma query, an HTTP call, a computed value).
 */

import {
  isWidgetVisibleTo,
  sortDefinitions,
  type WidgetDefinition,
} from './definition.js';
import {
  applyClientOptions,
  optionsCacheSuffix,
  resolveOptionValues,
  type OptionContext,
  type OptionValues,
} from './options.js';
import {
  emptyTextFor,
  type WidgetData,
  type WidgetPayload,
} from './payload.js';
import { describeUnknownError } from './result.js';
import { validateWidgetData } from './validate.js';

/** The minimum a resolve context carries; add whatever your providers need. */
export interface WidgetContext {
  /** The viewer's roles. Widgets with `roles` need at least one of them. */
  readonly roles?: readonly string[];
}

/** What the resolver hands every provider, after the context and definition. */
export interface ProviderOptions {
  /**
   * Aborted when the widget times out, is refreshed, or the dashboard is torn
   * down. Pass it to `fetch` (or any cancellable call) to stop the work; a
   * provider that ignores it is still abandoned, just not stopped.
   */
  readonly signal: AbortSignal;
  /**
   * The widget's declared options, resolved: what was chosen when it is valid,
   * else the default. Empty when the definition declares none. Treat values
   * that reach a database query (`text`, `sort`, `columns`) as untrusted input
   * and check them again on the server.
   */
  readonly options: OptionValues;
}

/**
 * Loads one widget's payload. May be sync or async; may throw. The third
 * argument is optional to use: a provider that takes only `(context,
 * definition)` keeps working.
 */
export type WidgetProvider<C = WidgetContext> = (
  context: C,
  definition: WidgetDefinition,
  options: ProviderOptions
) => WidgetPayload | Promise<WidgetPayload>;

/** Providers keyed by widget key. */
export type WidgetProviders<C = WidgetContext> = Readonly<
  Record<string, WidgetProvider<C>>
>;

export interface OkWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'ok';
  readonly data: WidgetData;
  /** When the data was produced (epoch ms), set when a provider resolved it. */
  readonly updatedAt?: number;
  /** True while cached data is shown and a fresh load is still running. */
  readonly stale?: boolean;
  /** The widget's resolved option values; present when it declares options. */
  readonly options?: OptionValues;
}

export interface EmptyWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'empty';
  /** Why there is nothing to show, e.g. "No orders synced yet." */
  readonly emptyText: string;
  /** The widget's resolved option values; present when it declares options. */
  readonly options?: OptionValues;
}

export interface ErrorWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'error';
  /** Names the widget and what failed. */
  readonly error: string;
  /** The widget's resolved option values; present when it declares options. */
  readonly options?: OptionValues;
}

/** One widget after its provider ran. */
export type ResolvedWidget = OkWidget | EmptyWidget | ErrorWidget;

/** A widget whose data hasn't arrived yet (for client-side loading states). */
export interface LoadingWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'loading';
  /** The widget's resolved option values; present when it declares options. */
  readonly options?: OptionValues;
}

/** Anything a dashboard can render: resolved, or still loading. */
export type DashboardWidget = ResolvedWidget | LoadingWidget;

export type WidgetStatus = DashboardWidget['status'];

/** A payload the cache holds, with when it was stored (epoch ms). */
export interface CachedPayload {
  readonly payload: unknown;
  readonly storedAt: number;
}

/**
 * Consumer-supplied storage for widget payloads (memory, localStorage, a
 * database). The package never stores anything itself. Payloads read back
 * are validated again, so a corrupt entry cannot break a widget.
 */
export interface WidgetCache {
  get(
    key: string
  ): CachedPayload | undefined | Promise<CachedPayload | undefined>;
  set(key: string, entry: CachedPayload): void | Promise<void>;
}

export interface ResolveOptions extends OptionContext {
  /**
   * The values chosen for each widget's options, by widget key. Values a
   * widget didn't declare, or that aren't valid for the option, are ignored
   * and the option's default is used.
   */
  readonly optionValues?: Readonly<
    Record<string, Readonly<Record<string, unknown>> | undefined>
  >;
  /**
   * Validate each provider's payload with `validateWidgetData` (and check
   * its kind matches the definition). Default true; turn off only for
   * trusted, typed providers.
   */
  readonly validate?: boolean;
  /**
   * Give each provider this many milliseconds. A timeout aborts the
   * provider's signal and yields an `error` widget naming the key.
   */
  readonly timeoutMs?: number;
  /** Cancels loading; affected widgets resolve as `error` (canceled). */
  readonly signal?: AbortSignal;
  /** Where to store successful payloads (see `WidgetCache`). */
  readonly cache?: WidgetCache;
  /** Cache key for a widget. Default: the widget's `key`. */
  readonly cacheKey?: (definition: WidgetDefinition) => string;
}

/**
 * Turns a payload (typically JSON from an API) into a resolved widget:
 * validated against the definition's kind, and marked empty when it has
 * nothing to show.
 */
export function resolvePayload(
  definition: WidgetDefinition,
  payload: unknown,
  options: ResolveOptions = {}
): ResolvedWidget {
  let checked: WidgetPayload;
  if (options.validate === false) {
    checked = payload as WidgetPayload;
  } else {
    const result = validateWidgetData(payload, {
      widgetKey: definition.key,
      expectedKind: definition.kind,
    });
    if (!result.ok) {
      return { definition, status: 'error', error: result.error };
    }
    checked = result.value;
  }
  const emptyText: string | null = emptyTextFor(checked);
  if (emptyText !== null) {
    return { definition, status: 'empty', emptyText };
  }
  return { definition, status: 'ok', data: checked as WidgetData };
}

/** A widget that failed, with the reason. */
export function failedWidget(
  definition: WidgetDefinition,
  error: string
): ErrorWidget {
  return { definition, status: 'error', error };
}

/** Loading placeholders for definitions, before their data arrives. */
export function loadingWidgets(
  definitions: readonly WidgetDefinition[]
): LoadingWidget[] {
  return definitions.map((definition) => ({ definition, status: 'loading' }));
}

/**
 * The cache key for a widget under these options. With resolved option
 * `values`, choices that differ from the defaults are appended, so "top 5 by
 * units" and "top 10 by revenue" are cached apart, while a widget on its
 * defaults keeps its plain key.
 */
export function cacheKeyFor(
  definition: WidgetDefinition,
  options: ResolveOptions,
  values?: OptionValues
): string {
  const base: string =
    options.cacheKey === undefined
      ? definition.key
      : options.cacheKey(definition);
  return values === undefined
    ? base
    : `${base}${optionsCacheSuffix(definition, values, options)}`;
}

/** The resolved option values for a widget under these resolve options. */
export function optionValuesFor(
  definition: WidgetDefinition,
  options: ResolveOptions
): OptionValues {
  return resolveOptionValues(
    definition,
    options.optionValues?.[definition.key],
    options
  );
}

/**
 * Applies the options marked `apply: 'client'` to an `ok` widget's payload and
 * records the resolved values on the widget (when it declares options). Other
 * widgets only get the values. Returns the same object when nothing changes.
 */
export function finalizeWidget<W extends DashboardWidget>(
  widget: W,
  values: OptionValues
): W {
  if (Object.keys(values).length === 0) return widget;
  if (widget.status === 'ok') {
    const data: WidgetData = applyClientOptions(
      widget.definition,
      widget.data,
      values
    );
    return { ...widget, data, options: values };
  }
  return { ...widget, options: values };
}

/** Thrown inside the resolver when a load is canceled or times out. */
class LoadInterruption extends Error {}

/**
 * Runs one widget's provider, capturing a throw, a timeout, a cancellation or
 * a bad payload as an error widget. Never rejects.
 */
export async function resolveWidget<C extends WidgetContext>(
  definition: WidgetDefinition,
  provider: WidgetProvider<C> | undefined,
  context: C,
  options: ResolveOptions = {}
): Promise<ResolvedWidget> {
  const values: OptionValues = optionValuesFor(definition, options);
  return finalizeWidget(
    await resolveWidgetUnapplied(definition, provider, context, options),
    values
  );
}

/**
 * Like `resolveWidget`, but leaves the payload as the provider returned it:
 * options marked `apply: 'client'` are not applied (see `finalizeWidget`). For
 * loaders that keep the payload so a client-side choice can change without
 * asking the provider again.
 */
export async function resolveWidgetUnapplied<C extends WidgetContext>(
  definition: WidgetDefinition,
  provider: WidgetProvider<C> | undefined,
  context: C,
  options: ResolveOptions = {}
): Promise<ResolvedWidget> {
  const values: OptionValues = optionValuesFor(definition, options);
  const quotedKey: string = JSON.stringify(definition.key);
  if (provider === undefined) {
    return failedWidget(
      definition,
      `Widget ${quotedKey}: no provider is registered for this key.`
    );
  }
  if (options.signal?.aborted === true) {
    return failedWidget(
      definition,
      `Widget ${quotedKey}: loading was canceled before it started.`
    );
  }

  const controller = new AbortController();
  const onExternalAbort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  let timedOut = false;
  const timeoutMs: number | undefined =
    options.timeoutMs !== undefined && options.timeoutMs > 0
      ? options.timeoutMs
      : undefined;
  const timer: ReturnType<typeof setTimeout> | undefined =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          controller.abort(new Error(`Timed out after ${timeoutMs} ms.`));
        }, timeoutMs);

  // Rejects when the load is aborted, so a provider that ignores its signal
  // is still abandoned instead of holding the widget in "loading".
  const interrupted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(new LoadInterruption()),
      { once: true }
    );
  });

  let payload: WidgetPayload;
  try {
    payload = await Promise.race([
      Promise.resolve().then(() => {
        // Cancelled before the provider got a turn: never call it.
        if (controller.signal.aborted) throw new LoadInterruption();
        return provider(context, definition, {
          signal: controller.signal,
          options: values,
        });
      }),
      interrupted,
    ]);
  } catch (cause: unknown) {
    if (cause instanceof LoadInterruption) {
      return failedWidget(
        definition,
        timedOut
          ? `Widget ${quotedKey}: provider timed out after ${timeoutMs} ms.`
          : `Widget ${quotedKey}: loading was canceled.`
      );
    }
    return failedWidget(
      definition,
      `Widget ${quotedKey}: provider failed: ${describeUnknownError(cause)}`
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  const resolved: ResolvedWidget = resolvePayload(definition, payload, options);
  if (resolved.status !== 'ok') return resolved;

  const storedAt: number = Date.now();
  if (options.cache !== undefined) {
    try {
      await options.cache.set(cacheKeyFor(definition, options, values), {
        payload: resolved.data,
        storedAt,
      });
    } catch {
      // A failing cache must never fail the widget.
    }
  }
  return { ...resolved, updatedAt: storedAt };
}

/**
 * The widgets a viewer can see: active, allowed for `roles`, in sort order.
 */
export function widgetsFor(
  definitions: readonly WidgetDefinition[],
  roles: readonly string[] | undefined
): WidgetDefinition[] {
  return sortDefinitions(
    definitions.filter((definition) => isWidgetVisibleTo(definition, roles))
  );
}

/**
 * Resolves every widget the context's roles may see, in parallel. Inactive
 * and role-filtered widgets are skipped (and their providers never run).
 * Results come back in sort order; a provider that throws, is missing or
 * returns a bad payload yields an `error` widget and never rejects.
 */
export async function resolveWidgets<C extends WidgetContext>(
  definitions: readonly WidgetDefinition[],
  providers: WidgetProviders<C>,
  context: C,
  options: ResolveOptions = {}
): Promise<ResolvedWidget[]> {
  const visible: WidgetDefinition[] = widgetsFor(definitions, context.roles);
  return Promise.all(
    visible.map((definition) =>
      resolveWidget(
        definition,
        Object.prototype.hasOwnProperty.call(providers, definition.key)
          ? providers[definition.key]
          : undefined,
        context,
        options
      )
    )
  );
}
