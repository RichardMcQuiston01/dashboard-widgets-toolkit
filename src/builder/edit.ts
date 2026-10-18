/**
 * Create and edit a widget definition without breaking it. Every function is
 * pure and returns a new definition (or a Result), and none returns one that
 * `validateWidgetDefinition` or `checkAgainstSource` would reject.
 */

import {
  MAX_WIDGET_OPTIONS,
  coerceOptionValue,
  err,
  kindLabel,
  ok,
  type OptionValue,
  type Result,
  type WidgetDefinition,
  type WidgetKind,
  type WidgetOption,
  type WidgetView,
} from '../core/index.js';
import { WIDGET_KEY_PATTERN, checkAgainstSource } from './check.js';
import type { SourceDescription } from './source.js';

/** The fields `updateWidget` may change. Options and views have their own functions. */
export const PATCHABLE_FIELDS = [
  'title',
  'description',
  'sortOrder',
  'roles',
  'active',
  'defaultSize',
  'width',
  'minWidth',
  'maxWidth',
  'fill',
  'detail',
  'tableControls',
  'locked',
  'page',
  'filters',
  'defaultView',
  'baseViewLabel',
] as const;

export type PatchableField = (typeof PATCHABLE_FIELDS)[number];

/** A change to a definition. A field set to `undefined` is removed. */
export type WidgetPatch = {
  readonly [K in PatchableField]?: WidgetDefinition[K] | undefined;
};

/** A definition with `key` and `title` set, as `newWidget` takes them. */
export interface NewWidgetInput {
  readonly key: string;
  readonly title: string;
}

