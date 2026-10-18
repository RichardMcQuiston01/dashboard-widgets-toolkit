/**
 * Checks a definition against the source that feeds it: what the generic
 * validator cannot know. A builder never returns a definition that fails here.
 */

import {
  BASE_VIEW_KEY,
  MAX_WIDGET_TITLE_LENGTH,
  coerceOptionValue,
  err,
  ok,
  resolveDetailOptions,
  validateWidgetDefinition,
  type Result,
  type WidgetDefinition,
  type WidgetOption,
  type WidgetView,
} from '../core/index.js';
import type { SourceDescription } from './source.js';

/** Widget keys the builder accepts: ids layouts and providers refer to. */
export const WIDGET_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** The longest widget description the builder accepts. */
export const MAX_BUILDER_DESCRIPTION_LENGTH = 500;

/** Why `option` is not a narrowing of `template`, or undefined when it is. */
function optionProblem(
  template: WidgetOption,
  option: WidgetOption
): string | undefined {
  if (template.type !== option.type) {
    return `is a ${option.type} option but the source's is ${template.type}.`;
  }
  // The default must be one the source's own template accepts.
  const fits = (value: unknown): boolean =>
    coerceOptionValue(template, value) !== undefined;
  switch (option.type) {
    case 'choice': {
      const allowed = new Set<string>(
        (template as typeof option).choices.map((choice) => choice.value)
      );
      const stray = option.choices.find((choice) => !allowed.has(choice.value));
      if (stray !== undefined) {
        return `offers the choice ${JSON.stringify(stray.value)}, which the source does not.`;
      }
      break;
    }
    case 'number': {
      const source = template as typeof option;
      if (option.min < source.min || option.max > source.max) {
        return `allows ${option.min} to ${option.max}, outside the source's ${source.min} to ${source.max}.`;
      }
      if (option.step !== source.step) {
        return `steps by ${String(option.step)}, but the source steps by ${String(source.step)}.`;
      }
      break;
    }
    case 'text':
      if (option.maxLength > (template as typeof option).maxLength) {
        return `allows ${option.maxLength} characters, more than the source's ${(template as typeof option).maxLength}.`;
      }
      break;
    case 'dateRange': {
      const presets = (template as typeof option).presets;
      if (presets !== undefined) {
        const allowed = new Set<string>(presets.map((p) => p.value));
        const stray = (option.presets ?? []).find((p) => !allowed.has(p.value));
        if (option.presets === undefined || stray !== undefined) {
          return `offers a period the source does not.`;
        }
      }
      break;
    }
    case 'sort':
    case 'columns': {
      const source = template as typeof option;
      const allowed = new Set<string>(source.columns.map((c) => c.key));
      const stray = option.columns.find((column) => !allowed.has(column.key));
      if (stray !== undefined) {
        return `names column ${JSON.stringify(stray.key)}, which the source does not offer.`;
      }
      if ((option.apply ?? 'provider') !== (source.apply ?? 'provider')) {
        return `applies "${option.apply ?? 'provider'}" but the source applies "${source.apply ?? 'provider'}".`;
      }
      break;
    }
    default:
      break;
  }
  if (option.type === 'sort' && option.default === undefined) {
    return undefined;
  }
  return fits(option.default)
    ? undefined
    : `has a default the source's option does not accept.`;
}

function viewProblems(
  source: SourceDescription,
  definition: WidgetDefinition
): string[] {
  const problems: string[] = [];
  const columns = source.columns;
  const numeric = (index: number): boolean =>
    columns === undefined || columns[index]?.numeric === true;
  const inRange = (index: number): boolean =>
    columns === undefined || (index >= 0 && index < columns.length);
  (definition.views ?? []).forEach((view: WidgetView, index: number) => {
    const at = `views[${index}] ${JSON.stringify(view.key)}`;
    const convert = view.convert;
    if (convert === undefined) {
      const supplied = source.views?.find((v) => v.key === view.key);
      if (supplied === undefined) {
        problems.push(
          `${at} is not a view the source supplies; a view without a conversion must be one of its "views".`
        );
      } else if (supplied.kind !== view.kind) {
        problems.push(
          `${at} is ${view.kind} but the source supplies it as ${supplied.kind}.`
        );
      }
      return;
    }
    if (convert.type === 'tableToBarList' || convert.type === 'tableToGraph') {
      const label = convert.label;
      const values =
        convert.type === 'tableToBarList' ? [convert.value] : convert.values;
      if (!inRange(label)) {
        problems.push(`${at}: label column ${label} is not in the source.`);
      }
      for (const value of values) {
        if (!inRange(value)) {
          problems.push(`${at}: value column ${value} is not in the source.`);
        } else if (!numeric(value)) {
          problems.push(
            `${at}: column ${value} (${columns?.[value]?.label ?? '?'}) is not numeric in the source.`
          );
        }
      }
    }
  });
  return problems;
}

