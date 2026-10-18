/**
 * Storing and loading builder-made definitions as JSON. The consumer keeps the
 * text wherever it likes (a database column, a file); these functions make it
 * stable, versioned, and safe to read back: a row that no longer fits its
 * source is skipped with a reason, never rendered as a broken card.
 */

import {
  describeUnknownError,
  err,
  ok,
  type Result,
  type WidgetDefinition,
} from '../core/index.js';
import { checkAgainstSource } from './check.js';
import type { SourceDescription } from './source.js';

/** The shape of the stored envelope. Bump when a definition's shape changes. */
export const DEFINITIONS_VERSION = 1;

/** Definition fields in the order they are written, for stable diffs. */
const FIELD_ORDER: readonly string[] = [
  'key',
  'title',
  'description',
  'kind',
  'source',
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
  'options',
  'filters',
  'views',
  'defaultView',
  'baseViewLabel',
];

function orderedDefinition(definition: WidgetDefinition): object {
  const record = definition as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const field of FIELD_ORDER) {
    if (record[field] !== undefined) ordered[field] = record[field];
  }
  // Anything unlisted (a newer field) keeps its place after the known ones.
  for (const field of Object.keys(record)) {
    if (!(field in ordered) && record[field] !== undefined) {
      ordered[field] = record[field];
    }
  }
  return ordered;
}

/** One definition as stable, pretty JSON text. */
export function serializeDefinition(definition: WidgetDefinition): string {
  return JSON.stringify(orderedDefinition(definition), null, 2);
}

/** A list of definitions in the versioned envelope. */
export function serializeDefinitions(
  definitions: readonly WidgetDefinition[]
): string {
  return JSON.stringify(
    {
      version: DEFINITIONS_VERSION,
      definitions: definitions.map(orderedDefinition),
    },
    null,
    2
  );
}

/** A definition and the source that feeds it. */
export interface ParsedDefinition {
  readonly definition: WidgetDefinition;
  readonly source: SourceDescription;
}

function checkRow(
  value: unknown,
  sources: readonly SourceDescription[]
): Result<ParsedDefinition> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return err('Widget definition must be an object.');
  }
  const row = value as { key?: unknown; source?: unknown };
  const label =
    typeof row.key === 'string'
      ? `Widget ${JSON.stringify(row.key)}`
      : 'Widget definition';
  if (typeof row.source !== 'string') {
    return err(`${label}: source must be the key of a registered source.`);
  }
  const source = sources.find((s) => s.key === row.source);
  if (source === undefined) {
    return err(
      `${label}: source ${JSON.stringify(row.source)} is not registered (${sources.map((s) => JSON.stringify(s.key)).join(', ') || 'none are'}).`
    );
  }
  const checked = checkAgainstSource(source, value as WidgetDefinition);
  return checked.ok ? ok({ definition: checked.value, source }) : checked;
}

function parseJson(text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch (cause) {
    return err(`Not valid JSON: ${describeUnknownError(cause)}`);
  }
}

/**
 * One stored definition: valid JSON, a registered source, and a definition
 * that source allows. Run it on the server before saving and before serving.
 */
export function parseDefinition(
  text: string,
  sources: readonly SourceDescription[]
): Result<ParsedDefinition> {
  const json = parseJson(text);
  if (!json.ok) return json;
  return checkRow(json.value, sources);
}

/** A stored row that was left out, and why. */
export interface SkippedDefinition {
  /** The row's key when it had one, else its position as `#n`. */
  readonly key: string;
  readonly error: string;
}

export interface ParsedDefinitions {
  readonly definitions: readonly WidgetDefinition[];
  readonly skipped: readonly SkippedDefinition[];
}

/**
 * A stored list. Valid rows come back; the others are listed in `skipped`
 * with the reason, so one bad row doesn't blank a dashboard and an admin can
 * see what was dropped. The envelope itself must be readable and a version
 * this code knows, else the whole call is an error.
 */
export function parseDefinitions(
  text: string,
  sources: readonly SourceDescription[]
): Result<ParsedDefinitions> {
  const json = parseJson(text);
  if (!json.ok) return json;
  const envelope = json.value as {
    version?: unknown;
    definitions?: unknown;
  } | null;
  if (typeof envelope !== 'object' || envelope === null) {
    return err(
      'Stored definitions must be an object with a "definitions" list.'
    );
  }
  if (envelope.version !== DEFINITIONS_VERSION) {
    return err(
      `Stored definitions are version ${JSON.stringify(envelope.version)}; this code reads version ${DEFINITIONS_VERSION}.`
    );
  }
  if (!Array.isArray(envelope.definitions)) {
    return err('Stored definitions must have a "definitions" list.');
  }
  const definitions: WidgetDefinition[] = [];
  const skipped: SkippedDefinition[] = [];
  const seen = new Set<string>();
  (envelope.definitions as unknown[]).forEach((row, index) => {
    const rowKey =
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { key?: unknown }).key === 'string'
        ? (row as { key: string }).key
        : `#${index + 1}`;
    const checked = checkRow(row, sources);
    if (!checked.ok) {
      skipped.push({ key: rowKey, error: checked.error });
    } else if (seen.has(rowKey)) {
      skipped.push({
        key: rowKey,
        error: `Widget ${JSON.stringify(rowKey)} appears twice; the first is kept.`,
      });
    } else {
      seen.add(rowKey);
      definitions.push(checked.value.definition);
    }
  });
  return ok({ definitions, skipped });
}

export interface MergedDefinitions {
  /** Code definitions first, then the stored ones that did not clash. */
  readonly definitions: readonly WidgetDefinition[];
  /** Stored definitions dropped because a code definition has their key. */
  readonly clashes: readonly SkippedDefinition[];
}

/**
 * Code definitions plus stored ones. A stored definition never replaces a code
 * definition with the same key: the code one wins and the clash is reported.
 */
export function mergeDefinitions(
  codeDefinitions: readonly WidgetDefinition[],
  storedDefinitions: readonly WidgetDefinition[]
): MergedDefinitions {
  const taken = new Set<string>(codeDefinitions.map((d) => d.key));
  const definitions: WidgetDefinition[] = [...codeDefinitions];
  const clashes: SkippedDefinition[] = [];
  for (const stored of storedDefinitions) {
    if (taken.has(stored.key)) {
      clashes.push({
        key: stored.key,
        error: `Widget ${JSON.stringify(stored.key)} is already defined in code (or stored twice); the stored one is ignored.`,
      });
      continue;
    }
    taken.add(stored.key);
    definitions.push(stored);
  }
  return { definitions, clashes };
}
