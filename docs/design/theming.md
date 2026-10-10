# Design: theming

- **Status:** Steps 1 and 2 (token reference, `createTheme`) targeted for 0.13.0.
  Steps 3 to 5 are planned.
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

## 5. React wrapper (step 3, planned)

`<WidgetTheme theme={…}>` renders the `<style>` element once and a
`<div data-dwt-theme>` around its children, so a theme scopes to a subtree without
the app touching the attribute. `Dashboard` would take an optional `theme` prop that
does the same. SSR output is the same markup, no effects.

## 6. Contrast and color-vision checks (step 4, planned)

`checkTheme(styles)` returns warnings (never failures): text on surface below WCAG
AA (4.5:1; 3:1 for large text and chart marks), link on surface, focus ring against
surface, and adjacent series colors closer than the dataviz threshold in either
mode. This follows the CLAUDE.md rule to re-validate the palette whenever it
changes. It needs the built-in values for tokens a theme leaves unset, so the
defaults move into a core table that `styles.css` is tested against.

## 7. Presets (step 5, planned)

Plain `ThemeOptions` objects (`highContrast`, `compact`, `mono`) that double as
documentation of what a theme looks like. Added after the checks, so each preset can
be validated by them in a test.

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
- Should presets ship in the main entry or a `./themes` subpath, to keep core-only
  bundles small?
