/**
 * A draft: the last valid definition plus the plain-field edits an admin has
 * typed but not committed. A form keeps this state (the React hook does), so
 * a half-finished edit (an empty title) never becomes a definition. Pure
 * functions, so the rules are the same in any framework.
 */

import { err, ok, type Result, type WidgetDefinition } from '../core/index.js';
import { updateWidget, validatePatch, type WidgetPatch } from './edit.js';
import type { SourceDescription } from './source.js';

export interface DraftState {
  /** The last valid definition. Structural edits (options, views) change it at once. */
  readonly definition: WidgetDefinition;
  /** Plain-field edits not committed yet. A field set to `undefined` is removed. */
  readonly patch: WidgetPatch;
}

/** A draft over `definition` with nothing pending. */
export function newDraft(definition: WidgetDefinition): DraftState {
  return { definition, patch: {} };
}

/** Whether anything is pending. */
export function isDirty(state: DraftState): boolean {
  return Object.keys(state.patch).length > 0;
}

/** Sets one pending field. */
export function setDraftField<K extends keyof WidgetPatch>(
  state: DraftState,
  field: K,
  value: WidgetPatch[K]
): DraftState {
  return { ...state, patch: { ...state.patch, [field]: value } };
}

/** Drops one pending edit, so the field shows the definition's value again. */
export function clearDraftField(
  state: DraftState,
  field: keyof WidgetPatch
): DraftState {
  const { [field]: _dropped, ...rest } = state.patch;
  return { ...state, patch: rest };
}

/** Every problem the pending edits have, by field (see `validatePatch`). */
export function draftProblems(
  source: SourceDescription,
  state: DraftState
): Record<string, string> {
  return validatePatch(source, state.definition, state.patch);
}

/**
 * The definition as it would be with the pending edits: the last valid one
 * when they have problems, so a preview never shows something broken.
 */
export function draftCandidate(
  source: SourceDescription,
  state: DraftState
): WidgetDefinition {
  if (!isDirty(state)) return state.definition;
  const applied = updateWidget(source, state.definition, state.patch);
  return applied.ok ? applied.value : state.definition;
}

/**
 * Applies the pending edits. On success the new draft has them in its
 * definition and nothing pending; on failure the error names every problem and
 * the draft is unchanged (the caller keeps the old state).
 */
export function commitDraft(
  source: SourceDescription,
  state: DraftState
): Result<DraftState> {
  if (!isDirty(state)) return ok(state);
  const problems = draftProblems(source, state);
  const keys = Object.keys(problems);
  if (keys.length > 0) {
    return err(
      keys
        .map((key) => (key === '' ? problems[key] : `${key}: ${problems[key]}`))
        .join(' ')
    );
  }
  const applied = updateWidget(source, state.definition, state.patch);
  if (!applied.ok) return applied;
  return ok(newDraft(applied.value));
}
