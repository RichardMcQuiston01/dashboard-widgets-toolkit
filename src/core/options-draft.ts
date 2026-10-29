import type { WidgetDefinition } from './definition.js';
import {
  defaultOptionValue,
  type DATE_RANGE_PRESETS,
  type OptionValue,
  type WidgetOption,
} from './options.js';
import {
  isFlexible,
  type WidgetSettingsPatch,
  type WidgetViewerSettings,
} from './settings.js';
import { effectiveViewKey } from './views.js';

/**
 * The state of an Options dialog while it is open: what the viewer has typed or
 * chosen, before Apply. The dialogs of every renderer share it, so they agree
 * on what counts as a change.
 */
export interface OptionsDraft {
  readonly title: string;
  readonly width: number | undefined;
  readonly flexible: boolean | undefined;
  readonly options: Readonly<Record<string, OptionValue>>;
  readonly view: string | undefined;
}

/** A draft that stands for the settings a widget already has. */
export function optionsDraftFrom(
  settings: WidgetViewerSettings | undefined
): OptionsDraft {
  return {
    title: settings?.title ?? '',
    width: settings?.width,
    flexible: settings?.flexible,
    options: settings?.options ?? {},
    view: settings?.view,
  };
}

/**
 * The author's default as stored in settings. A date range keeps its preset
 * (`last30`) rather than the interval it resolves to today.
 */
export function storedOptionDefault(
  option: WidgetOption
): OptionValue | undefined {
  return option.type === 'dateRange'
    ? option.default
    : defaultOptionValue(option);
}

function sameStoredValue(
  a: OptionValue | undefined,
  b: OptionValue | undefined
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

/**
 * The patch a draft stands for: only what differs from the author's
 * defaults, so choosing the default again clears the setting.
 */
export function optionsPatchFrom(
  definition: WidgetDefinition,
  draft: OptionsDraft
): WidgetSettingsPatch {
  const title: string = draft.title.trim();
  const options: Record<string, OptionValue> = {};
  for (const option of definition.options ?? []) {
    const value: OptionValue | undefined = draft.options[option.key];
    if (value === undefined) continue;
    if (sameStoredValue(value, storedOptionDefault(option))) continue;
    options[option.key] = value;
  }
  return {
    title: title === '' ? undefined : title,
    width: draft.width,
    flexible:
      draft.flexible === undefined ||
      draft.flexible === isFlexible(definition, undefined)
        ? undefined
        : draft.flexible,
    options: Object.keys(options).length === 0 ? undefined : options,
    // Choosing the author's own default view again clears the setting.
    view:
      draft.view === undefined ||
      draft.view === effectiveViewKey(definition, undefined)
        ? undefined
        : draft.view,
  };
}

/** A stable string for a patch, to tell whether two patches are the same. */
export function optionsPatchKey(patch: WidgetSettingsPatch): string {
  const options: Record<string, OptionValue> = {};
  for (const key of Object.keys(patch.options ?? {}).sort()) {
    options[key] = (patch.options as Record<string, OptionValue>)[
      key
    ] as OptionValue;
  }
  return JSON.stringify([
    patch.title,
    patch.width,
    patch.flexible,
    options,
    patch.view,
  ]);
}

/** The patch that clears every setting. */
export const EMPTY_SETTINGS_PATCH: WidgetSettingsPatch = {
  title: undefined,
  width: undefined,
  flexible: undefined,
  options: undefined,
  view: undefined,
};

/** The words for the built-in date range presets. */
export const DATE_RANGE_PRESET_LABELS: Readonly<
  Record<(typeof DATE_RANGE_PRESETS)[number], string>
> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisYear: 'This year',
  lastYear: 'Last year',
};
