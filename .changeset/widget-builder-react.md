---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Widget Builder, React building blocks: `useWidgetDraft`, `WidgetOptionsForm`, `WidgetViewsForm` and `WidgetPreview` in `./react`, over new headless pieces in `./builder`.

`useWidgetDraft(source, definition)` keeps an admin form's state: plain fields (`title`, `width`, `roles`, ...) are edited as a pending patch, so an empty title never becomes a definition, with `problems` by field, a `candidate` definition to preview and `commit()` returning a `Result`; options and views change the definition at once through `exposeOption`, `updateOption`, `hideOption`, `addView` and `removeView`, so `draft.definition` is always valid for its source. `WidgetOptionsForm` edits the label and default of each exposed option (reusing the Options dialog's field renderers) and lists the source's other options to add; `WidgetViewsForm` removes views and adds the ones the source can serve; both show a refused change's reason beside it. `WidgetPreview` draws the widget with the real renderers from the source's `sample`, with no provider call, and says why when it can't (no sample, or a view only the provider builds). Words come from a `labels` prop (`DEFAULT_BUILDER_LABELS`), classes are `dwt-builder-*`, and the stylesheet defines the tokens for them outside a dashboard.

Headless, in `./builder`: `updateOption`, `previewWidget(source, definition, { view, optionValues })` and the draft functions the hook wraps (`newDraft`, `setDraftField`, `draftProblems`, `draftCandidate`, `commitDraft`), so another framework can build the same screen.
