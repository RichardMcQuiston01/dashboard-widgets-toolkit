/**
 * Clones: copies of a widget a viewer made to keep it twice with different
 * settings (another view, width or option values). A clone is stored as
 * `{ key, from }` in `layout.clones`, its settings under its own key in
 * `layout.settings`, and it shares the original's provider. Pure functions,
 * no I/O.
 */

import { resolveWidgetLock, type WidgetDefinition } from './definition.js';
import { MAX_WIDGET_TITLE_LENGTH } from './settings.js';

/** A widget the viewer made from another. */
export interface WidgetClone {
  /** Unique across definitions and clones: `from#1`, `from#2`, ... */
  readonly key: string;
  /** The original's key. Always an original, never another clone. */
  readonly from: string;
}

/**
 * Most clones `parseLayout` keeps: a safety ceiling against malformed or
 * hostile JSON, not a product limit (a page's capacity is the real limit).
 */
export const MAX_PARSED_CLONES = 500;

/** What these functions need from a definition. */
export type CloneItem = Pick<WidgetDefinition, 'key'> &
  Partial<Pick<WidgetDefinition, 'title' | 'locked' | 'sourceKey'>>;

/** Options for the clone functions. */
export interface CloneOptions {
  /** Keep clones that a widget's `locked.clone` forbids (an administrator). */
  readonly overrideLocks?: boolean;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the `clones` field of a saved layout. Anything malformed is dropped
 * (wrong types, empty or repeated keys, a clone of itself). Returns undefined
 * when nothing usable is left.
 */
export function parseClones(raw: unknown): readonly WidgetClone[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const clones: WidgetClone[] = [];
  for (const entry of raw.slice(0, MAX_PARSED_CLONES) as unknown[]) {
    if (!isRecord(entry)) continue;
    const key: unknown = entry['key'];
    const from: unknown = entry['from'];
    if (
      typeof key !== 'string' ||
      typeof from !== 'string' ||
      key === '' ||
      from === '' ||
      key === from ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    clones.push({ key, from });
  }
  return clones.length === 0 ? undefined : clones;
}

/** The JSON-ready form of `layout.clones`; undefined when there are none. */
export function serializeClones(
  clones: readonly WidgetClone[] | undefined
): WidgetClone[] | undefined {
  if (clones === undefined || clones.length === 0) return undefined;
  return clones.map(({ key, from }) => ({ key, from }));
}

/** The number in a clone key (`orders#3` is 3), or undefined. */
export function cloneNumber(key: string): number | undefined {
  const match: RegExpExecArray | null = /#(\d+)$/.exec(key);
  return match === null ? undefined : Number(match[1]);
}

/**
 * The clones that can exist for these definitions: the original is a real
 * widget (not itself a clone), the key doesn't shadow another widget, and the
 * original's `locked.clone` allows it. Returns the same array when nothing is
 * dropped. Clones already present as definitions (see `withClones`) count as
 * valid, so the function is idempotent.
 */
export function cleanClones<D extends CloneItem>(
  definitions: readonly D[],
  clones: readonly WidgetClone[] | undefined,
  options: CloneOptions = {}
): readonly WidgetClone[] | undefined {
  if (clones === undefined) return undefined;
  const byKey = new Map<string, D>(definitions.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const kept: WidgetClone[] = [];
  for (const clone of clones) {
    if (seen.has(clone.key)) continue;
    const original: D | undefined = byKey.get(clone.from);
    if (original === undefined || original.sourceKey !== undefined) continue;
    const existing: D | undefined = byKey.get(clone.key);
    if (existing !== undefined && existing.sourceKey !== clone.from) continue;
    if (options.overrideLocks !== true && resolveWidgetLock(original).clone) {
      continue;
    }
    seen.add(clone.key);
    kept.push(clone);
  }
  if (kept.length === 0) return undefined;
  return kept.length === clones.length && kept.every((c, i) => c === clones[i])
    ? clones
    : kept;
}

function defaultCloneTitle(
  original: CloneItem,
  clone: WidgetClone,
  index: number
): string {
  const base: string = original.title ?? original.key;
  const suffix = ` (#${cloneNumber(clone.key) ?? index + 1})`;
  return `${base.slice(0, MAX_WIDGET_TITLE_LENGTH - suffix.length)}${suffix}`;
}

/**
 * The definitions with each clone added right after its original. A clone's
 * definition copies the original's, with its own key, `sourceKey` set to the
 * original, the title "Original (#n)" and no locks (a clone is the viewer's
 * to move, hide and delete). Settings still apply on top (`effectiveDefinitions`).
 * Pass the result to `useWidgets` so clones load, and to the settings and
 * layout functions. Idempotent; returns the same array when there are no
 * clones to add.
 */
export function withClones<D extends CloneItem>(
  definitions: readonly D[],
  layout: { readonly clones?: readonly WidgetClone[] },
  options: CloneOptions = {}
): readonly D[] {
  const valid: readonly WidgetClone[] | undefined = cleanClones(
    definitions,
    layout.clones,
    options
  );
  if (valid === undefined) return definitions;
  const present = new Set<string>(definitions.map((d) => d.key));
  const toAdd: WidgetClone[] = valid.filter((c) => !present.has(c.key));
  if (toAdd.length === 0) return definitions;
  const out: D[] = [];
  for (const definition of definitions) {
    out.push(definition);
    toAdd.forEach((clone, index) => {
      if (clone.from !== definition.key) return;
      const copy = { ...definition } as D & {
        -readonly [K in keyof CloneItem]: CloneItem[K];
      };
      copy.key = clone.key;
      copy.sourceKey = definition.key;
      copy.title = defaultCloneTitle(definition, clone, index);
      delete copy.locked;
      out.push(copy);
    });
  }
  return out;
}
