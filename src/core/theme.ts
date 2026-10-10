/**
 * Theming: turns a typed token object into scoped CSS for the `--dwt-*` custom
 * properties. Runtime-neutral: it only builds a string, so a Node API, a build
 * script or an SSR server can produce a theme without React or a DOM.
 *
 * The built-in defaults are declared on `.dwt-dashboard` and `.dwt-card`, so a
 * variable set on an ancestor is shadowed. The generated selectors therefore
 * target those two classes beneath a scope and out-rank the built-in dark rules.
 * See docs/design/theming.md.
 */

import { MAX_GRAPH_SERIES } from './payload.js';
import { err, ok, type Result } from './result.js';

export type ThemeColorKey =
  | 'surface'
  | 'page'
  | 'text'
  | 'textSecondary'
  | 'textMuted'
  | 'border'
  | 'grid'
  | 'baseline'
  | 'crosshair'
  | 'link'
  | 'focus'
  | 'good'
  | 'bad'
  | 'meterTrack'
  | 'barTrack'
  | 'buttonHover';

export type ThemeLengthKey = 'radius' | 'gap' | 'padding' | 'minColumn';

export type ThemeTokenKey = ThemeColorKey | ThemeLengthKey | 'font';

/** The CSS custom property each token key sets (series are `--dwt-series-N`). */
export const THEME_TOKEN_VARIABLES: Readonly<Record<ThemeTokenKey, string>> = {
  font: '--dwt-font',
  surface: '--dwt-surface',
  page: '--dwt-page',
  text: '--dwt-text',
  textSecondary: '--dwt-text-secondary',
  textMuted: '--dwt-text-muted',
  border: '--dwt-border',
  grid: '--dwt-grid',
  baseline: '--dwt-baseline',
  crosshair: '--dwt-crosshair',
  link: '--dwt-link',
  focus: '--dwt-focus',
  good: '--dwt-good',
  bad: '--dwt-bad',
  meterTrack: '--dwt-meter-track',
  barTrack: '--dwt-bar-track',
  buttonHover: '--dwt-button-hover',
  radius: '--dwt-radius',
  gap: '--dwt-gap',
  padding: '--dwt-padding',
  minColumn: '--dwt-min-column',
};

type TokenKind = 'color' | 'length' | 'font';

const LENGTH_KEYS: ReadonlySet<string> = new Set([
  'radius',
  'gap',
  'padding',
  'minColumn',
]);

function kindOf(key: ThemeTokenKey): TokenKind {
  if (key === 'font') {
    return 'font';
  }
  return LENGTH_KEYS.has(key) ? 'length' : 'color';
}

export type ThemeTokens = {
  readonly [Key in ThemeTokenKey]?: string;
} & {
  /** Chart colors in order; fills `--dwt-series-1` to `--dwt-series-N`. */
  readonly series?: readonly string[];
};

export interface ThemeOptions {
  /** Lower-case letters, digits and hyphens, starting with a letter. */
  readonly name: string;
  /**
   * Selector of an ancestor of the dashboard. Defaults to
   * `[data-dwt-theme='<name>']`. Letters, digits, `_ - [ ] = . # ' "` and spaces
   * only.
   */
  readonly scope?: string;
  /** Applied in light and dark mode. */
  readonly base?: ThemeTokens;
  /** Applied in light mode only; wins over `base`. */
  readonly light?: ThemeTokens;
  /** Applied in dark mode only; wins over `base`. */
  readonly dark?: ThemeTokens;
}

export type ThemeMode = 'base' | 'light' | 'dark';

export interface WidgetThemeStyles {
  readonly name: string;
  readonly scope: string;
  /** For a `<style>` element or the head of a server-rendered page. */
  readonly css: string;
  /** The resolved custom properties per mode, e.g. `{'--dwt-surface': '#fff'}`. */
  readonly variables: Readonly<
    Record<ThemeMode, Readonly<Record<string, string>>>
  >;
}

