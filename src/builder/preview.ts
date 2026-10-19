/**
 * Preview: a definition rendered over the source's `sample` payload, with no
 * provider call. The result is an ordinary widget for the renderers.
 */

import {
  BASE_VIEW_KEY,
  applyView,
  effectiveViewKey,
  err,
  findView,
  finalizeWidget,
  isProviderView,
  ok,
  resolveOptionValues,
  resolvePayload,
  type DashboardWidget,
  type OptionValues,
  type Result,
  type WidgetDefinition,
} from '../core/index.js';
import type { SourceDescription } from './source.js';

export interface PreviewOptions {
  /** The view to show: `base` or a view of the widget. Default: its `defaultView`. */
  readonly view?: string;
  /** Option values to try instead of the defaults (an admin testing a sort). */
  readonly optionValues?: OptionValues;
}

/**
 * The widget as a viewer would see it, made from `source.sample`: the payload
 * is validated against the widget's kind, client-applied options (sort,
 * columns) use their defaults or `optionValues`, and a converted view is built.
 * Fails with a message when the source has no sample, the sample is invalid,
 * or the chosen view is one only the provider can build.
 */
export function previewWidget(
  source: SourceDescription,
  definition: WidgetDefinition,
  options: PreviewOptions = {}
): Result<DashboardWidget> {
  const subject = `Widget ${JSON.stringify(definition.key)}`;
  if (source.sample === undefined) {
    return err(
      `${subject}: source ${JSON.stringify(source.key)} has no "sample" payload to preview with.`
    );
  }
  // The sample is the base payload, whatever view is chosen.
  const resolved = resolvePayload(definition, source.sample, {
    viewValues: { [definition.key]: BASE_VIEW_KEY },
  });
  if (resolved.status === 'error') return err(resolved.error);
  const values = resolveOptionValues(definition, options.optionValues);
  const finalized = finalizeWidget(resolved, values);
  const viewKey = effectiveViewKey(definition, options.view);
  if (viewKey !== BASE_VIEW_KEY) {
    const view = findView(definition, viewKey);
    if (view !== undefined && isProviderView(view)) {
      return err(
        `${subject}: view ${JSON.stringify(viewKey)} is built by the provider, and the sample only has the base view.`
      );
    }
  }
  return ok(applyView(finalized, viewKey));
}
