import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

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
  MAX_WIDGET_TITLE_LENGTH,
  isFlexible,
  widthRange,
  widthShareLabel,
  type WidgetSettingsPatch,
  type WidgetViewerSettings,
} from '../core/settings.js';
import { effectiveViewKey, viewChoices } from '../core/views.js';
import {
  DATE_RANGE_PRESET_LABELS,
  EMPTY_SETTINGS_PATCH,
  optionsDraftFrom,
  optionsPatchFrom,
  optionsPatchKey,
  storedOptionDefault,
  type OptionsDraft,
} from '../core/options-draft.js';
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
  readonly baseline?: { readonly settings: WidgetViewerSettings | undefined };
  /** Whether another widget already shows this title; the dialog refuses it. */
  readonly isTitleInUse?: (title: string) => boolean;
  /**
   * For a clone: its original's title, so choosing another view can suggest
   * a title like "Recent Orders Line Chart".
   */
  readonly sourceTitle?: string;
  /** For a clone: shows "Delete this widget"; called after the viewer confirms. */
  readonly onDelete?: () => void;
  /** Called after the viewer confirms Apply, Reset or Revert. */
  readonly onApply: (patch: WidgetSettingsPatch) => void;
  readonly onClose: () => void;
}

type Confirming = 'apply' | 'discard' | 'reset' | 'revert' | 'delete';

