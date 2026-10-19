import { useId, useState, type ReactElement } from 'react';

import { availableViews } from '../builder/edit.js';
import { previewWidget } from '../builder/preview.js';
import type { SourceDescription } from '../builder/source.js';
import type { WidgetDefinition } from '../core/definition.js';
import type { OptionValue, OptionValues } from '../core/options.js';
import type { WidgetThemeStyles } from '../core/theme.js';
import { ResolvedWidgetCard } from './card.js';
import { OptionField } from './options-dialog.js';
import { WidgetTheme } from './theme.js';
import type { WidgetDraft } from './use-widget-draft.js';

/** The words the builder forms use. Pass `labels` to change any of them. */
export interface BuilderLabels {
  readonly optionsHeading: string;
  readonly optionLabel: string;
  readonly optionDefault: string;
  readonly optionRemove: string;
  readonly optionsAvailable: string;
  readonly optionsNoneAvailable: string;
  readonly optionAdd: (label: string) => string;
  readonly viewsHeading: string;
  readonly viewsNone: string;
  readonly viewRemove: (label: string) => string;
  readonly viewAddField: string;
  readonly viewAddPlaceholder: string;
  readonly viewsNoneAvailable: string;
  readonly previewNoSample: string;
}

export const DEFAULT_BUILDER_LABELS: BuilderLabels = {
  optionsHeading: 'Options viewers can change',
  optionLabel: 'Label',
  optionDefault: 'Default',
  optionRemove: 'Remove',
  optionsAvailable: 'Available from the source',
  optionsNoneAvailable: 'The source offers no other options.',
  optionAdd: (label) => `Add ${label}`,
  viewsHeading: 'Views',
  viewsNone: 'No other views.',
  viewRemove: (label) => `Remove ${label}`,
  viewAddField: 'Add a view',
  viewAddPlaceholder: 'Choose a view…',
  viewsNoneAvailable: 'The source offers no more views.',
  previewNoSample: 'Add a "sample" to the source to preview here.',
};

export interface BuilderFormProps {
  readonly draft: WidgetDraft;
  readonly labels?: Partial<BuilderLabels>;
  readonly className?: string;
}

function mergeLabels(
  labels: Partial<BuilderLabels> | undefined
): BuilderLabels {
  return { ...DEFAULT_BUILDER_LABELS, ...labels };
}

/**
 * The options a widget exposes, as form fields (label and default), with the
 * source's other options to add. Each change goes through the draft, so the
 * definition stays valid; a refused change shows the reason beside the option.
 */