const NAME_PATTERN: RegExp = /^[a-z][a-z0-9-]*$/;
const SCOPE_PATTERN: RegExp = /^[A-Za-z0-9_\-[\]=.# '"]+$/;
const HEX_COLOR: RegExp = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION: RegExp =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(.+\)$/i;
const VAR_REFERENCE: RegExp = /^var\(\s*--[A-Za-z0-9_-]+\s*(?:,.+)?\)$/;
const COLOR_KEYWORD: RegExp = /^[A-Za-z]+$/;
const LENGTH_VALUE: RegExp =
  /^(?:0|-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|ch|vw|vh|cqw|cqh))$/;
const LENGTH_FUNCTION: RegExp = /^(?:calc|min|max|clamp)\(.+\)$/i;
const FONT_VALUE: RegExp = /^[A-Za-z0-9 ,'"_-]+$/;

/** Why a value is unsafe to write into a stylesheet, or null when it is fine. */
function unsafeReason(value: string): string | null {
  if (
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  ) {
    return 'contains a control character or line break';
  }
  if (/[;{}<>\\@]/.test(value)) {
    return 'contains one of ; { } < > \\ @';
  }
  const lower: string = value.toLowerCase();
  if (lower.includes('/*') || lower.includes('*/')) {
    return 'contains a comment marker';
  }
  if (lower.includes('url(') || lower.includes('expression(')) {
    return 'contains url( or expression(';
  }
  let depth: number = 0;
  for (const character of value) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        return 'has unbalanced parentheses';
      }
    }
  }
  return depth === 0 ? null : 'has unbalanced parentheses';
}

function countOf(value: string, character: string): number {
  return value.split(character).length - 1;
}

/** Why `value` is not a valid `kind`, or null when it is. */
function invalidReason(kind: TokenKind, value: string): string | null {
  if (value !== value.trim() || value === '') {
    return 'must not be empty or have leading or trailing spaces';
  }
  if (kind === 'font') {
    if (!FONT_VALUE.test(value)) {
      return 'allows only letters, digits, spaces, commas, hyphens, underscores and quotes';
    }
    if (countOf(value, "'") % 2 !== 0 || countOf(value, '"') % 2 !== 0) {
      return 'has an unclosed quote';
    }
    return null;
  }
  const unsafe: string | null = unsafeReason(value);
  if (unsafe !== null) {
    return unsafe;
  }
  if (value.includes("'") || value.includes('"')) {
    return 'must not contain quotes';
  }
  if (kind === 'color') {
    const valid: boolean =
      HEX_COLOR.test(value) ||
      COLOR_FUNCTION.test(value) ||
      VAR_REFERENCE.test(value) ||
      COLOR_KEYWORD.test(value);
    return valid
      ? null
      : 'is not a color (use #hex, rgb(), hsl(), oklch() and similar, var(--name) or a keyword)';
  }
  const valid: boolean =
    LENGTH_VALUE.test(value) ||
    LENGTH_FUNCTION.test(value) ||
    VAR_REFERENCE.test(value);
  return valid
    ? null
    : 'is not a length (use a number with px, rem, em, %, ch, vw or vh, 0, calc(), min(), max(), clamp() or var(--name))';
}

function collectVariables(
  themeName: string,
  mode: ThemeMode,
  tokens: ThemeTokens | undefined
): Result<Record<string, string>> {
  const variables: Record<string, string> = {};
  if (tokens === undefined) {
    return ok(variables);
  }
  const label = (key: string): string =>
    `createTheme "${themeName}": ${mode}.${key}`;
  const knownKeys: readonly string[] = [
    ...Object.keys(THEME_TOKEN_VARIABLES),
    'series',
  ];
  for (const key of Object.keys(tokens)) {
    if (!knownKeys.includes(key)) {
      return err(
        `${label(key)} is not a theme token. Known tokens: ${knownKeys.join(', ')}.`
      );
    }
  }
  for (const key of Object.keys(THEME_TOKEN_VARIABLES) as ThemeTokenKey[]) {
    const value: string | undefined = tokens[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      return err(`${label(key)} must be a string, got ${typeof value}.`);
    }
    const reason: string | null = invalidReason(kindOf(key), value);
    if (reason !== null) {
      return err(`${label(key)} "${value}" ${reason}.`);
    }
    variables[THEME_TOKEN_VARIABLES[key]] = value;
  }
  const series: readonly string[] | undefined = tokens.series;
  if (series !== undefined) {
    if (!Array.isArray(series) || series.length === 0) {
      return err(`${label('series')} must be a non-empty array of colors.`);
    }
    if (series.length > MAX_GRAPH_SERIES) {
      return err(
        `${label('series')} has ${series.length} colors; charts draw at most ${MAX_GRAPH_SERIES} series.`
      );
    }
    for (const [index, value] of series.entries()) {
      const reason: string | null =
        typeof value === 'string'
          ? invalidReason('color', value)
          : 'must be a string';
      if (reason !== null) {
        return err(
          `${label(`series[${index}]`)} "${String(value)}" ${reason}.`
        );
      }
      variables[`--dwt-series-${index + 1}`] = value;
    }
  }
  return ok(variables);
}

