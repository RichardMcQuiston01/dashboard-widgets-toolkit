/**
 * Viewer-created widgets: a policy narrows what the builder functions allow
 * for someone who is not an administrator, and one pure function checks a save
 * against it on the server. The library knows nothing about identities, roles
 * or storage: the consumer builds a `BuilderPolicy` for the signed-in user and
 * stores each viewer's widgets under their own id.
 */

import {
  MAX_WIDGET_OPTIONS,
  MAX_WIDGET_VIEWS,
  err,
  ok,
  validateWidgetDefinition,
  type Result,
  type WidgetDefinition,
} from '../core/index.js';
import { WIDGET_KEY_PATTERN, checkAgainstSource } from './check.js';
import { PATCHABLE_FIELDS, newWidget, type PatchableField } from './edit.js';
import type { SourceDescription } from './source.js';
import { parseDefinitions, serializeDefinition } from './store.js';

/** The plain fields a viewer may set unless the policy says otherwise. */
export const DEFAULT_VIEWER_EDITABLE: readonly PatchableField[] = [
  'title',
  'description',
  'width',
  'defaultView',
];

/** The longest a stored viewer widget may be, as serialized JSON, by default. */
export const DEFAULT_VIEWER_MAX_SIZE = 8000;

/** The longest key prefix a policy may use, leaving room for the rest of a key. */
export const MAX_KEY_PREFIX_LENGTH = 40;

/** What one viewer may do in the builder. Build it on the server, per user. */
export interface BuilderPolicy {
  /**
   * Source keys the viewer may build on. An allow-list: empty or absent means
   * none (only sources both listed here and registered are offered).
   */
  readonly sources: readonly string[];
  /** The most widgets the viewer may own. */
  readonly maxWidgets: number;
  /**
   * Every widget key starts with this, derived on the server from the
   * authenticated user's id (for example `u-8f3a-`), never from the request.
   * It must end with a separator (`-`, `_`, `.` or `:`), so `u-1-` is never the
   * start of user `u-12-`'s keys.
   */
  readonly keyPrefix: string;
  /**
   * Plain fields the viewer may set. Default: `title`, `description`, `width`,
   * `defaultView`. Fields that widen who sees a widget, pin it, or cost the
   * server more (`roles`, `locked`, `active`, `page`, `filters`, `detail`,
   * sizes) are off unless listed here.
   */
  readonly editable?: readonly PatchableField[];
  /** The most options one widget may expose. Default: the library's maximum. */
  readonly maxOptions?: number;
  /** The most views one widget may add. Default: the library's maximum. */
  readonly maxViews?: number;
  /** The largest stored widget, as serialized JSON. Default 8000 characters. */
  readonly maxSize?: number;
}

