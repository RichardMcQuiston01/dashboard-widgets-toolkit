import { defineComponent, h, ref, useId, type Ref, type VNode } from 'vue';

import { availableViews } from '../builder/edit.js';
import {
  DEFAULT_BUILDER_LABELS,
  type BuilderLabels,
} from '../builder/labels.js';
import { previewWidget } from '../builder/preview.js';
import type { SourceDescription } from '../builder/source.js';
import type { WidgetDefinition } from '../core/definition.js';
import type { OptionValue, OptionValues } from '../core/options.js';
import type { WidgetThemeStyles } from '../core/theme.js';
import { ResolvedWidgetCard } from './card.js';
import { OptionField } from './options-dialog.js';
import { declareProps } from './props.js';
import { WidgetTheme } from './theme.js';
import type { WidgetDraft } from './use-widget-draft.js';

export { DEFAULT_BUILDER_LABELS, type BuilderLabels };

export interface BuilderFormProps {
  readonly draft: WidgetDraft;
  readonly labels?: Partial<BuilderLabels> | undefined;
  readonly className?: string | undefined;
}

function mergeLabels(
  labels: Partial<BuilderLabels> | undefined
): BuilderLabels {
  return { ...DEFAULT_BUILDER_LABELS, ...labels };
}

function classes(...names: readonly (string | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** The outcome of a draft change, as far as the forms care. */
interface Outcome {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Errors by option key, shown beside the option whose change was refused.
 * Returns the ref and a reporter that sets or clears one entry.
 */
function useOutcomes(): {
  readonly errors: Ref<Readonly<Record<string, string>>>;
  readonly report: (key: string, outcome: Outcome) => void;
} {
  const errors: Ref<Readonly<Record<string, string>>> = ref({});
  return {
    errors,
    report: (key, outcome) => {
      const next: Record<string, string> = { ...errors.value };
      if (outcome.ok) delete next[key];
      else next[key] = outcome.error ?? '';
      errors.value = next;
    },
  };
}

/**
 * The options a widget exposes, as form fields (label and default), with the
 * source's other options to add. Each change goes through the draft, so the
 * definition stays valid; a refused change shows the reason beside the option.
 */
export const WidgetOptionsForm = defineComponent(
  (props: BuilderFormProps) => {
    const baseId: string = useId();
    const { errors, report } = useOutcomes();
    return (): VNode => {
      const { draft } = props;
      const text = mergeLabels(props.labels);
      const exposed = draft.definition.options ?? [];
      const available = (draft.source.options ?? []).filter(
        (template) => !exposed.some((option) => option.key === template.key)
      );
      return h(
        'div',
        {
          class: classes('dwt-builder', 'dwt-builder-options', props.className),
        },
        [
          h('fieldset', { class: 'dwt-options-group' }, [
            h('legend', text.optionsHeading),
            ...exposed.map((option) =>
              h('div', { key: option.key, class: 'dwt-builder-option' }, [
                h('div', { class: 'dwt-options-field' }, [
                  h(
                    'label',
                    { for: `${baseId}-${option.key}-label` },
                    text.optionLabel
                  ),
                  h('input', {
                    id: `${baseId}-${option.key}-label`,
                    type: 'text',
                    value: option.label,
                    onInput: (event: Event) =>
                      report(
                        option.key,
                        draft.updateOption(option.key, {
                          label: (event.target as HTMLInputElement).value,
                        })
                      ),
                  }),
                ]),
                h(OptionField, {
                  option,
                  value: undefined,
                  id: `${baseId}-${option.key}-default`,
                  onChange: (value: OptionValue) =>
                    report(
                      option.key,
                      draft.updateOption(option.key, { default: value })
                    ),
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'dwt-button',
                    onClick: () => {
                      draft.hideOption(option.key);
                      report(option.key, { ok: true });
                    },
                  },
                  text.optionRemove
                ),
                errors.value[option.key] === undefined
                  ? null
                  : h(
                      'p',
                      { role: 'alert', class: 'dwt-options-error' },
                      errors.value[option.key]
                    ),
              ])
            ),
          ]),
          h('fieldset', { class: 'dwt-options-group' }, [
            h('legend', text.optionsAvailable),
            draft.limits.optionsLeft <= 0 && available.length > 0
              ? h('p', { class: 'dwt-builder-hint' }, text.optionsLimitReached)
              : available.length === 0
                ? h(
                    'p',
                    { class: 'dwt-builder-hint' },
                    text.optionsNoneAvailable
                  )
                : available.map((template) =>
                    h(
                      'div',
                      { key: template.key, class: 'dwt-builder-option' },
                      [
                        h(
                          'button',
                          {
                            type: 'button',
                            class: 'dwt-button',
                            onClick: () =>
                              report(
                                template.key,
                                draft.exposeOption(template.key)
                              ),
                          },
                          text.optionAdd(template.label)
                        ),
                        errors.value[template.key] === undefined
                          ? null
                          : h(
                              'p',
                              { role: 'alert', class: 'dwt-options-error' },
                              errors.value[template.key]
                            ),
                      ]
                    )
                  ),
          ]),
        ]
      );
    };
  },
  { name: 'WidgetOptionsForm', props: ['draft', 'labels', 'className'] }
);

/**
 * The widget's views with a way to remove each, and a picker for the views
 * the source can still serve.
 */
export const WidgetViewsForm = defineComponent(
  (props: BuilderFormProps) => {
    const id: string = useId();
    const error: Ref<string | undefined> = ref(undefined);
    return (): VNode => {
      const { draft } = props;
      const text = mergeLabels(props.labels);
      const views = draft.definition.views ?? [];
      const choices = availableViews(draft.source, draft.definition);
      return h(
        'fieldset',
        {
          class: classes(
            'dwt-builder',
            'dwt-options-group',
            'dwt-builder-views',
            props.className
          ),
        },
        [
          h('legend', text.viewsHeading),
          views.length === 0
            ? h('p', { class: 'dwt-builder-hint' }, text.viewsNone)
            : h(
                'ul',
                { class: 'dwt-builder-view-list' },
                views.map((view) =>
                  h('li', { key: view.key }, [
                    h('span', view.label),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'dwt-button',
                        'aria-label': text.viewRemove(view.label),
                        onClick: () => {
                          draft.removeView(view.key);
                          error.value = undefined;
                        },
                      },
                      text.optionRemove
                    ),
                  ])
                )
              ),
          draft.limits.viewsLeft <= 0 && choices.length > 0
            ? h('p', { class: 'dwt-builder-hint' }, text.viewsLimitReached)
            : choices.length === 0
              ? h('p', { class: 'dwt-builder-hint' }, text.viewsNoneAvailable)
              : h('div', { class: 'dwt-options-field' }, [
                  h('label', { for: `${id}-add` }, text.viewAddField),
                  h(
                    'select',
                    {
                      id: `${id}-add`,
                      onChange: (event: Event) => {
                        const element = event.target as HTMLSelectElement;
                        const choice = choices.find(
                          (c) => c.key === element.value
                        );
                        if (choice === undefined) return;
                        const outcome = draft.addView(choice.view);
                        error.value = outcome.ok ? undefined : outcome.error;
                        element.value = '';
                      },
                    },
                    [
                      h(
                        'option',
                        { value: '', selected: true },
                        text.viewAddPlaceholder
                      ),
                      ...choices.map((choice) =>
                        h(
                          'option',
                          { key: choice.key, value: choice.key },
                          choice.label
                        )
                      ),
                    ]
                  ),
                ]),
          error.value === undefined
            ? null
            : h(
                'p',
                { role: 'alert', class: 'dwt-options-error' },
                error.value
              ),
        ]
      );
    };
  },
  { name: 'WidgetViewsForm', props: ['draft', 'labels', 'className'] }
);

export interface WidgetPreviewProps {
  readonly source: SourceDescription;
  /** Usually `draft.candidate`. */
  readonly definition: WidgetDefinition;
  /** The view to show. Default: the widget's `defaultView`. */
  readonly view?: string | undefined;
  /** Option values to try instead of the defaults. */
  readonly optionValues?: OptionValues | undefined;
  /** Wraps the preview in a theme (from `createTheme`). */
  readonly theme?: WidgetThemeStyles | undefined;
  readonly labels?: Partial<BuilderLabels> | undefined;
  readonly className?: string | undefined;
}

/**
 * The widget as a viewer would see it, drawn from the source's `sample`
 * payload with the real renderers. Calls no provider. When the preview can't
 * be made (no sample, a view only the provider builds) it says why.
 */
export const WidgetPreview = defineComponent(
  (props: WidgetPreviewProps) => (): VNode => {
    const { source, definition, view, optionValues, theme } = props;
    const text = mergeLabels(props.labels);
    const previewed = previewWidget(source, definition, {
      ...(view === undefined ? {} : { view }),
      ...(optionValues === undefined ? {} : { optionValues }),
    });
    const body: VNode = previewed.ok
      ? h(ResolvedWidgetCard, {
          widget: previewed.value,
          ...(definition.width === undefined
            ? {}
            : { width: definition.width }),
        })
      : h(
          'p',
          { role: 'status', class: 'dwt-builder-hint' },
          source.sample === undefined ? text.previewNoSample : previewed.error
        );
    return h(
      'div',
      { class: classes('dwt-builder', 'dwt-builder-preview', props.className) },
      theme === undefined
        ? [body]
        : [h(WidgetTheme, { theme }, { default: () => body })]
    );
  },
  {
    name: 'WidgetPreview',
    props: declareProps<WidgetPreviewProps>(
      [
        'source',
        'definition',
        'view',
        'optionValues',
        'theme',
        'labels',
        'className',
      ],
      []
    ),
  }
);
