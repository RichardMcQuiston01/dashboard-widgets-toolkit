/**
 * A viewer's own choices for a widget: a title, a width and values for the
 * options its author declared. They live in the layout (`layout.settings`),
 * so the consumer's existing persistence saves them, and they override what
 * the definition says without changing it. Pure functions, no I/O.
 */

import {
  resolveWidgetLock,
  type WidgetDefinition,
  type WidgetFill,
} from './definition.js';
import { MAX_WIDGET_WIDTH, MIN_WIDGET_WIDTH, isWidgetWidth } from './grid.js';
import { BASE_VIEW_KEY, findView, isProviderView } from './views.js';
import {
  coerceOptionValue,
  defaultOptionValue,
  sameOptionValues,
  type OptionValue,
  type OptionValues,
  type WidgetOption,
} from './options.js';

/** What one viewer chose for one widget. Every field is optional. */
export interface WidgetViewerSettings {
  /** Replaces the widget's title. Plain text, at most 80 characters. */
  readonly title?: string;
  /** Share of the row in twelfths, within the definition's min and max. */
  readonly width?: number;
  /** May grow into the columns left over in its row (see `fill`). */
  readonly flexible?: boolean;
  /** Values for declared options, by option key. */
  readonly options?: Readonly<Record<string, OptionValue>>;
  /** The view to show: `base` or a key from the definition's `views`. */
  readonly view?: string;
}

/** Viewer settings by widget key. */
export type LayoutSettings = Readonly<Record<string, WidgetViewerSettings>>;

/** Longest title a viewer can give a widget; longer ones are cut. */
export const MAX_WIDGET_TITLE_LENGTH = 80;
/**
 * Most widgets `parseLayout` keeps settings for: a safety ceiling against
 * malformed or hostile JSON, not a product limit.
 */
export const MAX_PARSED_SETTINGS = 500;

const MAX_COLUMN_LIST = 100;
const MAX_VALUE_LENGTH = 500;

/** What these functions need from a definition. */
export type SettingsItem = Pick<WidgetDefinition, 'key'> &
  Partial<
    Pick<
      WidgetDefinition,
      | 'title'
      | 'width'
      | 'minWidth'
      | 'maxWidth'
      | 'fill'
      | 'locked'
      | 'options'
      | 'views'
      | 'defaultView'
    >
  >;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOptionValue(value: unknown): OptionValue | undefined {
  if (typeof value === 'string') {
    return value.length <= MAX_VALUE_LENGTH ? value : undefined;
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value) && value.length <= MAX_COLUMN_LIST) {
    return value.every(
      (entry) => typeof entry === 'string' && entry.length <= MAX_VALUE_LENGTH
    )
      ? (value as readonly string[])
      : undefined;
  }
  return undefined;
}

function parseOne(raw: unknown): WidgetViewerSettings | undefined {
  if (!isRecord(raw)) return undefined;
  const title: unknown = raw['title'];
  const width: unknown = raw['width'];
  const flexible: unknown = raw['flexible'];
  const options: unknown = raw['options'];
  const view: unknown = raw['view'];
  const cleanTitle: string =
    typeof title === 'string'
      ? title.trim().slice(0, MAX_WIDGET_TITLE_LENGTH)
      : '';
  const chosen: Record<string, OptionValue> = {};
  if (isRecord(options)) {
    for (const [key, value] of Object.entries(options)) {
      const parsed: OptionValue | undefined = parseOptionValue(value);
      if (parsed !== undefined) chosen[key] = parsed;
    }
  }
  const settings: WidgetViewerSettings = {
    ...(cleanTitle === '' ? {} : { title: cleanTitle }),
    ...(isWidgetWidth(width) ? { width } : {}),
    ...(typeof flexible === 'boolean' ? { flexible } : {}),
    ...(Object.keys(chosen).length === 0 ? {} : { options: chosen }),
    ...(typeof view === 'string' && view !== '' && view.length <= 80
      ? { view }
      : {}),
  };
  return Object.keys(settings).length === 0 ? undefined : settings;
}

