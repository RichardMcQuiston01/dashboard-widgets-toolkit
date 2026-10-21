import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  watch,
  type Ref,
  type ShallowRef,
  type VNode,
  type VNodeChild,
} from 'vue';

import type { WidgetDefinition } from '../core/definition.js';
import {
  DATE_RANGE_PRESETS,
  coerceOptionValue,
  parseSortValue,
  type ColumnsOption,
  type DateRangeOption,
  type NumberOption,
  type OptionValue,
  type SortOption,
  type WidgetOption,
} from '../core/options.js';
import {
  DATE_RANGE_PRESET_LABELS,
  EMPTY_SETTINGS_PATCH,
  optionsDraftFrom,
  optionsPatchFrom,
  optionsPatchKey,
  storedOptionDefault,
  type OptionsDraft,
} from '../core/options-draft.js';
import {
  MAX_WIDGET_TITLE_LENGTH,
  isFlexible,
  widthRange,
  widthShareLabel,
  type WidgetSettingsPatch,
  type WidgetViewerSettings,
} from '../core/settings.js';
import { effectiveViewKey, viewChoices } from '../core/views.js';
import { InlineConfirm } from './confirm.js';
import { useSlotClassName, useWidgetSettings } from './settings.js';

export interface WidgetOptionsDialogProps {
  /** The author's definition, before the viewer's settings. */
  readonly definition: WidgetDefinition;
  /** What the viewer has saved for this widget. */
  readonly settings: WidgetViewerSettings | undefined;
  /**
   * What they had when editing began, for "Revert to before editing". Leave it
   * out to hide that button. `settings` may be `undefined` inside it, which
   * means they had chosen nothing.
   */
  readonly baseline?:
    { readonly settings: WidgetViewerSettings | undefined } | undefined;
  /** Whether another widget already shows this title; the dialog refuses it. */
  readonly isTitleInUse?: ((title: string) => boolean) | undefined;
  /**
   * For a clone: its original's title, so choosing another view can suggest
   * a title like "Recent Orders Line Chart".
   */
  readonly sourceTitle?: string | undefined;
  /** For a clone: shows "Delete this widget"; called after the viewer confirms. */
  readonly onDelete?: (() => void) | undefined;
  /** Called after the viewer confirms Apply, Reset or Revert. */
  readonly onApply: (patch: WidgetSettingsPatch) => void;
  readonly onClose: () => void;
}

type Confirming = 'apply' | 'discard' | 'reset' | 'revert' | 'delete';

/** An input event's target value. */
function valueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

export interface OptionFieldProps {
  readonly option: WidgetOption;
  /** The viewer's value, or undefined for the author's default. */
  readonly value: OptionValue | undefined;
  readonly id: string;
  readonly onChange: (value: OptionValue) => void;
}

/** A number input that keeps what the viewer typed until it is valid. */
const NumberField = defineComponent(
  (props: {
    readonly option: NumberOption;
    readonly id: string;
    readonly value: number;
    readonly onChange: (value: number) => void;
  }) => {
    const text: Ref<string> = ref(String(props.value));
    watch(
      () => props.value,
      (value) => {
        if (Number(text.value) !== value) text.value = String(value);
      }
    );
    return (): VNode =>
      h('div', { class: 'dwt-options-field' }, [
        h('label', { for: props.id }, props.option.label),
        h('input', {
          id: props.id,
          type: 'number',
          value: text.value,
          min: props.option.min,
          max: props.option.max,
          step: props.option.step ?? 1,
          onInput: (event: Event) => {
            const typed: string = valueOf(event);
            text.value = typed;
            const parsed: number = Number(typed);
            if (
              typed.trim() !== '' &&
              coerceOptionValue(props.option, parsed) !== undefined
            ) {
              props.onChange(parsed);
            }
          },
        }),
      ]);
  },
  { name: 'NumberField', props: ['option', 'id', 'value', 'onChange'] }
);

