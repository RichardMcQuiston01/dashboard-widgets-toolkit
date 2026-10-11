---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Theming, the rest. React: `WidgetTheme` renders a theme's `<style>` and a scope wrapper (only the `<style>` for a custom `scope`; `nonce` supported), and `Dashboard` takes a `theme` prop that does the same. Core: `checkTheme` returns contrast and color-vision warnings for a theme (text 4.5:1; focus, good and bad 3:1; chart marks 2:1; neighbouring series distinct in OKLab and under simulated protanopia, deuteranopia and tritanopia), with `info` entries for values it cannot read; the color helpers `parseColor`, `contrastRatio`, `colorDistance`, `simulateVision`, `composite` and `relativeLuminance` are exported; `THEME_DEFAULTS` holds the built-in token values (a test keeps it equal to `styles.css`); `themePresets` has `highContrast`, `compact` and `mono`.