/**
 * Checks `definition` against `source`: it names the source, its kind
 * matches, every option is a narrowing of one of the source's templates,
 * views are ones the source can serve, and `detail` and `filters` ask for no
 * more than it offers. Runs `validateWidgetDefinition` first.
 */
export function checkAgainstSource(
  source: SourceDescription,
  definition: WidgetDefinition
): Result<WidgetDefinition> {
  const generic = validateWidgetDefinition(definition);
  if (!generic.ok) return generic;
  const subject = `Widget ${JSON.stringify(definition.key)} (source ${JSON.stringify(source.key)})`;
  const problems: string[] = [];
  if (!WIDGET_KEY_PATTERN.test(definition.key)) {
    problems.push(
      `key must be 1 to 64 letters, digits, "_", "-", "." or ":", starting with a letter or digit, got ${JSON.stringify(definition.key)}.`
    );
  }
  if (definition.title.trim() === '') {
    problems.push('title must not be empty.');
  } else if (definition.title.length > MAX_WIDGET_TITLE_LENGTH) {
    problems.push(
      `title is ${definition.title.length} characters; the most is ${MAX_WIDGET_TITLE_LENGTH}.`
    );
  }
  if (
    definition.description !== undefined &&
    definition.description.length > MAX_BUILDER_DESCRIPTION_LENGTH
  ) {
    problems.push(
      `description is ${definition.description.length} characters; the most is ${MAX_BUILDER_DESCRIPTION_LENGTH}.`
    );
  }
  if (definition.source !== source.key) {
    problems.push(
      `source must be ${JSON.stringify(source.key)}, got ${JSON.stringify(definition.source)}.`
    );
  }
  if (definition.kind !== source.kind) {
    problems.push(
      `kind must be ${source.kind} (what the source returns), got ${definition.kind}.`
    );
  }
  for (const option of definition.options ?? []) {
    const template = source.options?.find((t) => t.key === option.key);
    if (template === undefined) {
      problems.push(
        `option ${JSON.stringify(option.key)} is not one the source offers (${(source.options ?? []).map((t) => JSON.stringify(t.key)).join(', ') || 'it offers none'}).`
      );
      continue;
    }
    const problem = optionProblem(template, option);
    if (problem !== undefined) {
      problems.push(`option ${JSON.stringify(option.key)} ${problem}`);
    }
  }
  problems.push(...viewProblems(source, definition));
  if (
    definition.defaultView !== undefined &&
    definition.defaultView !== BASE_VIEW_KEY &&
    !(definition.views ?? []).some((v) => v.key === definition.defaultView)
  ) {
    problems.push(
      `defaultView ${JSON.stringify(definition.defaultView)} is not a view of this widget.`
    );
  }
  const detail = source.detail;
  const wantsDetail =
    definition.detail !== undefined && definition.detail !== false;
  if (wantsDetail) {
    if (detail === undefined || detail === false) {
      problems.push('detail is on, but the source offers no detail view.');
    } else if (
      typeof detail === 'object' &&
      detail.mode !== undefined &&
      resolveDetailOptions(definition)?.mode !== detail.mode
    ) {
      problems.push(`detail.mode must be "${detail.mode}" for this source.`);
    }
  }
  if (source.filters !== undefined) {
    if (definition.filters === undefined) {
      problems.push(
        `filters must be set: the source uses only ${source.filters.map((f) => JSON.stringify(f)).join(', ') || 'no filters'}, and an absent list means all.`
      );
    } else {
      for (const key of definition.filters) {
        if (!source.filters.includes(key)) {
          problems.push(
            `filters lists ${JSON.stringify(key)}, which the source does not use.`
          );
        }
      }
    }
  }
  if (problems.length > 0) {
    return err(`${subject}: ${problems.join(' ')}`);
  }
  return ok(definition);
}
