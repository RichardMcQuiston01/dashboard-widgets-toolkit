# Design: theming

- **Status:** All five steps are built: token reference and `createTheme`
  (0.13.0), `WidgetTheme` and the `Dashboard` `theme` prop, `checkTheme` and
  `themePresets`.
- **Date:** 2026-10-10
- **Applies to:** `@richardmcquiston01/dashboard-widgets-toolkit` 0.12.x
- **Author:** Richard McQuiston (drafted with Claude Code)

## 1. Summary

Every color, the font and the main spacing already come from `--dwt-*` CSS custom
properties, with built-in light and dark values in `styles.css`. An app can
override them with plain CSS today, but the tokens are undocumented, there is no
JavaScript path (a theme from a database, a brand setting, a user choice), and
nothing stops a bad value from producing an unreadable chart.

This design makes **CSS custom properties the one theming contract** and adds a
small runtime-neutral helper that produces correct, scoped CSS from a typed token
object. No styling logic moves into JavaScript at render time, so server
rendering, caching and the consumer's own stylesheets keep working.

### Non-goals

- A theme context that restyles through inline JavaScript.
- Per-widget themes (a widget already carries a `className`; the tokens cascade).
- Replacing `styles.css`. It stays optional, and the tokens keep their `var(--dwt-*, fallback)` defaults so charts read without it.

## 2. Today

- `styles.css` sets the tokens on `.dwt-dashboard` and `.dwt-card` at zero
  specificity (`:where()`), so any rule wins without `!important`.
- Dark mode: `prefers-color-scheme: dark` unless `<html data-theme="light">`;
  `data-theme="dark"` or a `dark` class on `<html>` forces it.
- Chart colors in `palette.ts` read `var(--dwt-*, #fallback)`.

### A gotcha this design has to respect

The defaults are declared **on the dashboard element itself**, not on `:root`.
A custom property set on an ancestor (`:root { --dwt-text: red }`, or inline on a
wrapper `<div>`) is shadowed by the declaration on `.dwt-dashboard`, so it does
nothing. An override must target `.dwt-dashboard` and `.dwt-card`, and must beat
the dark-mode rules, which have specificity (0,1,0). `createTheme` exists largely
to emit selectors that get this right.

## 3. Token reference (step 1)

Documented in GETTING_STARTED ("Theming"), with the light and dark default of each
token. Names in the table are the `createTheme` keys.

| Key                                       | Variable                                                          | Kind       |
| ----------------------------------------- | ----------------------------------------------------------------- | ---------- |
| `font`                                    | `--dwt-font`                                                      | font stack |
| `surface`, `page`                         | `--dwt-surface`, `--dwt-page`                                     | color      |
| `text`, `textSecondary`, `textMuted`      | `--dwt-text`, `--dwt-text-secondary`, `--dwt-text-muted`          | color      |
| `border`, `grid`, `baseline`, `crosshair` | `--dwt-border`, `--dwt-grid`, `--dwt-baseline`, `--dwt-crosshair` | color      |
| `link`, `focus`                           | `--dwt-link`, `--dwt-focus`                                       | color      |
| `good`, `bad`                             | `--dwt-good`, `--dwt-bad`                                         | color      |
| `meterTrack`, `barTrack`, `buttonHover`   | `--dwt-meter-track`, `--dwt-bar-track`, `--dwt-button-hover`      | color      |
| `series` (1 to 8 values)                  | `--dwt-series-1` to `--dwt-series-8`                              | color      |
| `radius`, `gap`, `padding`, `minColumn`   | `--dwt-radius`, `--dwt-gap`, `--dwt-padding`, `--dwt-min-column`  | length     |

`--dwt-width` is set per widget by the grid and is not a theme token.

## 4. `createTheme` (step 2, core)

```ts
interface ThemeTokens {
  font?: string;
  surface?: string; /* ...every color key... */
  series?: readonly string[]; // 1 to MAX_GRAPH_SERIES, fills slots 1..n
  radius?: string; gap?: string; padding?: string; minColumn?: string;
}

interface ThemeOptions {
  name: string;          // [a-z][a-z0-9-]*, also the default scope
  scope?: string;        // ancestor selector; default [data-dwt-theme='<name>']
  base?: ThemeTokens;    // both modes
  light?: ThemeTokens;   // light mode only
  dark?: ThemeTokens;    // dark mode only
}

interface WidgetThemeStyles {
  name: string;
  scope: string;
  css: string;           // for a <style> element or an SSR <head>
  variables: { base: Record<string, string>; light: ...; dark: ... };
}

function createTheme(options: ThemeOptions): Result<WidgetThemeStyles>;
```