const DateRangeField = defineComponent(
  (props: {
    readonly option: DateRangeOption;
    readonly id: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
  }) => {
    const settings = useWidgetSettings();
    return (): VNode => {
      const { labels } = settings.value;
      const { option, value } = props;
      const presets: readonly { value: string; label: string }[] =
        option.presets ??
        DATE_RANGE_PRESETS.map((preset) => ({
          value: preset,
          label: DATE_RANGE_PRESET_LABELS[preset],
        }));
      const known: boolean = presets.some((preset) => preset.value === value);
      return h('div', { class: 'dwt-options-field' }, [
        h('label', { for: props.id }, option.label),
        h(
          'select',
          {
            id: props.id,
            onChange: (event: Event) => props.onChange(valueOf(event)),
          },
          [
            known
              ? null
              : h(
                  'option',
                  { value, selected: true },
                  labels.customRange(value)
                ),
            ...presets.map((preset) =>
              h(
                'option',
                {
                  key: preset.value,
                  value: preset.value,
                  selected: preset.value === value,
                },
                preset.label
              )
            ),
          ]
        ),
      ]);
    };
  },
  { name: 'DateRangeField', props: ['option', 'id', 'value', 'onChange'] }
);

const SortField = defineComponent(
  (props: {
    readonly option: SortOption;
    readonly id: string;
    readonly value: string | undefined;
    readonly onChange: (value: string) => void;
  }) => {
    const settings = useWidgetSettings();
    return (): VNode => {
      const { labels } = settings.value;
      const { option, value } = props;
      const parsed = value === undefined ? undefined : parseSortValue(value);
      const column: string = parsed?.column ?? '';
      const direction: string = parsed?.direction ?? 'desc';
      return h('div', { class: 'dwt-options-field' }, [
        h('label', { for: props.id }, option.label),
        h('span', { class: 'dwt-options-pair' }, [
          h(
            'select',
            {
              id: props.id,
              onChange: (event: Event) =>
                props.onChange(`${valueOf(event)}:${direction}`),
            },
            [
              option.default === undefined && column === ''
                ? h('option', { value: '', selected: true }, labels.sortDefault)
                : null,
              ...option.columns.map((entry) =>
                h(
                  'option',
                  {
                    key: entry.key,
                    value: entry.key,
                    selected: entry.key === column,
                  },
                  entry.label
                )
              ),
            ]
          ),
          h(
            'select',
            {
              'aria-label': option.label,
              disabled: column === '',
              onChange: (event: Event) =>
                props.onChange(`${column}:${valueOf(event)}`),
            },
            [
              h(
                'option',
                { value: 'asc', selected: direction === 'asc' },
                labels.sortAscending
              ),
              h(
                'option',
                { value: 'desc', selected: direction === 'desc' },
                labels.sortDescending
              ),
            ]
          ),
        ]),
      ]);
    };
  },
  { name: 'SortField', props: ['option', 'id', 'value', 'onChange'] }
);

const ColumnsField = defineComponent(
  (props: {
    readonly option: ColumnsOption;
    readonly value: readonly string[];
    readonly onChange: (value: readonly string[]) => void;
  }) => {
    const settings = useWidgetSettings();
    const slot = useSlotClassName();
    return (): VNode => {
      const { labels } = settings.value;
      const { option, value } = props;
      // Shown columns first, in the chosen order, then the ones left out.
      const ordered: readonly string[] = [
        ...value,
        ...option.columns
          .map((c) => c.key)
          .filter((key) => !value.includes(key)),
      ];
      const labelOf = (key: string): string =>
        option.columns.find((c) => c.key === key)?.label ?? key;
      const move = (key: string, by: -1 | 1): void => {
        const next: string[] = [...value];
        const from: number = next.indexOf(key);
        const to: number = from + by;
        if (from === -1 || to < 0 || to >= next.length) return;
        [next[from], next[to]] = [next[to] as string, next[from] as string];
        props.onChange(next);
      };
      return h('fieldset', { class: 'dwt-options-columns' }, [
        h('legend', option.label),
        h(
          'ul',
          ordered.map((key) => {
            const shown: boolean = value.includes(key);
            const name: string = labelOf(key);
            return h('li', { key }, [
              h('label', [
                h('input', {
                  type: 'checkbox',
                  checked: shown,
                  disabled: shown && value.length === 1,
                  onChange: (event: Event) =>
                    props.onChange(
                      (event.target as HTMLInputElement).checked
                        ? [...value, key]
                        : value.filter((k) => k !== key)
                    ),
                }),
                name,
              ]),
              shown
                ? h('span', { class: 'dwt-options-move' }, [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: slot('button', 'dwt-button', 'dwt-icon-button'),
                        'aria-label': labels.moveColumnUp(name),
                        title: labels.moveColumnUp(name),
                        disabled: value.indexOf(key) === 0,
                        onClick: () => move(key, -1),
                      },
                      [h('span', { 'aria-hidden': 'true' }, '↑')]
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: slot('button', 'dwt-button', 'dwt-icon-button'),
                        'aria-label': labels.moveColumnDown(name),
                        title: labels.moveColumnDown(name),
                        disabled: value.indexOf(key) === value.length - 1,
                        onClick: () => move(key, 1),
                      },
                      [h('span', { 'aria-hidden': 'true' }, '↓')]
                    ),
                  ])
                : null,
            ]);
          })
        ),
      ]);
    };
  },
  { name: 'ColumnsField', props: ['option', 'value', 'onChange'] }
);

