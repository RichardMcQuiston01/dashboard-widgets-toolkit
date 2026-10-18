/**
 * Source descriptions: plain data a developer writes once per registered
 * provider. A description says what the provider returns and what it can be
 * asked for, so the Widget Builder can offer only valid choices. It never
 * loads anything (that is the provider's job) and stays JSON-serialisable.
 */

import {
  err,
  isColumnKeyFor,
  ok,
  validateWidgetDefinition,
  type DetailMode,
  type Result,
  type WidgetKind,
  type WidgetOption,
  type WidgetPayload,
  BASE_VIEW_KEY,
  WIDGET_KINDS,
} from '../core/index.js';

/** A column a TABLE source returns, in order. */
export interface SourceColumn {
  readonly label: string;
  /** Cells carry a numeric `value`, so the column can be a bar or series. */
  readonly numeric?: boolean;
}

/** A view the provider builds itself (`options.view`). */
export interface SourceView {
  readonly key: string;
  readonly label: string;
  readonly kind: WidgetKind;
}

export interface SourceDescription {
  /** The provider's key in `providers`. Unique within the descriptions. */
  readonly key: string;
  /** Shown in the "pick a source" list. */
  readonly label: string;
  readonly description?: string;
  /** What the provider returns. The widget's `kind` is this. */
  readonly kind: WidgetKind;
  /**
   * TABLE: the columns in order (sorts and conversions name them by
   * position). Needed to offer sorts, column choices and conversions.
   */
  readonly columns?: readonly SourceColumn[];
  /**
   * What the provider can be asked for: templates with their own key, type,
   * bounds and default. A widget may expose some of them, relabel them and
   * change their defaults within the template's bounds, nothing more.
   */
  readonly options?: readonly WidgetOption[];
  /** Views the provider supplies itself, by key, label and kind. */
  readonly views?: readonly SourceView[];
  /** Whether a detail view is available, and in which mode. */
  readonly detail?: boolean | { readonly mode?: DetailMode };
  /** The dashboard filter keys it can use. Absent: any. */
  readonly filters?: readonly string[];
  /** A payload to preview with when the real provider is not wanted. */
  readonly sample?: WidgetPayload;
}

/** The most columns, views and filters a description may list. */
const MAX_LISTED = 50;

/**
 * Checks a description is coherent: it names a key, label and kind; its
 * options are valid on their own (unique keys, defaults inside their own
 * bounds); sort and column keys fit the columns; view keys are unique and not
 * `base`.
 */
export function validateSourceDescription(
  value: SourceDescription
): Result<SourceDescription> {
  const subject = `Source ${JSON.stringify(value.key)}`;
  const problems: string[] = [];
  if (typeof value.key !== 'string' || value.key.trim() === '') {
    return err('Source description: key must be a non-empty string.');
  }
  if (typeof value.label !== 'string' || value.label.trim() === '') {
    problems.push('label must be a non-empty string.');
  }
  if (!WIDGET_KINDS.includes(value.kind)) {
    problems.push(
      `kind must be one of ${WIDGET_KINDS.join(', ')}, got ${JSON.stringify(value.kind)}.`
    );
  }
  const columns = value.columns ?? [];
  if (columns.length > MAX_LISTED) {
    problems.push(
      `columns lists ${columns.length}; the most is ${MAX_LISTED}.`
    );
  }
  columns.forEach((column, index) => {
    if (typeof column.label !== 'string' || column.label.trim() === '') {
      problems.push(`columns[${index}].label must be a non-empty string.`);
    }
  });
  if (value.columns !== undefined && value.kind !== 'TABLE') {
    problems.push(`columns apply to a TABLE source, not ${value.kind}.`);
  }
  // Options are validated by the same rules a definition's are.
  if (value.options !== undefined && WIDGET_KINDS.includes(value.kind)) {
    const probe = validateWidgetDefinition({
      key: value.key,
      title: value.label,
      kind: value.kind,
      options: value.options,
    });
    if (!probe.ok) {
      problems.push(`options: ${probe.error}`);
    }
    for (const option of value.options) {
      if (option.type !== 'sort' && option.type !== 'columns') continue;
      for (const column of option.columns) {
        if (!isColumnKeyFor(value.kind, column.key)) {
          problems.push(
            `option ${JSON.stringify(option.key)}: column key ${JSON.stringify(column.key)} is not one a ${value.kind} has.`
          );
        } else if (value.kind === 'TABLE') {
          const index = Number(column.key.slice(1));
          if (value.columns === undefined) {
            problems.push(
              `option ${JSON.stringify(option.key)} names table columns, so the source needs "columns".`
            );
            break;
          }
          if (index >= value.columns.length) {
            problems.push(
              `option ${JSON.stringify(option.key)}: column ${column.key} is past the ${value.columns.length} column(s) the source lists.`
            );
          }
        }
      }
    }
  }
  const viewKeys = new Set<string>([BASE_VIEW_KEY]);
  (value.views ?? []).forEach((view, index) => {
    if (typeof view.key !== 'string' || view.key.trim() === '') {
      problems.push(`views[${index}].key must be a non-empty string.`);
    } else if (viewKeys.has(view.key)) {
      problems.push(
        view.key === BASE_VIEW_KEY
          ? `views[${index}].key "${BASE_VIEW_KEY}" is reserved.`
          : `views[${index}].key "${view.key}" is used twice.`
      );
    } else {
      viewKeys.add(view.key);
    }
    if (typeof view.label !== 'string' || view.label.trim() === '') {
      problems.push(`views[${index}].label must be a non-empty string.`);
    }
    if (!WIDGET_KINDS.includes(view.kind)) {
      problems.push(
        `views[${index}].kind must be one of ${WIDGET_KINDS.join(', ')}.`
      );
    }
  });
  if (new Set(value.filters ?? []).size !== (value.filters ?? []).length) {
    problems.push('filters lists a key twice.');
  }
  if (problems.length > 0) {
    return err(`${subject}: ${problems.join(' ')}`);
  }
  return ok(value);
}

/**
 * Identity helper that gives a description its type and checks it. A bad
 * description is a programmer error, so this throws at definition time
 * instead of returning a Result.
 */
export function defineSource<const S extends SourceDescription>(
  description: S
): S {
  const checked = validateSourceDescription(description);
  if (!checked.ok) {
    throw new Error(checked.error);
  }
  return description;
}