/**
 * Reads the `settings` field of a saved layout. Anything malformed is
 * dropped (wrong types, titles over the limit are cut, widths outside 2 to
 * 12), never an error. Returns undefined when nothing usable is left.
 */
export function parseSettings(raw: unknown): LayoutSettings | undefined {
  if (!isRecord(raw)) return undefined;
  const parsed: Record<string, WidgetViewerSettings> = {};
  for (const [key, value] of Object.entries(raw).slice(
    0,
    MAX_PARSED_SETTINGS
  )) {
    if (key === '') continue;
    const one: WidgetViewerSettings | undefined = parseOne(value);
    if (one !== undefined) parsed[key] = one;
  }
  return Object.keys(parsed).length === 0 ? undefined : parsed;
}

/** The JSON-ready form of `layout.settings`; fields keep a stable order. */
export function serializeSettings(
  settings: LayoutSettings | undefined
): Record<string, WidgetViewerSettings> | undefined {
  if (settings === undefined) return undefined;
  const out: Record<string, WidgetViewerSettings> = {};
  for (const key of Object.keys(settings)) {
    const one: WidgetViewerSettings | undefined = settings[key];
    if (one === undefined) continue;
    const piece: WidgetViewerSettings = {
      ...(one.title === undefined ? {} : { title: one.title }),
      ...(one.width === undefined ? {} : { width: one.width }),
      ...(one.flexible === undefined ? {} : { flexible: one.flexible }),
      ...(one.options === undefined || Object.keys(one.options).length === 0
        ? {}
        : { options: { ...one.options } }),
      ...(one.view === undefined ? {} : { view: one.view }),
    };
    if (Object.keys(piece).length > 0) out[key] = piece;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** The narrowest and widest share a widget may take. */
export function widthRange(item: Pick<SettingsItem, 'minWidth' | 'maxWidth'>): {
  readonly min: number;
  readonly max: number;
} {
  const min: number = isWidgetWidth(item.minWidth)
    ? item.minWidth
    : MIN_WIDGET_WIDTH;
  const max: number = isWidgetWidth(item.maxWidth)
    ? item.maxWidth
    : MAX_WIDGET_WIDTH;
  return { min, max: Math.max(min, max) };
}

const WIDTH_SHARES: Readonly<Record<number, string>> = {
  2: '1/6',
  3: '1/4',
  4: '1/3',
  5: '5/12',
  6: '1/2',
  7: '7/12',
  8: '2/3',
  9: '3/4',
  10: '5/6',
  11: '11/12',
  12: 'Full',
};

/** A width as a share of the row: 2 is `1/6`, 6 is `1/2`, 12 is `Full`. */
export function widthShareLabel(width: number): string {
  return WIDTH_SHARES[width] ?? `${width}/12`;
}

/** Whether the lock on this widget forbids viewer settings. */
export function isOptionsLocked(item: Pick<SettingsItem, 'locked'>): boolean {
  return resolveWidgetLock(item).options;
}

/** `fill` with width filling turned on or off, height filling untouched. */
function fillWith(
  fill: WidgetFill | undefined,
  flexible: boolean
): WidgetFill | undefined {
  const heightToo: boolean = fill === 'height' || fill === 'both';
  if (flexible) return heightToo ? 'both' : 'width';
  return heightToo ? 'height' : undefined;
}

/** Whether the widget grows into free columns: the viewer's choice, else its `fill`. */
export function isFlexible(
  item: Pick<SettingsItem, 'fill'>,
  settings: WidgetViewerSettings | undefined
): boolean {
  if (settings?.flexible !== undefined) return settings.flexible;
  return item.fill === 'width' || item.fill === 'both';
}

/**
 * The definition as this viewer sees it: their title, their width (kept
 * within the definition's limits) and their choice of Flexible applied on
 * top of the author's. Returns the same object when there is nothing to
 * apply. Options are not part of the definition; read them with
 * `widgetOptionValues`.
 */
export function applySettings<D extends SettingsItem>(
  definition: D,
  settings: WidgetViewerSettings | undefined
): D {
  if (settings === undefined) return definition;
  const range = widthRange(definition);
  const width: number | undefined =
    settings.width === undefined
      ? undefined
      : Math.min(range.max, Math.max(range.min, settings.width));
  const title: string | undefined =
    settings.title === undefined || settings.title.trim() === ''
      ? undefined
      : settings.title;
  const flexibleChanged: boolean =
    settings.flexible !== undefined &&
    settings.flexible !== isFlexible(definition, undefined);
  if (title === undefined && width === undefined && !flexibleChanged) {
    return definition;
  }
  const next: { -readonly [K in keyof D]: D[K] } = { ...definition };
  if (title !== undefined) next.title = title;
  if (width !== undefined) next.width = width;
  if (flexibleChanged) {
    const fill: WidgetFill | undefined = fillWith(
      definition.fill,
      settings.flexible === true
    );
    if (fill === undefined) {
      delete next.fill;
    } else {
      next.fill = fill;
    }
  }
  return next;
}

/**
 * The definitions with each viewer's settings applied. A widget whose lock
 * forbids options (`locked.options`) ignores them, so a saved layout can't
 * reach around a lock. Pass `overrideLocks` for an administrator.
 */
export function effectiveDefinitions<D extends SettingsItem>(
  definitions: readonly D[],
  layout: { readonly settings?: LayoutSettings },
  options: { readonly overrideLocks?: boolean } = {}
): D[] {
  return definitions.map((definition) =>
    options.overrideLocks !== true && isOptionsLocked(definition)
      ? definition
      : applySettings(definition, layout.settings?.[definition.key])
  );
}

/**
 * The chosen option values for a widget, resolved: the viewer's where valid,
 * else the author's defaults. Empty when it declares no options.
 */
export function widgetOptionValues(
  definition: Pick<SettingsItem, 'options'>,
  settings: WidgetViewerSettings | undefined
): OptionValues {
  const declared: readonly WidgetOption[] = definition.options ?? [];
  const values: Record<string, OptionValue> = {};
  for (const option of declared) {
    const picked: unknown = settings?.options?.[option.key];
    const value: OptionValue | undefined =
      (picked === undefined ? undefined : coerceOptionValue(option, picked)) ??
      defaultOptionValue(option);
    if (value !== undefined) values[option.key] = value;
  }
  return values;
}

/**
 * What to pass `useWidgets({ optionValues })` so the data follows the
 * layout: for every widget that declares options, the viewer's chosen
 * values (empty when they haven't chosen, which means the defaults). Every
 * such widget is listed so Reset sends its defaults back to the provider.
 */
export function optionValuesFromLayout(
  definitions: readonly Pick<SettingsItem, 'key' | 'options' | 'locked'>[],
  layout: { readonly settings?: LayoutSettings },
  options: { readonly overrideLocks?: boolean } = {}
): Record<string, Readonly<Record<string, OptionValue>>> {
  const out: Record<string, Readonly<Record<string, OptionValue>>> = {};
  for (const definition of definitions) {
    if (definition.options === undefined || definition.options.length === 0) {
      continue;
    }
    const locked: boolean =
      options.overrideLocks !== true && isOptionsLocked(definition);
    out[definition.key] = locked
      ? {}
      : (layout.settings?.[definition.key]?.options ?? {});
  }
  return out;
}

/**
 * What to pass `useWidgets({ viewValues })` so views the provider supplies
 * follow the layout: for every widget that declares one, the viewer's chosen
 * view key, or an empty string for no choice (its `defaultView`). Listing
 * every such widget means a cleared choice reaches the loader too. Widgets
 * with only converted views are left out: they need no provider call.
 */
export function viewValuesFromLayout(
  definitions: readonly Pick<SettingsItem, 'key' | 'views' | 'locked'>[],
  layout: { readonly settings?: LayoutSettings },
  options: { readonly overrideLocks?: boolean } = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const definition of definitions) {
    if (!(definition.views ?? []).some(isProviderView)) continue;
    const locked: boolean =
      options.overrideLocks !== true && isOptionsLocked(definition);
    out[definition.key] = locked
      ? ''
      : (layout.settings?.[definition.key]?.view ?? '');
  }
  return out;
}

/** Fields `setWidgetSettings` can change; `undefined` clears one. */
export interface WidgetSettingsPatch {
  readonly title?: string | undefined;
  readonly width?: number | undefined;
  readonly flexible?: boolean | undefined;
  /** Replaces all of the widget's option values (`undefined` clears them). */
  readonly options?: Readonly<Record<string, OptionValue>> | undefined;
  /** The view key (`base` or a declared view); `undefined` clears it. */
  readonly view?: string | undefined;
}

function sameSettings(
  a: WidgetViewerSettings | undefined,
  b: WidgetViewerSettings | undefined
): boolean {
  if (a === b) return true;
  return (
    a?.title === b?.title &&
    a?.width === b?.width &&
    a?.flexible === b?.flexible &&
    a?.view === b?.view &&
    sameOptionValues(a?.options ?? {}, b?.options ?? {})
  );
}

type LayoutWithSettings<L> = L & { readonly settings?: LayoutSettings };

/**
 * A layout with `patch` applied to one widget's settings. Fields the patch
 * names as `undefined` are cleared; others stay. An entry left empty is
 * removed. Returns the same layout when nothing changes.
 */
export function setWidgetSettings<L extends object>(
  layout: LayoutWithSettings<L>,
  key: string,
  patch: WidgetSettingsPatch
): LayoutWithSettings<L> {
  const before: WidgetViewerSettings | undefined = layout.settings?.[key];
  const draft: Record<string, unknown> = { ...before };
  for (const field of [
    'title',
    'width',
    'flexible',
    'options',
    'view',
  ] as const) {
    if (!(field in patch)) continue;
    const value: unknown = patch[field];
    if (value === undefined) {
      delete draft[field];
    } else {
      draft[field] = value;
    }
  }
  const merged: WidgetViewerSettings | undefined = parseOne(draft);
  if (sameSettings(before, merged)) return layout;
  const rest: Record<string, WidgetViewerSettings> = { ...layout.settings };
  if (merged === undefined) {
    delete rest[key];
  } else {
    rest[key] = merged;
  }
  const { settings: _previous, ...others } = layout;
  void _previous;
  return Object.keys(rest).length === 0
    ? (others as LayoutWithSettings<L>)
    : ({ ...others, settings: rest } as LayoutWithSettings<L>);
}

/** A layout without one widget's settings (Reset to defaults). */
export function clearWidgetSettings<L extends object>(
  layout: LayoutWithSettings<L>,
  key: string
): LayoutWithSettings<L> {
  if (layout.settings?.[key] === undefined) return layout;
  return setWidgetSettings(layout, key, {
    title: undefined,
    width: undefined,
    flexible: undefined,
    options: undefined,
    view: undefined,
  });
}

/** Lower-cased, trimmed and Unicode-normalized, for comparing titles. */
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').trim().toLowerCase();
}