/** A view the builder can add to a widget. */
export interface ViewChoice {
  readonly key: string;
  readonly label: string;
  readonly kind: WidgetKind;
  /** Pass this to `addView`. */
  readonly view: WidgetView;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Starts a widget over `source`: its kind, its filters, nothing else. */
export function newWidget(
  source: SourceDescription,
  input: NewWidgetInput
): Result<WidgetDefinition> {
  if (!WIDGET_KEY_PATTERN.test(input.key)) {
    return err(
      `Widget key ${JSON.stringify(input.key)} must be 1 to 64 letters, digits, "_", "-", "." or ":", starting with a letter or digit.`
    );
  }
  const definition: Mutable<WidgetDefinition> = {
    key: input.key,
    title: input.title,
    kind: source.kind,
    source: source.key,
  };
  if (source.filters !== undefined) {
    definition.filters = [...source.filters];
  }
  return checkAgainstSource(source, definition);
}

/** Suggests a key from `base` that none of `existing` uses (`base`, `base-2`, ...). */
export function uniqueWidgetKey(
  base: string,
  existing: readonly string[]
): string {
  const cleaned =
    base
      .trim()
      .replace(/[^A-Za-z0-9_.:-]+/g, '-')
      .replace(/^[^A-Za-z0-9]+/, '')
      .slice(0, 56) || 'widget';
  const taken = new Set<string>(existing);
  if (!taken.has(cleaned)) return cleaned;
  for (let n = 2; ; n += 1) {
    const candidate = `${cleaned}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function applyPatch(
  definition: WidgetDefinition,
  patch: WidgetPatch
): Result<WidgetDefinition> {
  const next: Record<string, unknown> = { ...definition };
  for (const [field, value] of Object.entries(patch)) {
    if (!(PATCHABLE_FIELDS as readonly string[]).includes(field)) {
      return err(
        `Widget ${JSON.stringify(definition.key)}: ${JSON.stringify(field)} is not a field updateWidget changes (${PATCHABLE_FIELDS.join(', ')}); options and views have their own functions, and key, kind and source are fixed.`
      );
    }
    if (value === undefined) {
      delete next[field];
    } else {
      next[field] = value;
    }
  }
  return ok(next as unknown as WidgetDefinition);
}

/** Changes plain fields. Returns the new definition, or what is wrong with it. */
export function updateWidget(
  source: SourceDescription,
  definition: WidgetDefinition,
  patch: WidgetPatch
): Result<WidgetDefinition> {
  const patched = applyPatch(definition, patch);
  if (!patched.ok) return patched;
  return checkAgainstSource(source, patched.value);
}

/**
 * Every problem a patch would cause, by field (empty when it is fine), for
 * showing next to form fields. A problem that comes from fields together is
 * under the empty key. Produces no definition.
 */
export function validatePatch(
  source: SourceDescription,
  definition: WidgetDefinition,
  patch: WidgetPatch
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of Object.keys(patch)) {
    const single = updateWidget(source, definition, {
      [field]: (patch as Record<string, unknown>)[field],
    } as WidgetPatch);
    if (!single.ok) problems[field] = single.error;
  }
  if (Object.keys(problems).length === 0) {
    const whole = updateWidget(source, definition, patch);
    if (!whole.ok) problems[''] = whole.error;
  }
  return problems;
}

/** Overrides when exposing an option. */
export interface ExposeOptionOverrides {
  readonly label?: string;
  readonly default?: OptionValue;
}

/**
 * Exposes one of the source's options on the widget, with the source's
 * default unless `overrides.default` (which must fit the option).
 */
export function exposeOption(
  source: SourceDescription,
  definition: WidgetDefinition,
  optionKey: string,
  overrides: ExposeOptionOverrides = {}
): Result<WidgetDefinition> {
  const subject = `Widget ${JSON.stringify(definition.key)}`;
  const template = source.options?.find((o) => o.key === optionKey);
  if (template === undefined) {
    return err(
      `${subject}: source ${JSON.stringify(source.key)} offers no option ${JSON.stringify(optionKey)} (it offers ${(source.options ?? []).map((o) => JSON.stringify(o.key)).join(', ') || 'none'}).`
    );
  }
  if ((definition.options ?? []).some((o) => o.key === optionKey)) {
    return err(
      `${subject}: option ${JSON.stringify(optionKey)} is already exposed; hide it first to change its template.`
    );
  }
  if ((definition.options ?? []).length >= MAX_WIDGET_OPTIONS) {
    return err(
      `${subject}: a widget may declare at most ${MAX_WIDGET_OPTIONS} options.`
    );
  }
  const option: Record<string, unknown> = { ...template };
  if (overrides.label !== undefined) {
    if (overrides.label.trim() === '') {
      return err(`${subject}: option label must not be empty.`);
    }
    option['label'] = overrides.label;
  }
  if (overrides.default !== undefined) {
    const value = coerceOptionValue(template, overrides.default);
    if (value === undefined) {
      return err(
        `${subject}: ${JSON.stringify(overrides.default)} is not a valid default for option ${JSON.stringify(optionKey)}.`
      );
    }
    option['default'] = value;
  }
  return checkAgainstSource(source, {
    ...definition,
    options: [...(definition.options ?? []), option as unknown as WidgetOption],
  });
}

/** Removes an option from the widget. Unchanged when it is not exposed. */
export function hideOption(
  definition: WidgetDefinition,
  optionKey: string
): WidgetDefinition {
  if (!(definition.options ?? []).some((o) => o.key === optionKey)) {
    return definition;
  }
  const { options, ...rest } = definition;
  const kept = (options ?? []).filter((o) => o.key !== optionKey);
  return kept.length === 0 ? rest : { ...rest, options: kept };
}

/**
 * The views the source allows that the widget does not have yet: the
 * source's own views, and the conversions its columns and kind support.
 */
export function availableViews(
  source: SourceDescription,
  definition: WidgetDefinition
): readonly ViewChoice[] {
  const choices: ViewChoice[] = [];
  const add = (view: WidgetView): void => {
    choices.push({
      key: view.key,
      label: view.label,
      kind: view.kind,
      view,
    });
  };
  for (const supplied of source.views ?? []) {
    add({ key: supplied.key, label: supplied.label, kind: supplied.kind });
  }
  const columns = source.columns ?? [];
  if (source.kind === 'TABLE') {
    const numericAt = columns.flatMap((c, i) =>
      c.numeric === true ? [i] : []
    );
    const labelAt = columns.flatMap((c, i) => (c.numeric === true ? [] : [i]));
    for (const l of labelAt) {
      for (const v of numericAt) {
        const text = `${columns[v]?.label ?? ''} by ${columns[l]?.label ?? ''}`;
        add({
          key: `bars-${l}-${v}`,
          label: `${text} (bars)`,
          kind: 'BAR_LIST',
          convert: { type: 'tableToBarList', label: l, value: v },
        });
      }
      if (numericAt.length > 0) {
        const names = numericAt.map((v) => columns[v]?.label ?? '').join(', ');
        const text = `${names} by ${columns[l]?.label ?? ''}`;
        for (const chartType of ['bar', 'line'] as const) {
          add({
            key: `${chartType}-chart-${l}`,
            label: `${text} (${chartType} chart)`,
            kind: 'GRAPH',
            convert: {
              type: 'tableToGraph',
              label: l,
              values: numericAt,
              chartType,
            },
          });
        }
      }
    }
  } else if (source.kind === 'BAR_LIST') {
    add({
      key: 'table',
      label: kindLabel('TABLE'),
      kind: 'TABLE',
      convert: { type: 'barListToTable' },
    });
    for (const chartType of ['bar', 'line'] as const) {
      add({
        key: `${chartType}-chart`,
        label: `${chartType === 'bar' ? 'Bar' : 'Line'} chart`,
        kind: 'GRAPH',
        convert: { type: 'barListToGraph', chartType },
      });
    }
  } else if (source.kind === 'GRAPH') {
    add({
      key: 'table',
      label: kindLabel('TABLE'),
      kind: 'TABLE',
      convert: { type: 'graphToTable' },
    });
  }
  const have = new Set<string>((definition.views ?? []).map((v) => v.key));
  return choices.filter(
    (choice) => !have.has(choice.key) && choice.key !== 'base'
  );
}

/** Adds a view the source can serve. */
export function addView(
  source: SourceDescription,
  definition: WidgetDefinition,
  view: WidgetView
): Result<WidgetDefinition> {
  return checkAgainstSource(source, {
    ...definition,
    views: [...(definition.views ?? []), view],
  });
}

/**
 * Removes a view. Unchanged when it isn't there. A `defaultView` that named it
 * goes back to the base view.
 */
export function removeView(
  definition: WidgetDefinition,
  viewKey: string
): WidgetDefinition {
  if (!(definition.views ?? []).some((v) => v.key === viewKey)) {
    return definition;
  }
  const { views, defaultView, ...rest } = definition;
  const kept = (views ?? []).filter((v) => v.key !== viewKey);
  const next: Mutable<WidgetDefinition> = { ...rest };
  if (kept.length > 0) next.views = kept;
  if (defaultView !== undefined && defaultView !== viewKey) {
    next.defaultView = defaultView;
  }
  return next;
}
