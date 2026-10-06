/**
 * Maker Toolkit compatibility. Its API (`apps/api/src/widgets`) serves
 * `TEXT`, `GAUGE`, `TABLE` and `GRAPH` payloads; `TEXT` and `GAUGE` are
 * unchanged here, while `TABLE` and `GRAPH` grew richer shapes. These
 * helpers upgrade the older shapes so `validateWidgetData` accepts them.
 */

import type { WidgetDefinition } from './definition.js';
import { isWidgetKind } from './payload.js';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Upgrades a Maker Toolkit payload to this package's shape:
 *
 * - `TABLE` `{columns: string[], rows: string[][]}` → `{label}` columns and
 *   `{text}` cells.
 * - `GRAPH` `{points}` → one unnamed bar series with `valueFormat: 'number'`.
 *
 * Anything else, including payloads already in the new shape, is returned
 * unchanged. Validate the result with `validateWidgetData`.
 */
export function upgradeLegacyWidgetData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    record['kind'] === 'TABLE' &&
    isStringArray(record['columns']) &&
    Array.isArray(record['rows']) &&
    record['rows'].every(isStringArray)
  ) {
    const rows = record['rows'] as string[][];
    return {
      ...record,
      columns: record['columns'].map((label) => ({ label })),
      rows: rows.map((row) => row.map((text) => ({ text }))),
    };
  }
  if (
    record['kind'] === 'GRAPH' &&
    Array.isArray(record['points']) &&
    record['series'] === undefined
  ) {
    const { points, ...rest } = record;
    return {
      ...rest,
      series: [{ name: 'Value', points }],
      chartType: 'bar',
      valueFormat: 'number',
    };
  }
  return value;
}

/** Maker Toolkit's served widget definition (`WidgetDefinition` in its API). */
export interface LegacyWidgetDefinition {
  readonly widgetKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly viewType: string;
  readonly sortOrder: number;
}

/**
 * Maps a Maker Toolkit definition onto this package's. Returns null when
 * the view type isn't a known kind.
 */
export function fromLegacyDefinition(
  legacy: LegacyWidgetDefinition
): WidgetDefinition | null {
  if (!isWidgetKind(legacy.viewType)) {
    return null;
  }
  return {
    key: legacy.widgetKey,
    title: legacy.title,
    ...(legacy.description === null ? {} : { description: legacy.description }),
    kind: legacy.viewType,
    sortOrder: legacy.sortOrder,
  };
}
