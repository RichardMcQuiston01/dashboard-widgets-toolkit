/** The words the builder forms use. Pass `labels` to change any of them. */
export interface BuilderLabels {
  readonly optionsHeading: string;
  readonly optionLabel: string;
  readonly optionDefault: string;
  readonly optionRemove: string;
  readonly optionsAvailable: string;
  readonly optionsNoneAvailable: string;
  readonly optionsLimitReached: string;
  readonly optionAdd: (label: string) => string;
  readonly viewsHeading: string;
  readonly viewsNone: string;
  readonly viewRemove: (label: string) => string;
  readonly viewAddField: string;
  readonly viewAddPlaceholder: string;
  readonly viewsNoneAvailable: string;
  readonly viewsLimitReached: string;
  readonly previewNoSample: string;
}

export const DEFAULT_BUILDER_LABELS: BuilderLabels = {
  optionsHeading: 'Options viewers can change',
  optionLabel: 'Label',
  optionDefault: 'Default',
  optionRemove: 'Remove',
  optionsAvailable: 'Available from the source',
  optionsNoneAvailable: 'The source offers no other options.',
  optionsLimitReached: 'This widget has all the options it may have.',
  optionAdd: (label) => `Add ${label}`,
  viewsHeading: 'Views',
  viewsNone: 'No other views.',
  viewRemove: (label) => `Remove ${label}`,
  viewAddField: 'Add a view',
  viewAddPlaceholder: 'Choose a view…',
  viewsNoneAvailable: 'The source offers no more views.',
  viewsLimitReached: 'This widget has all the views it may have.',
  previewNoSample: 'Add a "sample" to the source to preview here.',
};