function isCount(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/** Checks a policy is coherent. Returns it, or every problem found. */
export function validateBuilderPolicy(
  policy: BuilderPolicy
): Result<BuilderPolicy> {
  const problems: string[] = [];
  if (
    !Array.isArray(policy.sources) ||
    policy.sources.some((key) => typeof key !== 'string' || key.trim() === '')
  ) {
    problems.push('sources must list non-empty source keys.');
  } else if (new Set(policy.sources).size !== policy.sources.length) {
    problems.push('sources lists a key twice.');
  }
  if (!isCount(policy.maxWidgets, 0, 10_000)) {
    problems.push('maxWidgets must be a whole number from 0 to 10000.');
  }
  if (
    typeof policy.keyPrefix !== 'string' ||
    !WIDGET_KEY_PATTERN.test(policy.keyPrefix) ||
    policy.keyPrefix.length > MAX_KEY_PREFIX_LENGTH
  ) {
    problems.push(
      `keyPrefix must be 2 to ${MAX_KEY_PREFIX_LENGTH} letters, digits, "_", "-", "." or ":", starting with a letter or digit, got ${JSON.stringify(policy.keyPrefix)}.`
    );
  } else if (!/[_.:-]$/.test(policy.keyPrefix)) {
    // "u1" would also match user "u12"'s keys: the prefix must end in a separator.
    problems.push(
      `keyPrefix ${JSON.stringify(policy.keyPrefix)} must end with "_", "-", "." or ":", so one user's prefix is never the start of another's (u-1- and u-12-).`
    );
  }
  if (policy.editable !== undefined) {
    const unknown = policy.editable.filter(
      (field) => !(PATCHABLE_FIELDS as readonly string[]).includes(field)
    );
    if (unknown.length > 0) {
      problems.push(
        `editable names ${unknown.map((f) => JSON.stringify(f)).join(', ')}, which a viewer cannot be given (${PATCHABLE_FIELDS.join(', ')}).`
      );
    }
    if (new Set(policy.editable).size !== policy.editable.length) {
      problems.push('editable lists a field twice.');
    }
  }
  if (
    policy.maxOptions !== undefined &&
    !isCount(policy.maxOptions, 0, MAX_WIDGET_OPTIONS)
  ) {
    problems.push(
      `maxOptions must be a whole number from 0 to ${MAX_WIDGET_OPTIONS}.`
    );
  }
  if (
    policy.maxViews !== undefined &&
    !isCount(policy.maxViews, 0, MAX_WIDGET_VIEWS)
  ) {
    problems.push(
      `maxViews must be a whole number from 0 to ${MAX_WIDGET_VIEWS}.`
    );
  }
  if (
    policy.maxSize !== undefined &&
    !isCount(policy.maxSize, 200, 1_000_000)
  ) {
    problems.push('maxSize must be a whole number from 200 to 1000000.');
  }
  return problems.length > 0
    ? err(`Builder policy: ${problems.join(' ')}`)
    : ok(policy);
}

/**
 * Identity helper that gives a policy its type and checks it. A bad policy is
 * built from the server's own code, so this throws instead of returning a
 * Result.
 */
export function defineBuilderPolicy<const P extends BuilderPolicy>(
  policy: P
): P {
  const checked = validateBuilderPolicy(policy);
  if (!checked.ok) {
    throw new Error(checked.error);
  }
  return policy;
}

/** The plain fields the policy lets the viewer set. */
export function editableFields(
  policy: BuilderPolicy
): readonly PatchableField[] {
  return policy.editable ?? DEFAULT_VIEWER_EDITABLE;
}

/** The most options one widget may expose under the policy. */
export function optionLimit(policy: BuilderPolicy): number {
  return policy.maxOptions ?? MAX_WIDGET_OPTIONS;
}

/** The most views one widget may add under the policy. */
export function viewLimit(policy: BuilderPolicy): number {
  return policy.maxViews ?? MAX_WIDGET_VIEWS;
}

/** How many more options the widget may expose; `Infinity` without a policy. */
export function optionsLeft(
  policy: BuilderPolicy | undefined,
  definition: WidgetDefinition
): number {
  return policy === undefined
    ? Infinity
    : optionLimit(policy) - (definition.options ?? []).length;
}

/** How many more views the widget may add; `Infinity` without a policy. */
export function viewsLeft(
  policy: BuilderPolicy | undefined,
  definition: WidgetDefinition
): number {
  return policy === undefined
    ? Infinity
    : viewLimit(policy) - (definition.views ?? []).length;
}

/** The sources the viewer may pick from: listed in the policy and registered. */
export function viewerSources(
  policy: BuilderPolicy,
  sources: readonly SourceDescription[]
): readonly SourceDescription[] {
  const allowed = new Set<string>(policy.sources);
  return sources.filter((source) => allowed.has(source.key));
}

/**
 * A key for a new widget: the policy's prefix plus `base`, made unique among
 * `existing` (`prefix-base`, `prefix-base-2`, ...) and short enough to be valid.
 */
export function viewerWidgetKey(
  policy: BuilderPolicy,
  base: string,
  existing: readonly string[]
): string {
  const room = 64 - policy.keyPrefix.length - 4;
  const cleaned =
    base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]+/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .slice(0, Math.max(1, room)) || 'widget';
  const taken = new Set<string>(existing);
  const first = `${policy.keyPrefix}${cleaned}`;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n += 1) {
    const candidate = `${policy.keyPrefix}${cleaned}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Fields the editable rule does not compare: they have their own limits. */
const STRUCTURAL_FIELDS: readonly string[] = ['options', 'views'];

/**
 * The problems with `definition` that do not depend on who saved it before:
 * the source, the key prefix, the option, view and size limits.
 */
function limitProblems(
  policy: BuilderPolicy,
  definition: WidgetDefinition
): string[] {
  const problems: string[] = [];
  if (!policy.sources.includes(definition.source ?? '')) {
    problems.push(
      `source ${JSON.stringify(definition.source)} is not one this viewer may build on.`
    );
  }
  if (
    !definition.key.startsWith(policy.keyPrefix) ||
    definition.key.length === policy.keyPrefix.length
  ) {
    problems.push(
      `key must start with ${JSON.stringify(policy.keyPrefix)} and have more after it.`
    );
  }
  const options = (definition.options ?? []).length;
  if (options > optionLimit(policy)) {
    problems.push(
      `it exposes ${options} options; the most this viewer may is ${optionLimit(policy)}.`
    );
  }
  const views = (definition.views ?? []).length;
  if (views > viewLimit(policy)) {
    problems.push(
      `it has ${views} views; the most this viewer may add is ${viewLimit(policy)}.`
    );
  }
  const size = serializeDefinition(definition).length;
  const maxSize = policy.maxSize ?? DEFAULT_VIEWER_MAX_SIZE;
  if (size > maxSize) {
    problems.push(`it is ${size} characters stored; the most is ${maxSize}.`);
  }
  return problems;
}

/** What `validateViewerSave` takes. */
export interface ViewerSaveInput {
  readonly policy: BuilderPolicy;
  /** Every registered source description (the policy picks among them). */
  readonly sources: readonly SourceDescription[];
  /** What the browser sent. Untrusted. */
  readonly submitted: unknown;
  /** The stored widget this replaces; absent for a new one. */
  readonly previous?: WidgetDefinition | undefined;
  /** Every widget this viewer already owns, for the quota. */
  readonly owned: readonly WidgetDefinition[];
}

/**
 * Checks a viewer's save against their policy and returns the definition to
 * store. Run it on the server before every save, with a policy the server built
 * from the authenticated user.
 *
 * It refuses a submission that is not a valid definition for its source; a
 * source outside the policy; a key without the policy's prefix, or one that
 * changes on an update; a new widget past `maxWidgets` or reusing an owned key;
 * more options or views than the policy allows; a stored size over the limit;
 * and any field outside `editable` that differs from the stored widget (on a new
 * widget, from what `newWidget` makes), so a viewer cannot send `roles` or
 * `locked` at all, and a value an administrator set survives their edits.
 *
 * It is pure: it cannot see two saves racing. Count and insert in one
 * transaction, or two simultaneous saves can both pass the quota.
 */
export function validateViewerSave(
  input: ViewerSaveInput
): Result<WidgetDefinition> {
  const { policy, sources, submitted, previous, owned } = input;
  const generic = validateWidgetDefinition(submitted);
  if (!generic.ok) return generic;
  const definition = generic.value;
  const subject = `Widget ${JSON.stringify(definition.key)}`;
  const source = sources.find((s) => s.key === definition.source);
  if (source === undefined) {
    return err(
      `${subject}: source ${JSON.stringify(definition.source)} is not registered.`
    );
  }
  const checked = checkAgainstSource(source, definition);
  if (!checked.ok) return checked;
  const problems = limitProblems(policy, definition);
  if (previous !== undefined) {
    if (previous.key !== definition.key) {
      problems.push(
        `key cannot change (it is ${JSON.stringify(previous.key)}).`
      );
    }
    if (previous.source !== definition.source) {
      problems.push(
        `source cannot change (it is ${JSON.stringify(previous.source)}).`
      );
    }
  } else {
    if (owned.some((d) => d.key === definition.key)) {
      problems.push('a widget with this key already exists.');
    }
    const others = owned.filter((d) => d.key !== definition.key).length;
    if (others >= policy.maxWidgets) {
      problems.push(
        `this viewer already owns ${others} widget(s); the most is ${policy.maxWidgets}.`
      );
    }
  }
  // Anything outside `editable` must be what it already was, or what a new
  // widget starts with.
  const expected: WidgetDefinition | undefined =
    previous ??
    (() => {
      const baseline = newWidget(source, {
        key: definition.key,
        title: definition.title,
      });
      return baseline.ok ? baseline.value : undefined;
    })();
  if (expected !== undefined) {
    const allowed = new Set<string>([
      ...editableFields(policy),
      ...STRUCTURAL_FIELDS,
      'key',
    ]);
    // A title is how a new widget is named, so only an update compares it.
    if (previous === undefined) allowed.add('title');
    const now = definition as unknown as Record<string, unknown>;
    const before = expected as unknown as Record<string, unknown>;
    for (const field of new Set([
      ...Object.keys(now),
      ...Object.keys(before),
    ])) {
      if (allowed.has(field)) continue;
      if (canonical(now[field]) !== canonical(before[field])) {
        problems.push(`${field} is not a field this viewer may change.`);
      }
    }
  }
  return problems.length > 0
    ? err(`${subject}: ${problems.join(' ')}`)
    : ok(definition);
}

/** What `parseViewerDefinitions` found. */
export interface ParsedViewerDefinitions {
  readonly definitions: readonly WidgetDefinition[];
  /** Rows left out: unreadable, unregistered, or no longer allowed, each with the reason. */
  readonly skipped: readonly { readonly key: string; readonly error: string }[];
}

/**
 * Reads a viewer's stored widgets back. Like `parseDefinitions`, plus the
 * policy: a row whose source the viewer may no longer use, whose key lacks the
 * prefix, or that is over a limit is skipped with the reason, never deleted, so
 * the viewer sees what was hidden and a wider policy brings it back. Fields an
 * administrator set (`roles`, `locked`) are fine: only `validateViewerSave`
 * holds a viewer's edits to `editable`. The number of rows is not limited here:
 * a stored row still counts toward the quota until it is deleted.
 */
export function parseViewerDefinitions(
  text: string,
  sources: readonly SourceDescription[],
  policy: BuilderPolicy
): Result<ParsedViewerDefinitions> {
  const parsed = parseDefinitions(text, sources);
  if (!parsed.ok) return parsed;
  const definitions: WidgetDefinition[] = [];
  const skipped = [...parsed.value.skipped];
  for (const definition of parsed.value.definitions) {
    const problems = limitProblems(policy, definition);
    if (problems.length > 0) {
      skipped.push({
        key: definition.key,
        error: `Widget ${JSON.stringify(definition.key)}: ${problems.join(' ')}`,
      });
    } else {
      definitions.push(definition);
    }
  }
  return ok({ definitions, skipped });
}
