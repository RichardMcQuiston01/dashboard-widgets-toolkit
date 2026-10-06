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

/** Loads one widget's payload. May be sync or async; may throw. */
export type WidgetProvider<C = WidgetContext> = (
  context: C,
  definition: WidgetDefinition
) => WidgetPayload | Promise<WidgetPayload>;

/** Providers keyed by widget key. */
export type WidgetProviders<C = WidgetContext> = Readonly<
  Record<string, WidgetProvider<C>>
>;

export interface OkWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'ok';
  readonly data: WidgetData;
}

export interface EmptyWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'empty';
  /** Why there is nothing to show, e.g. "No orders synced yet." */
  readonly emptyText: string;
}

export interface ErrorWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'error';
  /** Names the widget and what failed. */
  readonly error: string;
}

/** One widget after its provider ran. */
export type ResolvedWidget = OkWidget | EmptyWidget | ErrorWidget;

/** A widget whose data hasn't arrived yet (for client-side loading states). */
export interface LoadingWidget {
  readonly definition: WidgetDefinition;
  readonly status: 'loading';
}

/** Anything a dashboard can render: resolved, or still loading. */
export type DashboardWidget = ResolvedWidget | LoadingWidget;

export type WidgetStatus = DashboardWidget['status'];

export interface ResolveOptions {
  /**
   * Validate each provider's payload with `validateWidgetData` (and check
   * its kind matches the definition). Default true; turn off only for
   * trusted, typed providers.
   */
  readonly validate?: boolean;
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

/** Runs one widget's provider, capturing a throw or bad payload as an error. */
export async function resolveWidget<C extends WidgetContext>(
  definition: WidgetDefinition,
  provider: WidgetProvider<C> | undefined,
  context: C,
  options: ResolveOptions = {}
): Promise<ResolvedWidget> {
  if (provider === undefined) {
    return failedWidget(
      definition,
      `Widget ${JSON.stringify(definition.key)}: no provider is registered for this key.`
    );
  }
  let payload: WidgetPayload;
  try {
    payload = await provider(context, definition);
  } catch (cause: unknown) {
    return failedWidget(
      definition,
      `Widget ${JSON.stringify(definition.key)}: provider failed: ${describeUnknownError(cause)}`
    );
  }
  return resolvePayload(definition, payload, options);
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