/** One declared option as a form field. */
export const OptionField = defineComponent(
  (props: OptionFieldProps) => (): VNode => {
    const { option, id, onChange } = props;
    const current: OptionValue | undefined =
      props.value ?? storedOptionDefault(option);
    switch (option.type) {
      case 'choice':
        return h('div', { class: 'dwt-options-field' }, [
          h('label', { for: id }, option.label),
          h(
            'select',
            {
              id,
              onChange: (event: Event) => onChange(valueOf(event)),
            },
            option.choices.map((choice) =>
              h(
                'option',
                {
                  key: choice.value,
                  value: choice.value,
                  selected: choice.value === String(current ?? option.default),
                },
                choice.label
              )
            )
          ),
        ]);
      case 'number':
        return h(NumberField, {
          option,
          id,
          value: typeof current === 'number' ? current : option.default,
          onChange,
        });
      case 'boolean':
        return h('label', { class: 'dwt-options-check' }, [
          h('input', {
            type: 'checkbox',
            checked: current === true,
            onChange: (event: Event) =>
              onChange((event.target as HTMLInputElement).checked),
          }),
          option.label,
        ]);
      case 'text':
        return h('div', { class: 'dwt-options-field' }, [
          h('label', { for: id }, option.label),
          h('input', {
            id,
            type: 'text',
            value: typeof current === 'string' ? current : '',
            maxlength: option.maxLength,
            onInput: (event: Event) => onChange(valueOf(event)),
          }),
        ]);
      case 'color':
        return h('div', { class: 'dwt-options-field' }, [
          h('label', { for: id }, option.label),
          h('input', {
            id,
            type: 'color',
            value: typeof current === 'string' ? current : option.default,
            onInput: (event: Event) => onChange(valueOf(event)),
          }),
        ]);
      case 'dateRange':
        return h(DateRangeField, {
          option,
          id,
          value: typeof current === 'string' ? current : option.default,
          onChange,
        });
      case 'sort':
        return h(SortField, {
          option,
          id,
          value: typeof current === 'string' ? current : undefined,
          onChange,
        });
      case 'columns':
        return h(ColumnsField, {
          option,
          value: Array.isArray(current) ? current : option.default,
          onChange,
        });
    }
  },
  { name: 'OptionField', props: ['option', 'value', 'id', 'onChange'] }
);

/**
 * The Options dialog of one widget: its title, width, whether it fills free
 * space, the view it shows and its declared options. Nothing changes until the
 * viewer confirms Apply; Reset to defaults, Revert to before editing and
 * (for a clone) Delete ask first, and so does closing with unsaved changes.
 */