function declarations(variables: Readonly<Record<string, string>>): string {
  return Object.entries(variables)
    .map(([variable, value]) => `  ${variable}: ${value};`)
    .join('\n');
}

/** `prefix scope .dwt-dashboard, prefix scope .dwt-card`. */
function targets(prefix: string, scope: string): string {
  const lead: string = prefix === '' ? '' : `${prefix} `;
  return `${lead}${scope} .dwt-dashboard,\n${lead}${scope} .dwt-card`;
}

function rule(
  prefix: string,
  scope: string,
  variables: Readonly<Record<string, string>>
): string {
  return `${targets(prefix, scope)} {\n${declarations(variables)}\n}`;
}

/**
 * Builds the CSS for a theme. Tokens left unset keep their built-in value in
 * each mode. Returns an error naming the mode, the token and the value when
 * anything is invalid.
 */
export function createTheme(options: ThemeOptions): Result<WidgetThemeStyles> {
  const name: string = options.name;
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    return err(
      `createTheme: name "${String(name)}" must start with a lower-case letter and contain only lower-case letters, digits and hyphens.`
    );
  }
  const scope: string = (options.scope ?? `[data-dwt-theme='${name}']`).trim();
  if (scope === '' || !SCOPE_PATTERN.test(scope)) {
    return err(
      `createTheme "${name}": scope "${scope}" must be a selector of letters, digits and _ - [ ] = . # ' " or spaces (no commas, colons or combinators).`
    );
  }

  const modes: readonly ThemeMode[] = ['base', 'light', 'dark'];
  const variables: Record<ThemeMode, Record<string, string>> = {
    base: {},
    light: {},
    dark: {},
  };
  for (const mode of modes) {
    const collected: Result<Record<string, string>> = collectVariables(
      name,
      mode,
      options[mode]
    );
    if (!collected.ok) {
      return collected;
    }
    variables[mode] = collected.value;
  }
  if (modes.every((mode) => Object.keys(variables[mode]).length === 0)) {
    return err(
      `createTheme "${name}": no tokens were set. Pass at least one value in base, light or dark.`
    );
  }

  const blocks: string[] = [];
  if (Object.keys(variables.base).length > 0) {
    blocks.push(rule('', scope, variables.base));
  }
  if (Object.keys(variables.light).length > 0) {
    blocks.push(
      rule(":root:where([data-theme='light'])", scope, variables.light)
    );
    blocks.push(
      `@media (prefers-color-scheme: light) {\n${indent(
        rule(
          ":root:where(:not([data-theme='dark'], .dark))",
          scope,
          variables.light
        )
      )}\n}`
    );
  }
  if (Object.keys(variables.dark).length > 0) {
    blocks.push(
      rule(":root:where([data-theme='dark'], .dark)", scope, variables.dark)
    );
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n${indent(
        rule(":root:where(:not([data-theme='light']))", scope, variables.dark)
      )}\n}`
    );
  }

  return ok({
    name,
    scope,
    css: `${blocks.join('\n\n')}\n`,
    variables,
  });
}

function indent(block: string): string {
  return block
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