Use: put the CSS in the page, and put `data-dwt-theme="<name>"` on any ancestor of
the dashboard. Several themes can live on one page.

### Generated CSS

For scope `S`, targets are `S .dwt-dashboard, S .dwt-card` (specificity (0,2,0),
above the built-in rules).

1. `base`: one plain block on the targets.
2. `light`: forced (`:root:where([data-theme='light']) …`) and OS light
   (`@media (prefers-color-scheme: light) { :root:where(:not([data-theme='dark'], .dark)) … }`).
3. `dark`: forced (`:root:where([data-theme='dark'], .dark) …`) and OS dark
   (`@media (prefers-color-scheme: dark) { :root:where(:not([data-theme='light'])) … }`).

Mode blocks are (0,3,0), so they beat `base`, which beats the built-in values. A
token a theme does not set keeps its built-in value in each mode, so a theme can
change only the accent and leave the rest.

### Validation (it returns `Err`, never throws)

Values land in a stylesheet string, so they are checked, not escaped:

- Colors: `#hex` (3, 4, 6 or 8 digits), a color function (`rgb`, `hsl`, `hwb`,
  `lab`, `lch`, `oklab`, `oklch`, `color`, `color-mix`, `light-dark`), `var(--x)`,
  or a keyword (`transparent`, `currentColor`, named colors).
- Lengths: a number with a unit (`px`, `rem`, `em`, `%`, `ch`, `vw`, `vh`), `0`, or
  `calc()`, `min()`, `max()`, `clamp()`.
- Font: letters, digits, spaces, commas, hyphens and balanced quotes.
- Nothing may contain `;`, braces, `<`, `>`, `\`, `@`, `/*`, `url(` or `expression(`,
  and parentheses must balance.
- Unknown keys, an empty theme, a bad `name`, an unsafe `scope` and more than
  `MAX_GRAPH_SERIES` series are errors.

Error messages name the mode, the key, the value and the rule it broke, for example
`createTheme "brand": dark.surface "rgb(0,0" has unbalanced parentheses`.

## 5. React wrapper (step 3, built)

`<WidgetTheme theme={…}>` renders the `<style>` element and a
`<div data-dwt-theme>` around its children, so a theme scopes to a subtree without
the app touching the attribute. `Dashboard` takes an optional `theme` prop that
does the same. SSR output is the same markup, no effects. As built: with a custom
`scope` only the `<style>` is rendered (the matching ancestor is the consumer's), the
CSS is written with `dangerouslySetInnerHTML` because React would escape the quotes in
the selector (it was validated by `createTheme`), and `nonce` is passed to the
`<style>` for a strict CSP.

## 6. Contrast and color-vision checks (step 4, built)

`checkTheme(styles)` returns warnings (never failures). As built, per mode the theme
changes: text, secondary, muted and link on the surface at 4.5:1; focus, good and
bad at 3:1; chart colors at 2:1 (the built-in light yellow is 2.1:1, and charts have
a legend, tooltips and a table twin); and neighbouring series at least 0.10 apart in
OKLab, and 0.05 with simulated protanopia, deuteranopia and tritanopia (Machado
matrices). The thresholds were calibrated by measuring the built-in palettes, which
pass. Values it cannot read (`var()`, `color-mix()`, most named colors) give an
`info` entry and skip the checks that use them. It needs the built-in values for
tokens a theme leaves unset, so they live in a core table (`THEME_DEFAULTS`) that a
test compares with `styles.css`.

## 7. Presets (step 5, built)

Plain `ThemeOptions` objects (`highContrast`, `compact`, `mono`) that double as
documentation of what a theme looks like. Each color preset is validated by
`checkTheme` in a test. They live in the core entry (the objects are small), which
answers the open question below. `mono` orders eight grays so neighbours differ
strongly; grays that close cannot be told apart by lightness alone, so it relies on
the legend.

## 8. Decisions

1. **CSS variables stay the contract.** The helper only writes CSS.
2. **Scope by attribute, not by `:root`.** Because of the shadowing in section 2, a
   `:root` override cannot work.
3. **`createTheme` lives in the core**, so a NestJS API, a build script or an SSR
   server can generate the CSS without React.
4. **No inline-style output.** Inline variables on an ancestor are shadowed (section
   2), so the helper does not offer one. A future major version could move the
   defaults to `:root`, which would allow it; that is a breaking change and is out
   of scope.
5. **`light`/`dark` per token are optional.** Unset tokens fall through to the
   built-in values.

## 9. Open questions

- Should `styles.css` move its defaults to `:where(:root)` in a future major
  version, so a plain `:root` override and inline ancestor styles work?
- (Answered) Presets ship in the core entry: three small objects.