/**
 * Whether another widget already shows `title`: compared trimmed,
 * case-insensitive and Unicode-normalized, against the other widgets'
 * effective titles. A dialog uses it to refuse a duplicate.
 */
export function isTitleInUse<D extends SettingsItem>(
  definitions: readonly D[],
  layout: { readonly settings?: LayoutSettings },
  key: string,
  title: string
): boolean {
  const wanted: string = normalizeTitle(title);
  if (wanted === '') return false;
  return effectiveDefinitions(definitions, layout, {
    overrideLocks: true,
  }).some(
    (other) =>
      other.key !== key && normalizeTitle(other.title ?? other.key) === wanted
  );
}

/** `title (#2)`, `title (#3)`, ... cut to fit the limit, first one not taken. */
function uniqueTitle(taken: ReadonlySet<string>, title: string): string {
  if (!taken.has(normalizeTitle(title))) return title;
  for (let n = 2; ; n += 1) {
    const suffix = ` (#${n})`;
    const candidate: string = `${title.slice(0, MAX_WIDGET_TITLE_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(normalizeTitle(candidate))) return candidate;
  }
}

/** Options for `normalizeSettings`. */
export interface NormalizeSettingsOptions {
  /** Keep settings that a widget's `locked.options` forbids. */
  readonly overrideLocks?: boolean;
}

/**
 * Cleans a layout's settings against the definitions, for a save endpoint:
 * drops settings of unknown widgets and of widgets locked against options,
 * clamps widths to `minWidth` and `maxWidth`, trims titles, drops option
 * values the definition didn't declare or that aren't valid for their
 * option, and makes titles unique by appending "(#n)". Idempotent; returns
 * the same layout when nothing changes.
 */
export function normalizeSettings<D extends SettingsItem, L extends object>(
  definitions: readonly D[],
  layout: LayoutWithSettings<L>,
  options: NormalizeSettingsOptions = {}
): LayoutWithSettings<L> {
  const settings: LayoutSettings | undefined = layout.settings;
  if (settings === undefined) return layout;
  const cleaned: Record<string, WidgetViewerSettings> = {};
  // Titles other widgets show without a viewer rename are taken first.
  const taken = new Set<string>();
  for (const definition of definitions) {
    const renamed: boolean =
      settings[definition.key]?.title !== undefined &&
      (options.overrideLocks === true || !isOptionsLocked(definition));
    if (!renamed) taken.add(normalizeTitle(definition.title ?? definition.key));
  }
  for (const definition of definitions) {
    const one: WidgetViewerSettings | undefined = settings[definition.key];
    if (one === undefined) continue;
    if (options.overrideLocks !== true && isOptionsLocked(definition)) continue;
    const range = widthRange(definition);
    const chosen: Record<string, OptionValue> = {};
    for (const option of definition.options ?? []) {
      const picked: unknown = one.options?.[option.key];
      if (picked === undefined) continue;
      const value: OptionValue | undefined = coerceOptionValue(option, picked);
      // A date range keeps its preset (`last30`), which resolves to today's
      // interval when read; storing the interval would go stale.
      if (value !== undefined) {
        chosen[option.key] =
          option.type === 'dateRange' ? (picked as OptionValue) : value;
      }
    }
    let title: string | undefined = one.title;
    if (title !== undefined) {
      title = title.trim().slice(0, MAX_WIDGET_TITLE_LENGTH);
      if (title === '') {
        title = undefined;
      } else {
        title = uniqueTitle(taken, title);
        taken.add(normalizeTitle(title));
      }
    }
    const next: WidgetViewerSettings = {
      ...(title === undefined ? {} : { title }),
      ...(one.width === undefined
        ? {}
        : { width: Math.min(range.max, Math.max(range.min, one.width)) }),
      ...(one.flexible === undefined ? {} : { flexible: one.flexible }),
      ...(Object.keys(chosen).length === 0 ? {} : { options: chosen }),
      ...(one.view !== undefined &&
      (one.view === BASE_VIEW_KEY ||
        findView(definition, one.view) !== undefined)
        ? { view: one.view }
        : {}),
    };
    if (Object.keys(next).length > 0) {
      cleaned[definition.key] = sameSettings(one, next) ? one : next;
    }
  }
  const keys: string[] = Object.keys(cleaned);
  const unchanged: boolean =
    keys.length === Object.keys(settings).length &&
    keys.every((key) => cleaned[key] === settings[key]);
  if (unchanged) return layout;
  const { settings: _previous, ...others } = layout;
  void _previous;
  return keys.length === 0
    ? (others as LayoutWithSettings<L>)
    : ({ ...others, settings: cleaned } as LayoutWithSettings<L>);
}
