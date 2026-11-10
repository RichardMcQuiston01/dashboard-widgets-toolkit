import {
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue';

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
   * `validateViewerSave`; this is for the form's benefit. A ref or a getter
   * works, so it can follow state.
   */
  readonly policy?: MaybeRefOrGetter<BuilderPolicy | undefined>;
}

/** How many more options and views the draft may take; `Infinity` when unlimited. */
export interface DraftLimits {
  readonly optionsLeft: number;
  readonly viewsLeft: number;
}

/**
 * What `useWidgetDraft` returns. The properties are getters over reactive
 * state, so a render function or computed that reads them re-runs when the
 * draft changes (don't destructure them if you want that).
 */
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
 * `definition` is always valid for `source`. `source` may be a ref or a getter.
 */
export function useWidgetDraft(
  source: MaybeRefOrGetter<SourceDescription>,
  initial: WidgetDefinition,
  options: UseWidgetDraftOptions = {}
): WidgetDraft {
  const state: ShallowRef<DraftState> = shallowRef(newDraft(initial));
  const sourceNow = (): SourceDescription => toValue(source);
  const policyNow = (): BuilderPolicy | undefined => toValue(options.policy);

  function update(next: DraftState): void {
    state.value = next;
  }

  function structural(
    change: (definition: WidgetDefinition) => Result<WidgetDefinition>
  ): Result<WidgetDefinition> {
    const result = change(state.value.definition);
    if (result.ok) update({ ...state.value, definition: result.value });
    return result;
  }

  function editableNow(): readonly PatchableField[] {
    const policy = policyNow();
    return policy === undefined ? PATCHABLE_FIELDS : editableFields(policy);
  }

  function subject(): string {
    return `Widget ${JSON.stringify(state.value.definition.key)}`;
  }

  function problemsNow(): Record<string, string> {
    const editable = editableNow();
    const problems: Record<string, string> = {
      ...draftProblems(sourceNow(), state.value),
    };
    for (const field of Object.keys(state.value.patch)) {
      if (!editable.includes(field as PatchableField)) {
        problems[field] =
          `${subject()}: ${field} is not a field you may change.`;
      }
    }
    return problems;
  }

  return {
    get source(): SourceDescription {
      return sourceNow();
    },
    get editable(): readonly PatchableField[] {
      return editableNow();
    },
    get limits(): DraftLimits {
      const policy = policyNow();
      return {
        optionsLeft: optionsLeft(policy, state.value.definition),
        viewsLeft: viewsLeft(policy, state.value.definition),
      };
    },
    get definition(): WidgetDefinition {
      return state.value.definition;
    },
    get patch(): WidgetPatch {
      return state.value.patch;
    },
    get candidate(): WidgetDefinition {
      return Object.keys(problemsNow()).length > 0 && isDirty(state.value)
        ? state.value.definition
        : draftCandidate(sourceNow(), state.value);
    },
    get problems(): Readonly<Record<string, string>> {
      return problemsNow();
    },
    get dirty(): boolean {
      return isDirty(state.value);
    },
    setField: (field, value) =>
      update(setDraftField(state.value, field, value)),
    clearField: (field) => update(clearDraftField(state.value, field)),
    commit: () => {
      const editable = editableNow();
      const blocked = Object.keys(state.value.patch).filter(
        (field) => !editable.includes(field as PatchableField)
      );
      if (blocked.length > 0) {
        return err(
          `${subject()}: ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} not ${blocked.length === 1 ? 'a field' : 'fields'} you may change.`
        );
      }
      const committed = commitDraft(sourceNow(), state.value);
      if (!committed.ok) return committed;
      update(committed.value);
      return { ok: true, value: committed.value.definition };
    },
    discard: () => update(newDraft(state.value.definition)),
    reset: (definition) => update(newDraft(definition)),
    exposeOption: (key, overrides) =>
      structural((d) => {
        const policy = policyNow();
        return optionsLeft(policy, d) <= 0
          ? err(
              `${subject()}: the most options this widget may expose is ${policy === undefined ? '' : optionLimit(policy)}.`
            )
          : exposeOption(sourceNow(), d, key, overrides);
      }),
    updateOption: (key, changes) =>
      structural((d) => updateOption(sourceNow(), d, key, changes)),
    hideOption: (key) => {
      update({
        ...state.value,
        definition: hideOption(state.value.definition, key),
      });
    },
    addView: (view) =>
      structural((d) => {
        const policy = policyNow();
        return viewsLeft(policy, d) <= 0
          ? err(
              `${subject()}: the most views this widget may add is ${policy === undefined ? '' : viewLimit(policy)}.`
            )
          : addView(sourceNow(), d, view);
      }),
    removeView: (key) => {
      update({
        ...state.value,
        definition: removeView(state.value.definition, key),
      });
    },
  };
}