export const WidgetOptionsDialog = defineComponent(
  (props: WidgetOptionsDialogProps) => {
    const slot = useSlotClassName();
    const settings = useWidgetSettings();
    const dialog: Ref<HTMLDialogElement | null> = ref(null);
    const headingId: string = useId();
    const baseId: string = useId();
    const draft: ShallowRef<OptionsDraft> = shallowRef(
      optionsDraftFrom(props.settings)
    );
    const confirming: Ref<Confirming | undefined> = ref(undefined);
    // The title this dialog filled in from a view's name, so a later change of
    // view may replace it but never a title the viewer typed.
    let autoTitle: string | undefined;
    let opener: Element | null = null;

    onMounted(() => {
      const element: HTMLDialogElement | null = dialog.value;
      if (element === null) return;
      opener = document.activeElement;
      if (!element.open) element.showModal();
    });
    onBeforeUnmount(() => {
      const element: HTMLDialogElement | null = dialog.value;
      if (element?.open === true) element.close();
      if (opener instanceof HTMLElement) opener.focus();
    });

    function patch(next: Partial<OptionsDraft>): void {
      draft.value = { ...draft.value, ...next };
    }

    function requestClose(dirty: boolean): void {
      if (confirming.value !== undefined) confirming.value = undefined;
      else if (dirty) confirming.value = 'discard';
      else props.onClose();
    }

    return (): VNode => {
      const { labels } = settings.value;
      const { definition, baseline, isTitleInUse, sourceTitle, onDelete } =
        props;
      const current: OptionsDraft = draft.value;
      const savedKey: string = optionsPatchKey(
        optionsPatchFrom(definition, optionsDraftFrom(props.settings))
      );
      const draftPatch: WidgetSettingsPatch = optionsPatchFrom(
        definition,
        current
      );
      const dirty: boolean = optionsPatchKey(draftPatch) !== savedKey;
      const titleTaken: boolean =
        current.title.trim() !== '' &&
        isTitleInUse?.(current.title.trim()) === true;
      const canApply: boolean = dirty && !titleTaken;
      const baselineKey: string | undefined =
        baseline === undefined
          ? undefined
          : optionsPatchKey(
              optionsPatchFrom(definition, optionsDraftFrom(baseline.settings))
            );
      const canRevert: boolean =
        baselineKey !== undefined && baselineKey !== savedKey;
      const canReset: boolean =
        savedKey !== optionsPatchKey(EMPTY_SETTINGS_PATCH);
      const range = widthRange(definition);
      const views = viewChoices(definition);
      const effectiveFlexible: boolean =
        current.flexible ?? isFlexible(definition, undefined);
      const pending: Confirming | undefined = confirming.value;

      const answer = (yes: boolean): void => {
        const which: Confirming | undefined = confirming.value;
        confirming.value = undefined;
        if (!yes || which === undefined) return;
        if (which === 'discard') {
          props.onClose();
        } else if (which === 'apply') {
          props.onApply(draftPatch);
          props.onClose();
        } else if (which === 'reset') {
          props.onApply(EMPTY_SETTINGS_PATCH);
          props.onClose();
        } else if (which === 'delete') {
          onDelete?.();
          props.onClose();
        } else if (baseline !== undefined) {
          props.onApply(
            optionsPatchFrom(definition, optionsDraftFrom(baseline.settings))
          );
          props.onClose();
        }
      };

      const confirmMessage: Record<Confirming, string> = {
        apply: labels.confirmApply,
        discard: labels.confirmDiscard,
        reset: labels.confirmResetOptions,
        revert: labels.confirmRevertOptions,
        delete: labels.confirmDelete,
      };

      const widths: number[] = [];
      for (let width = range.min; width <= range.max; width += 1) {
        widths.push(width);
      }

      const onViewChange = (value: string): void => {
        const next: OptionsDraft = { ...current, view: value };
        if (
          sourceTitle === undefined ||
          (current.title.trim() !== '' && current.title !== autoTitle)
        ) {
          draft.value = next;
          return;
        }
        const label: string | undefined = views.find(
          (view) => view.key === value
        )?.label;
        const startView: string = effectiveViewKey(
          definition,
          props.settings?.view
        );
        if (label === undefined || value === startView) {
          autoTitle = undefined;
          draft.value = { ...next, title: '' };
          return;
        }
        let suggestion: string = labels.suggestedViewTitle(sourceTitle, label);
        for (let n = 2; isTitleInUse?.(suggestion) === true && n < 50; n += 1) {
          suggestion = `${labels.suggestedViewTitle(sourceTitle, label)} (#${n})`;
        }
        autoTitle = suggestion;
        draft.value = { ...next, title: suggestion };
      };

      const fields: VNodeChild[] = [
        h(
          'h2',
          { id: headingId, class: 'dwt-options-heading' },
          labels.optionsFor(definition.title)
        ),
        h('div', { class: 'dwt-options-field' }, [
          h('label', { for: `${baseId}-title` }, labels.optionsTitleField),
          h('input', {
            id: `${baseId}-title`,
            type: 'text',
            value: current.title,
            maxlength: MAX_WIDGET_TITLE_LENGTH,
            placeholder: definition.title,
            'aria-invalid': titleTaken,
            ...(titleTaken
              ? { 'aria-describedby': `${baseId}-title-error` }
              : {}),
            onInput: (event: Event) => patch({ title: valueOf(event) }),
          }),
          titleTaken
            ? h(
                'p',
                {
                  id: `${baseId}-title-error`,
                  role: 'alert',
                  class: 'dwt-options-error',
                },
                labels.titleInUse
              )
            : null,
        ]),
        range.min < range.max
          ? h('div', { class: 'dwt-options-field' }, [
              h('label', { for: `${baseId}-width` }, labels.optionsWidthField),
              h(
                'select',
                {
                  id: `${baseId}-width`,
                  onChange: (event: Event) => {
                    const value: string = valueOf(event);
                    patch({ width: value === '' ? undefined : Number(value) });
                  },
                },
                [
                  h(
                    'option',
                    { value: '', selected: current.width === undefined },
                    labels.widthDefault
                  ),
                  ...widths.map((width) =>
                    h(
                      'option',
                      {
                        key: width,
                        value: String(width),
                        selected: current.width === width,
                      },
                      labels.widthOption(width, widthShareLabel(width))
                    )
                  ),
                ]
              ),
            ])
          : null,
        h('label', { class: 'dwt-options-check' }, [
          h('input', {
            type: 'checkbox',
            checked: effectiveFlexible,
            onChange: (event: Event) =>
              patch({ flexible: (event.target as HTMLInputElement).checked }),
          }),
          labels.optionsFlexible,
        ]),
        views.length > 0
          ? h('div', { class: 'dwt-options-field' }, [
              h('label', { for: `${baseId}-view` }, labels.optionsViewField),
              h(
                'select',
                {
                  id: `${baseId}-view`,
                  onChange: (event: Event) => onViewChange(valueOf(event)),
                },
                views.map((view) =>
                  h(
                    'option',
                    {
                      key: view.key,
                      value: view.key,
                      selected:
                        view.key === effectiveViewKey(definition, current.view),
                    },
                    view.key === effectiveViewKey(definition, undefined)
                      ? labels.viewDefault(view.label)
                      : view.label
                  )
                )
              ),
            ])
          : null,
        (definition.options?.length ?? 0) > 0
          ? h('fieldset', { class: 'dwt-options-group' }, [
              h('legend', labels.optionsDeclared),
              ...(definition.options ?? []).map((option) =>
                h(OptionField, {
                  key: option.key,
                  option,
                  value: current.options[option.key],
                  id: `${baseId}-opt-${option.key}`,
                  onChange: (value: OptionValue) =>
                    patch({
                      options: { ...current.options, [option.key]: value },
                    }),
                })
              ),
            ])
          : null,
      ];

      const actions: VNodeChild =
        pending === undefined
          ? [
              h(
                'button',
                {
                  type: 'submit',
                  class: slot('button', 'dwt-button', 'dwt-button-primary'),
                  disabled: !canApply,
                },
                labels.apply
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: slot('button', 'dwt-button'),
                  onClick: () => requestClose(dirty),
                },
                labels.cancel
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: slot('button', 'dwt-button'),
                  disabled: !canReset,
                  onClick: () => {
                    confirming.value = 'reset';
                  },
                },
                labels.resetToDefaults
              ),
              baseline === undefined
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      class: slot('button', 'dwt-button'),
                      disabled: !canRevert,
                      onClick: () => {
                        confirming.value = 'revert';
                      },
                    },
                    labels.revertToBeforeEditing
                  ),
              onDelete === undefined
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      class: slot('button', 'dwt-button'),
                      onClick: () => {
                        confirming.value = 'delete';
                      },
                    },
                    labels.optionsDelete
                  ),
            ]
          : h(InlineConfirm, {
              message: confirmMessage[pending],
              onAnswer: answer,
            });

      return h(
        'dialog',
        {
          ref: dialog,
          class: slot('dialog', 'dwt-options-dialog'),
          'aria-labelledby': headingId,
          onCancel: (event: Event) => {
            event.preventDefault();
            requestClose(dirty);
          },
          onClick: (event: MouseEvent) => {
            if (event.target === dialog.value) requestClose(dirty);
          },
        },
        [
          h(
            'form',
            {
              class: 'dwt-options',
              onSubmit: (event: Event) => {
                event.preventDefault();
                if (canApply && confirming.value === undefined) {
                  confirming.value = 'apply';
                }
              },
            },
            [...fields, h('div', { class: 'dwt-options-actions' }, actions)]
          ),
        ]
      );
    };
  },
  {
    name: 'WidgetOptionsDialog',
    props: [
      'definition',
      'settings',
      'baseline',
      'isTitleInUse',
      'sourceTitle',
      'onDelete',
      'onApply',
      'onClose',
    ],
  }
);
