import { useCallback, useMemo, useRef, useState } from 'react';

import {
  clearDraftField,
  commitDraft,
  draftCandidate,
  draftProblems,
  isDirty,
  newDraft,
  setDraftField,
  type DraftState,
} from '../builder/draft.js';
import {
  PATCHABLE_FIELDS,
  addView,
  exposeOption,
  hideOption,
  removeView,
  updateOption,
  type ExposeOptionOverrides,
  type PatchableField,
  type UpdateOptionChanges,
  type WidgetPatch,
} from '../builder/edit.js';
import {
  editableFields,
  optionLimit,
  optionsLeft,
  viewLimit,
  viewsLeft,
  type BuilderPolicy,
} from '../builder/policy.js';
import type { SourceDescription } from '../builder/source.js';
import type { WidgetDefinition } from '../core/definition.js';
import { err, type Result } from '../core/result.js';
import type { WidgetView } from '../core/views.js';

/** Options for `useWidgetDraft`. */
export interface UseWidgetDraftOptions {
  /**
   * Holds the form to a viewer's policy: only its `editable` fields can be
   * committed, and options and views stop at its limits. The server still runs
   * `validateViewerSave`; this is for the form's benefit.
   */
  readonly policy?: BuilderPolicy;
}

/** How many more options and views the draft may take; `Infinity` when unlimited. */
export interface DraftLimits {
  readonly optionsLeft: number;
  readonly viewsLeft: number;
}

/** What `useWidgetDraft` returns. */
export interface WidgetDraft {
  readonly source: SourceDescription;
  /** The plain fields the form may offer: the policy's `editable`, or every field. */
  readonly editable: readonly PatchableField[];
  readonly limits: DraftLimits;
  /** The last valid definition. */
  readonly definition: WidgetDefinition;
  /** Plain-field edits not committed yet. */
  readonly patch: WidgetPatch;
  /**
   * The definition with the pending edits applied, or `definition` while they
   * have problems. Preview this.
   */
  readonly candidate: WidgetDefinition;
  /** Problems with the pending edits, by field; `''` is a cross-field problem. */
  readonly problems: Readonly<Record<string, string>>;
  readonly dirty: boolean;
  /** Sets one plain field (`title`, `width`, `roles`, ...); `undefined` removes it. */
  readonly setField: <K extends keyof WidgetPatch>(
    field: K,
    value: WidgetPatch[K]
  ) => void;
  /** Drops one pending edit. */
  readonly clearField: (field: keyof WidgetPatch) => void;
  /** Applies the pending edits when they have no problems. */
  readonly commit: () => Result<WidgetDefinition>;
  /** Drops every pending edit. */
  readonly discard: () => void;
  /** Starts over from another definition (or the same one, saved). */
  readonly reset: (definition: WidgetDefinition) => void;
  /** These change the definition at once and return the outcome to show. */
  readonly exposeOption: (
    key: string,
    overrides?: ExposeOptionOverrides
  ) => Result<WidgetDefinition>;
  readonly updateOption: (
    key: string,
    changes: UpdateOptionChanges
  ) => Result<WidgetDefinition>;
  readonly hideOption: (key: string) => void;
  readonly addView: (view: WidgetView) => Result<WidgetDefinition>;
  readonly removeView: (key: string) => void;
}

/**
 * Draft state for a builder form. Plain fields are edited as a pending patch
 * (so an empty title never becomes a definition) and applied by `commit`;
 * options and views change the definition at once, each returning a Result.
 * `definition` is always valid for `source`.
 */
export function useWidgetDraft(
  source: SourceDescription,
  initial: WidgetDefinition,
  options: UseWidgetDraftOptions = {}
): WidgetDraft {
  const policy: BuilderPolicy | undefined = options.policy;
  const [state, setState] = useState<DraftState>(() => newDraft(initial));
  // Mirrors `state` synchronously so two calls in one event see each other.
  const latest = useRef<DraftState>(state);
  const update = useCallback((next: DraftState): void => {
    latest.current = next;
    setState(next);
  }, []);

  const structural = useCallback(
    (
      change: (definition: WidgetDefinition) => Result<WidgetDefinition>
    ): Result<WidgetDefinition> => {
      const result = change(latest.current.definition);
      if (result.ok) {
        update({ ...latest.current, definition: result.value });
      }
      return result;
    },
    [update]
  );

  return useMemo<WidgetDraft>(() => {
    const editable: readonly PatchableField[] =
      policy === undefined ? PATCHABLE_FIELDS : editableFields(policy);
    const subject = `Widget ${JSON.stringify(state.definition.key)}`;
    const limits: DraftLimits = {
      optionsLeft: optionsLeft(policy, state.definition),
      viewsLeft: viewsLeft(policy, state.definition),
    };
    const problems: Record<string, string> = {
      ...draftProblems(source, state),
    };
    for (const field of Object.keys(state.patch)) {
      if (!editable.includes(field as PatchableField)) {
        problems[field] = `${subject}: ${field} is not a field you may change.`;
      }
    }
    return {
      source,
      editable,
      limits,
      definition: state.definition,
      patch: state.patch,
      candidate:
        Object.keys(problems).length > 0 && isDirty(state)
          ? state.definition
          : draftCandidate(source, state),
      problems,
      dirty: isDirty(state),
      setField: (field, value) =>
        update(setDraftField(latest.current, field, value)),
      clearField: (field) => update(clearDraftField(latest.current, field)),
      commit: () => {
        const blocked = Object.keys(latest.current.patch).filter(
          (field) => !editable.includes(field as PatchableField)
        );
        if (blocked.length > 0) {
          return err(
            `${subject}: ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} not ${blocked.length === 1 ? 'a field' : 'fields'} you may change.`
          );
        }
        const committed = commitDraft(source, latest.current);
        if (!committed.ok) return committed;
        update(committed.value);
        return { ok: true, value: committed.value.definition };
      },
      discard: () => update(newDraft(latest.current.definition)),
      reset: (definition) => update(newDraft(definition)),
      exposeOption: (key, overrides) =>
        structural((d) =>
          optionsLeft(policy, d) <= 0
            ? err(
                `${subject}: the most options this widget may expose is ${policy === undefined ? '' : optionLimit(policy)}.`
              )
            : exposeOption(source, d, key, overrides)
        ),
      updateOption: (key, changes) =>
        structural((d) => updateOption(source, d, key, changes)),
      hideOption: (key) => {
        update({
          ...latest.current,
          definition: hideOption(latest.current.definition, key),
        });
      },
      addView: (view) =>
        structural((d) =>
          viewsLeft(policy, d) <= 0
            ? err(
                `${subject}: the most views this widget may add is ${policy === undefined ? '' : viewLimit(policy)}.`
              )
            : addView(source, d, view)
        ),
      removeView: (key) => {
        update({
          ...latest.current,
          definition: removeView(latest.current.definition, key),
        });
      },
    };
  }, [source, state, update, structural, policy]);
}
