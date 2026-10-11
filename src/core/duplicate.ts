/**
 * Making and deleting clones (see `clones.ts`): the layout changes behind a
 * "Duplicate" and a "Delete" control. Inputs are never mutated; a refusal is
 * a `Result` with a specific message, and a no-op returns the same object.
 */

import {
  cloneNumber,
  withClones,
  type CloneOptions,
  type WidgetClone,
} from './clones.js';
import { resolveWidgetLock } from './definition.js';
import {
  visibleWidgets,
  type DashboardLayout,
  type LayoutPage,
} from './layout.js';
import {
  assignPages,
  hasPages,
  pageLayout,
  pageRoom,
  withPageLayout,
  type PageItem,
  type PageOptions,
} from './pages.js';
import { err, ok, type Result } from './result.js';
import {
  MAX_WIDGET_TITLE_LENGTH,
  effectiveDefinitions,
  type LayoutSettings,
  type WidgetViewerSettings,
} from './settings.js';

/** Options for `duplicateWidget`. */
export interface DuplicateOptions extends PageOptions, CloneOptions {}

/** What `duplicateWidget` returns: the new layout and the clone's key. */
export interface Duplicated {
  readonly layout: DashboardLayout;
  /** The new clone's key, for opening its Options dialog. */
  readonly key: string;
}

/** Whether a widget (or the widget a clone copies) may be duplicated. */
export function canDuplicate(
  definitions: readonly PageItem[],
  key: string,
  options: CloneOptions = {}
): boolean {
  const definition: PageItem | undefined = definitions.find(
    (d) => d.key === key
  );
  if (definition === undefined) return false;
  if (options.overrideLocks === true) return true;
  const sourceKey: string =
    (definition as { sourceKey?: string }).sourceKey ?? definition.key;
  const original: PageItem | undefined = definitions.find(
    (d) => d.key === sourceKey
  );
  return original !== undefined && !resolveWidgetLock(original).clone;
}

/** `from#n`, with n one more than the highest number used for that original. */
export function nextCloneKey(
  definitions: readonly { readonly key: string }[],
  layout: { readonly clones?: readonly WidgetClone[] },
  fromKey: string
): string {
  const taken = new Set<string>([
    ...definitions.map((d) => d.key),
    ...(layout.clones ?? []).map((c) => c.key),
  ]);
  let highest = 0;
  for (const clone of layout.clones ?? []) {
    if (clone.from === fromKey) {
      highest = Math.max(highest, cloneNumber(clone.key) ?? 0);
    }
  }
  let n: number = highest + 1;
  while (taken.has(`${fromKey}#${n}`)) n += 1;
  return `${fromKey}#${n}`;
}

/**
 * A title for a clone shown with another view: "Recent Orders Line Chart".
 * Cut to the title limit.
 */
export function suggestedViewTitle(title: string, viewLabel: string): string {
  return `${title} ${viewLabel}`.trim().slice(0, MAX_WIDGET_TITLE_LENGTH);
}

/**
 * Duplicates a widget into a clone placed right after it. The copy starts
 * with the widget's own width, view and option values (not its title, which
 * is "Title (#n)"). Cloning a clone clones the original. Refused for an
 * unknown widget, when the original's `locked.clone` forbids it, and, in a
 * paged layout, when the page has no room for the clone's width.
 *
 * Pass the definitions you render with (clones included, as `withClones`
 * returns them).
 */