export function WidgetOptionsDialog({
  definition,
  settings,
  baseline,
  isTitleInUse,
  sourceTitle,
  onDelete,
  onApply,
  onClose,
}: WidgetOptionsDialogProps): ReactElement {
  const slot = useSlotClassName();
  const { labels } = useWidgetSettings();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId: string = useId();
  const baseId: string = useId();
  const [draft, setDraft] = useState<OptionsDraft>(() =>
    optionsDraftFrom(settings)
  );
  const [confirming, setConfirming] = useState<Confirming | undefined>(
    undefined
  );
  // The title this dialog filled in from a view's name, so a later change of
  // view may replace it but never a title the viewer typed.
  const autoTitle = useRef<string | undefined>(undefined);

  useEffect(() => {
    const dialog: HTMLDialogElement | null = dialogRef.current;
    if (dialog === null) return undefined;
    const opener: Element | null = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const savedKey: string = optionsPatchKey(
    optionsPatchFrom(definition, optionsDraftFrom(settings))
  );
  const draftPatch: WidgetSettingsPatch = optionsPatchFrom(definition, draft);
  const dirty: boolean = optionsPatchKey(draftPatch) !== savedKey;
  const titleTaken: boolean =
    draft.title.trim() !== '' && isTitleInUse?.(draft.title.trim()) === true;
  const canApply: boolean = dirty && !titleTaken;
  const baselineKey: string | undefined =
    baseline === undefined
      ? undefined
      : optionsPatchKey(
          optionsPatchFrom(definition, optionsDraftFrom(baseline.settings))
        );
  const canRevert: boolean =
    baselineKey !== undefined && baselineKey !== savedKey;
  const canReset: boolean = savedKey !== optionsPatchKey(EMPTY_SETTINGS_PATCH);
  const range = widthRange(definition);
  const views = viewChoices(definition);
  const effectiveFlexible: boolean =
    draft.flexible ?? isFlexible(definition, undefined);

  function requestClose(): void {
    if (confirming !== undefined) {
      setConfirming(undefined);
    } else if (dirty) {
      setConfirming('discard');
    } else {
      onClose();
    }
  }

  function answer(yes: boolean): void {
    const which: Confirming | undefined = confirming;
    setConfirming(undefined);
    if (!yes || which === undefined) return;
    if (which === 'discard') {
      onClose();
    } else if (which === 'apply') {
      onApply(draftPatch);
      onClose();
    } else if (which === 'reset') {
      onApply(EMPTY_SETTINGS_PATCH);
      onClose();
    } else if (which === 'delete') {
      onDelete?.();
      onClose();
    } else if (baseline !== undefined) {
      onApply(
        optionsPatchFrom(definition, optionsDraftFrom(baseline.settings))
      );
      onClose();
    }
  }

  function setOption(key: string, value: OptionValue): void {
    setDraft((current) => ({
      ...current,
      options: { ...current.options, [key]: value },
    }));
  }

  const confirmMessage: Record<Confirming, string> = {
    apply: labels.confirmApply,
    discard: labels.confirmDiscard,
    reset: labels.confirmResetOptions,
    revert: labels.confirmRevertOptions,
    delete: labels.confirmDelete,
  };

  const widths: number[] = [];
  for (let width = range.min; width <= range.max; width += 1)
    widths.push(width);

  return (
    <dialog
      ref={dialogRef}
      className={slot('dialog', 'dwt-options-dialog')}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
    >
      <form
        className="dwt-options"
        onSubmit={(event) => {
          event.preventDefault();
          if (canApply && confirming === undefined) setConfirming('apply');
        }}
      >
        <h2 id={headingId} className="dwt-options-heading">
          {labels.optionsFor(definition.title)}
        </h2>

        <div className="dwt-options-field">
          <label htmlFor={`${baseId}-title`}>{labels.optionsTitleField}</label>
          <input
            id={`${baseId}-title`}
            type="text"
            value={draft.title}
            maxLength={MAX_WIDGET_TITLE_LENGTH}
            placeholder={definition.title}
            aria-invalid={titleTaken}
            {...(titleTaken
              ? { 'aria-describedby': `${baseId}-title-error` }
              : {})}
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
          />
          {titleTaken && (
            <p
              id={`${baseId}-title-error`}
              role="alert"
              className="dwt-options-error"
            >
              {labels.titleInUse}
            </p>
          )}
        </div>

        {range.min < range.max && (
          <div className="dwt-options-field">
            <label htmlFor={`${baseId}-width`}>
              {labels.optionsWidthField}
            </label>
            <select
              id={`${baseId}-width`}
              value={draft.width === undefined ? '' : String(draft.width)}
              onChange={(event) => {
                const value: string = event.target.value;
                setDraft((current) => ({
                  ...current,
                  width: value === '' ? undefined : Number(value),
                }));
              }}
            >
              <option value="">{labels.widthDefault}</option>
              {widths.map((width) => (
                <option key={width} value={String(width)}>
                  {labels.widthOption(width, widthShareLabel(width))}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="dwt-options-check">
          <input
            type="checkbox"
            checked={effectiveFlexible}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                flexible: event.target.checked,
              }))
            }
          />
          {labels.optionsFlexible}
        </label>

        {views.length > 0 && (
          <div className="dwt-options-field">
            <label htmlFor={`${baseId}-view`}>{labels.optionsViewField}</label>
            <select
              id={`${baseId}-view`}
              value={effectiveViewKey(definition, draft.view)}
              onChange={(event) => {
                const value: string = event.target.value;
                setDraft((current) => {
                  const next: OptionsDraft = { ...current, view: value };
                  if (
                    sourceTitle === undefined ||
                    (current.title.trim() !== '' &&
                      current.title !== autoTitle.current)
                  ) {
                    return next;
                  }
                  const label: string | undefined = views.find(
                    (view) => view.key === value
                  )?.label;
                  const startView: string = effectiveViewKey(
                    definition,
                    settings?.view
                  );
                  if (label === undefined || value === startView) {
                    autoTitle.current = undefined;
                    return { ...next, title: '' };
                  }
                  let suggestion: string = labels.suggestedViewTitle(
                    sourceTitle,
                    label
                  );
                  for (
                    let n = 2;
                    isTitleInUse?.(suggestion) === true && n < 50;
                    n += 1
                  ) {
                    suggestion = `${labels.suggestedViewTitle(sourceTitle, label)} (#${n})`;
                  }
                  autoTitle.current = suggestion;
                  return { ...next, title: suggestion };
                });
              }}
            >
              {views.map((view) => (
                <option key={view.key} value={view.key}>
                  {view.key === effectiveViewKey(definition, undefined)
                    ? labels.viewDefault(view.label)
                    : view.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {(definition.options?.length ?? 0) > 0 && (
          <fieldset className="dwt-options-group">
            <legend>{labels.optionsDeclared}</legend>
            {(definition.options ?? []).map((option) => (
              <OptionField
                key={option.key}
                option={option}
                value={draft.options[option.key]}
                id={`${baseId}-opt-${option.key}`}
                onChange={(value) => setOption(option.key, value)}
              />
            ))}
          </fieldset>
        )}

        <div className="dwt-options-actions">
          {confirming === undefined ? (
            <>
              <button
                type="submit"
                className={slot('button', 'dwt-button', 'dwt-button-primary')}
                disabled={!canApply}
              >
                {labels.apply}
              </button>
              <button
                type="button"
                className={slot('button', 'dwt-button')}
                onClick={requestClose}
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                className={slot('button', 'dwt-button')}
                disabled={!canReset}
                onClick={() => setConfirming('reset')}
              >
                {labels.resetToDefaults}
              </button>
              {baseline !== undefined && (
                <button
                  type="button"
                  className={slot('button', 'dwt-button')}
                  disabled={!canRevert}
                  onClick={() => setConfirming('revert')}
                >
                  {labels.revertToBeforeEditing}
                </button>
              )}
              {onDelete !== undefined && (
                <button
                  type="button"
                  className={slot('button', 'dwt-button')}
                  onClick={() => setConfirming('delete')}
                >
                  {labels.optionsDelete}
                </button>
              )}
            </>
          ) : (
            <InlineConfirm
              message={confirmMessage[confirming]}
              onAnswer={answer}
            />
          )}
        </div>
      </form>
    </dialog>
  );
}

export interface OptionFieldProps {
  readonly option: WidgetOption;
  /** The viewer's value, or undefined for the author's default. */
  readonly value: OptionValue | undefined;
  readonly id: string;
  readonly onChange: (value: OptionValue) => void;
}

/** One declared option as a form field. */
export function OptionField({
  option,
  value,
  id,
  onChange,
}: OptionFieldProps): ReactNode {
  const current: OptionValue | undefined = value ?? storedOptionDefault(option);
  switch (option.type) {
    case 'choice':
      return (
        <div className="dwt-options-field">
          <label htmlFor={id}>{option.label}</label>
          <select
            id={id}
            value={String(current ?? option.default)}
            onChange={(event) => onChange(event.target.value)}
          >
            {option.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'number':
      return (
        <NumberField
          option={option}
          id={id}
          value={typeof current === 'number' ? current : option.default}
          onChange={onChange}
        />
      );
    case 'boolean':
      return (
        <label className="dwt-options-check">
          <input
            type="checkbox"
            checked={current === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          {option.label}
        </label>
      );
    case 'text':
      return (
        <div className="dwt-options-field">
          <label htmlFor={id}>{option.label}</label>
          <input
            id={id}
            type="text"
            value={typeof current === 'string' ? current : ''}
            maxLength={option.maxLength}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      );
    case 'color':
      return (
        <div className="dwt-options-field">
          <label htmlFor={id}>{option.label}</label>
          <input
            id={id}
            type="color"
            value={typeof current === 'string' ? current : option.default}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      );
    case 'dateRange':
      return (
        <DateRangeField
          option={option}
          id={id}
          value={typeof current === 'string' ? current : option.default}
          onChange={onChange}
        />
      );
    case 'sort':
      return (
        <SortField
          option={option}
          id={id}
          value={typeof current === 'string' ? current : undefined}
          onChange={onChange}
        />
      );
    case 'columns':
      return (
        <ColumnsField
          option={option}
          value={Array.isArray(current) ? current : option.default}
          onChange={onChange}
        />
      );
  }
}

/** A number input that keeps what the viewer typed until it is valid. */
function NumberField({
  option,
  id,
  value,
  onChange,
}: {
  readonly option: NumberOption;
  readonly id: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => {
    setText((typed) => (Number(typed) === value ? typed : String(value)));
  }, [value]);
  return (
    <div className="dwt-options-field">
      <label htmlFor={id}>{option.label}</label>
      <input
        id={id}
        type="number"
        value={text}
        min={option.min}
        max={option.max}
        step={option.step ?? 1}
        onChange={(event) => {
          setText(event.target.value);
          const parsed: number = Number(event.target.value);
          if (
            event.target.value.trim() !== '' &&
            coerceOptionValue(option, parsed) !== undefined
          ) {
            onChange(parsed);
          }
        }}
      />
    </div>
  );
}

function DateRangeField({
  option,
  id,
  value,
  onChange,
}: {
  readonly option: DateRangeOption;
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const { labels } = useWidgetSettings();
  const presets: readonly { value: string; label: string }[] =
    option.presets ??
    DATE_RANGE_PRESETS.map((preset) => ({
      value: preset,
      label: DATE_RANGE_PRESET_LABELS[preset],
    }));
  const known: boolean = presets.some((preset) => preset.value === value);
  return (
    <div className="dwt-options-field">
      <label htmlFor={id}>{option.label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!known && <option value={value}>{labels.customRange(value)}</option>}
        {presets.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortField({
  option,
  id,
  value,
  onChange,
}: {
  readonly option: SortOption;
  readonly id: string;
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const { labels } = useWidgetSettings();
  const parsed = value === undefined ? undefined : parseSortValue(value);
  const column: string = parsed?.column ?? '';
  const direction: string = parsed?.direction ?? 'desc';
  return (
    <div className="dwt-options-field">
      <label htmlFor={id}>{option.label}</label>
      <span className="dwt-options-pair">
        <select
          id={id}
          value={column}
          onChange={(event) => onChange(`${event.target.value}:${direction}`)}
        >
          {option.default === undefined && column === '' && (
            <option value="">{labels.sortDefault}</option>
          )}
          {option.columns.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          aria-label={option.label}
          value={direction}
          disabled={column === ''}
          onChange={(event) => onChange(`${column}:${event.target.value}`)}
        >
          <option value="asc">{labels.sortAscending}</option>
          <option value="desc">{labels.sortDescending}</option>
        </select>
      </span>
    </div>
  );
}

function ColumnsField({
  option,
  value,
  onChange,
}: {
  readonly option: ColumnsOption;
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
}): ReactNode {
  const { labels } = useWidgetSettings();
  const slot = useSlotClassName();
  // Shown columns first, in the chosen order, then the ones left out.
  const ordered: readonly string[] = [
    ...value,
    ...option.columns.map((c) => c.key).filter((key) => !value.includes(key)),
  ];
  const labelOf = (key: string): string =>
    option.columns.find((c) => c.key === key)?.label ?? key;

  function move(key: string, by: -1 | 1): void {
    const next: string[] = [...value];
    const from: number = next.indexOf(key);
    const to: number = from + by;
    if (from === -1 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to] as string, next[from] as string];
    onChange(next);
  }

  return (
    <fieldset className="dwt-options-columns">
      <legend>{option.label}</legend>
      <ul>
        {ordered.map((key) => {
          const shown: boolean = value.includes(key);
          const name: string = labelOf(key);
          return (
            <li key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={shown && value.length === 1}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, key]
                        : value.filter((k) => k !== key)
                    )
                  }
                />
                {name}
              </label>
              {shown && (
                <span className="dwt-options-move">
                  <button
                    type="button"
                    className={slot('button', 'dwt-button', 'dwt-icon-button')}
                    aria-label={labels.moveColumnUp(name)}
                    title={labels.moveColumnUp(name)}
                    disabled={value.indexOf(key) === 0}
                    onClick={() => move(key, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className={slot('button', 'dwt-button', 'dwt-icon-button')}
                    aria-label={labels.moveColumnDown(name)}
                    title={labels.moveColumnDown(name)}
                    disabled={value.indexOf(key) === value.length - 1}
                    onClick={() => move(key, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