export function WidgetOptionsForm({
  draft,
  labels,
  className,
}: BuilderFormProps): ReactElement {
  const text = mergeLabels(labels);
  const baseId = useId();
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const exposed = draft.definition.options ?? [];
  const available = (draft.source.options ?? []).filter(
    (template) => !exposed.some((option) => option.key === template.key)
  );

  function report(key: string, outcome: { ok: boolean; error?: string }): void {
    setErrors((current) => {
      const next = { ...current };
      if (outcome.ok) delete next[key];
      else next[key] = outcome.error ?? '';
      return next;
    });
  }

  return (
    <div
      className={['dwt-builder', 'dwt-builder-options', className]
        .filter(Boolean)
        .join(' ')}
    >
      <fieldset className="dwt-options-group">
        <legend>{text.optionsHeading}</legend>
        {exposed.map((option) => (
          <div key={option.key} className="dwt-builder-option">
            <div className="dwt-options-field">
              <label htmlFor={`${baseId}-${option.key}-label`}>
                {text.optionLabel}
              </label>
              <input
                id={`${baseId}-${option.key}-label`}
                type="text"
                value={option.label}
                onChange={(event) =>
                  report(
                    option.key,
                    draft.updateOption(option.key, {
                      label: event.target.value,
                    })
                  )
                }
              />
            </div>
            <OptionField
              option={option}
              value={undefined}
              id={`${baseId}-${option.key}-default`}
              onChange={(value: OptionValue) =>
                report(
                  option.key,
                  draft.updateOption(option.key, { default: value })
                )
              }
            />
            <button
              type="button"
              className="dwt-button"
              onClick={() => {
                draft.hideOption(option.key);
                report(option.key, { ok: true });
              }}
            >
              {text.optionRemove}
            </button>
            {errors[option.key] !== undefined && (
              <p role="alert" className="dwt-options-error">
                {errors[option.key]}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      <fieldset className="dwt-options-group">
        <legend>{text.optionsAvailable}</legend>
        {available.length === 0 ? (
          <p className="dwt-builder-hint">{text.optionsNoneAvailable}</p>
        ) : (
          available.map((template) => (
            <div key={template.key} className="dwt-builder-option">
              <button
                type="button"
                className="dwt-button"
                onClick={() =>
                  report(template.key, draft.exposeOption(template.key))
                }
              >
                {text.optionAdd(template.label)}
              </button>
              {errors[template.key] !== undefined && (
                <p role="alert" className="dwt-options-error">
                  {errors[template.key]}
                </p>
              )}
            </div>
          ))
        )}
      </fieldset>
    </div>
  );
}

/**
 * The widget's views with a way to remove each, and a picker for the views
 * the source can still serve.
 */
export function WidgetViewsForm({
  draft,
  labels,
  className,
}: BuilderFormProps): ReactElement {
  const text = mergeLabels(labels);
  const id = useId();
  const [error, setError] = useState<string | undefined>(undefined);
  const views = draft.definition.views ?? [];
  const choices = availableViews(draft.source, draft.definition);
  return (
    <fieldset
      className={[
        'dwt-builder',
        'dwt-options-group',
        'dwt-builder-views',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <legend>{text.viewsHeading}</legend>
      {views.length === 0 ? (
        <p className="dwt-builder-hint">{text.viewsNone}</p>
      ) : (
        <ul className="dwt-builder-view-list">
          {views.map((view) => (
            <li key={view.key}>
              <span>{view.label}</span>
              <button
                type="button"
                className="dwt-button"
                aria-label={text.viewRemove(view.label)}
                onClick={() => {
                  draft.removeView(view.key);
                  setError(undefined);
                }}
              >
                {text.optionRemove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {choices.length === 0 ? (
        <p className="dwt-builder-hint">{text.viewsNoneAvailable}</p>
      ) : (
        <div className="dwt-options-field">
          <label htmlFor={`${id}-add`}>{text.viewAddField}</label>
          <select
            id={`${id}-add`}
            value=""
            onChange={(event) => {
              const choice = choices.find((c) => c.key === event.target.value);
              if (choice === undefined) return;
              const outcome = draft.addView(choice.view);
              setError(outcome.ok ? undefined : outcome.error);
            }}
          >
            <option value="">{text.viewAddPlaceholder}</option>
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className="dwt-options-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export interface WidgetPreviewProps {
  readonly source: SourceDescription;
  /** Usually `draft.candidate`. */
  readonly definition: WidgetDefinition;
  /** The view to show. Default: the widget's `defaultView`. */
  readonly view?: string;
  /** Option values to try instead of the defaults. */
  readonly optionValues?: OptionValues;
  /** Wraps the preview in a theme (from `createTheme`). */
  readonly theme?: WidgetThemeStyles;
  readonly labels?: Partial<BuilderLabels>;
  readonly className?: string;
}

/**
 * The widget as a viewer would see it, drawn from the source's `sample`
 * payload with the real renderers. Calls no provider. When the preview can't
 * be made (no sample, a view only the provider builds) it says why.
 */
export function WidgetPreview({
  source,
  definition,
  view,
  optionValues,
  theme,
  labels,
  className,
}: WidgetPreviewProps): ReactElement {
  const text = mergeLabels(labels);
  const previewed = previewWidget(source, definition, {
    ...(view === undefined ? {} : { view }),
    ...(optionValues === undefined ? {} : { optionValues }),
  });
  const body: ReactElement = previewed.ok ? (
    <ResolvedWidgetCard
      widget={previewed.value}
      {...(definition.width === undefined ? {} : { width: definition.width })}
    />
  ) : (
    <p role="status" className="dwt-builder-hint">
      {source.sample === undefined ? text.previewNoSample : previewed.error}
    </p>
  );
  return (
    <div
      className={['dwt-builder', 'dwt-builder-preview', className]
        .filter(Boolean)
        .join(' ')}
    >
      {theme === undefined ? (
        body
      ) : (
        <WidgetTheme theme={theme}>{body}</WidgetTheme>
      )}
    </div>
  );
}