export function duplicateWidget<T extends PageItem>(
  definitions: readonly T[],
  layout: DashboardLayout,
  key: string,
  options: DuplicateOptions = {}
): Result<Duplicated> {
  const widget: T | undefined = definitions.find((d) => d.key === key);
  if (widget === undefined) {
    return err(`Widget ${JSON.stringify(key)} isn't on this dashboard.`);
  }
  const originalKey: string =
    (widget as { sourceKey?: string }).sourceKey ?? widget.key;
  if (!canDuplicate(definitions, key, options)) {
    return err(
      `Widget ${JSON.stringify(originalKey)} is locked against duplicating.`
    );
  }
  const cloneKey: string = nextCloneKey(definitions, layout, originalKey);
  const copiedSettings: WidgetViewerSettings | undefined = (() => {
    const mine: WidgetViewerSettings | undefined = layout.settings?.[key];
    if (mine === undefined) return undefined;
    const { title: _title, ...rest } = mine;
    void _title;
    return Object.keys(rest).length === 0 ? undefined : rest;
  })();
  const settings: LayoutSettings | undefined =
    copiedSettings === undefined
      ? layout.settings
      : { ...layout.settings, [cloneKey]: copiedSettings };
  let next: DashboardLayout = {
    ...layout,
    clones: [...(layout.clones ?? []), { key: cloneKey, from: originalKey }],
    ...(settings === undefined ? {} : { settings }),
  };
  const all: readonly T[] = withClones(definitions, next, options);

  // Place it right after the widget it was made from, on that widget's page.
  const assigned: Map<string, T[]> = assignPages(all, next);
  const pageKey: string | undefined = [...assigned].find(([, widgets]) =>
    widgets.some((w) => w.key === key)
  )?.[0];
  if (pageKey !== undefined) {
    const view: DashboardLayout | undefined = pageLayout(next, pageKey);
    const onPage: T[] = assigned.get(pageKey) ?? [];
    if (view !== undefined) {
      const shown: string[] = visibleWidgets(onPage, view)
        .filter((d) => !resolveWidgetLock(d).move && d.key !== cloneKey)
        .map((d) => d.key);
      const at: number = shown.indexOf(key);
      const order: string[] =
        at === -1
          ? [...shown, cloneKey]
          : [...shown.slice(0, at + 1), cloneKey, ...shown.slice(at + 1)];
      next = withPageLayout(next, pageKey, { ...view, order });
    }
  }

  if (hasPages(next) && pageKey !== undefined) {
    const effective: T[] = effectiveDefinitions(all, next, options);
    const room = pageRoom(effective, next, pageKey, options);
    if (room !== undefined && room.rowsUsed > room.maxRows) {
      const page: LayoutPage | undefined = next.pages?.find(
        (p) => p.key === pageKey
      );
      const width: number | undefined = effective.find(
        (d) => d.key === cloneKey
      )?.width;
      return err(
        `Page "${page?.title ?? pageKey}" has no room for a widget${
          width === undefined ? '' : ` ${width} wide`
        } (it holds ${room.maxRows} rows).`
      );
    }
  }
  return ok({ layout: next, key: cloneKey });
}

/**
 * Removes a clone from the layout: its entry, its settings, and its place in
 * every order, hidden and minimized list. Originals can't be deleted (hide
 * them), so any other key returns the layout unchanged.
 */
export function deleteClone(
  layout: DashboardLayout,
  key: string
): DashboardLayout {
  if (layout.clones?.some((clone) => clone.key === key) !== true) return layout;
  const without = (keys: readonly string[]): readonly string[] =>
    keys.includes(key) ? keys.filter((k) => k !== key) : keys;
  const { clones, settings, ...rest } = layout;
  const remaining: WidgetClone[] = (clones ?? []).filter((c) => c.key !== key);
  const { [key]: _gone, ...otherSettings } = settings ?? {};
  void _gone;
  return {
    ...rest,
    order: without(layout.order),
    hidden: without(layout.hidden),
    minimized: without(layout.minimized),
    ...(layout.pages === undefined
      ? {}
      : {
          pages: layout.pages.map((page) => ({
            ...page,
            order: without(page.order),
            hidden: without(page.hidden),
            minimized: without(page.minimized),
          })),
        }),
    ...(Object.keys(otherSettings).length === 0
      ? {}
      : { settings: otherSettings }),
    ...(remaining.length === 0 ? {} : { clones: remaining }),
  };
}
