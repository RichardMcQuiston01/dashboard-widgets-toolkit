---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

`/vue`: the Widget Builder building blocks. `useWidgetDraft` (form state over the draft functions, with an optional viewer `policy`; `source` and `policy` may be refs or getters), `WidgetOptionsForm`, `WidgetViewsForm` and `WidgetPreview` draw the same markup as their React counterparts (the parity tests compare them). `BuilderLabels` and `DEFAULT_BUILDER_LABELS` now live in `./builder`, so both renderers share them; `./react` still exports them.
