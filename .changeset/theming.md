---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Theming. New `createTheme` in the core turns typed tokens (`base`, `light`, `dark`; colors, chart series, font, radius, gap, padding) into scoped CSS for the `--dwt-*` custom properties, with specific errors for invalid values and anything that could break out of a declaration. GETTING_STARTED now documents every token with its light and dark default, and explains why variables set on `:root` or a wrapper are shadowed.
