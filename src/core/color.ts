/**
 * Color math for theme checks: parsing, WCAG contrast, perceptual distance and
 * color-vision simulation. Pure functions on sRGB values in 0 to 1; nothing here
 * touches a DOM. A value this module cannot read (a `var()`, `color-mix()`, a
 * named color other than black, white and transparent) parses to `undefined`.
 */

/** An sRGB color, each channel and the alpha from 0 to 1. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export type VisionType = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const VISION_TYPES: readonly VisionType[] = [
  'protanopia',
  'deuteranopia',
  'tritanopia',
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function channel(text: string): number | undefined {
  const trimmed: string = text.trim();
  const number: number = trimmed.endsWith('%')
    ? Number.parseFloat(trimmed) / 100
    : Number.parseFloat(trimmed) / 255;
  return Number.isFinite(number) ? clamp01(number) : undefined;
}

function alphaOf(text: string | undefined): number | undefined {
  if (text === undefined) return 1;
  const trimmed: string = text.trim();
  const number: number = trimmed.endsWith('%')
    ? Number.parseFloat(trimmed) / 100
    : Number.parseFloat(trimmed);
  return Number.isFinite(number) ? clamp01(number) : undefined;
}

/** Splits `a b c / d` or `a, b, c, d` into its parts and the alpha part. */
function parts(body: string): {
  readonly values: string[];
  readonly alpha: string | undefined;
} {
  const [main = '', alpha] = body.split('/');
  const values: string[] = main
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (alpha === undefined && values.length === 4) {
    return { values: values.slice(0, 3), alpha: values[3] };
  }
  return { values, alpha: alpha?.trim() };
}

function hue(text: string): number | undefined {
  const trimmed: string = text.trim().toLowerCase();
  const number: number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return undefined;
  if (trimmed.endsWith('turn')) return number * 360;
  if (trimmed.endsWith('rad')) return (number * 180) / Math.PI;
  return number;
}

function fraction(text: string, whole: number): number | undefined {
  const trimmed: string = text.trim();
  const number: number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return undefined;
  return trimmed.endsWith('%') ? (number / 100) * whole : number;
}

function srgbEncode(linear: number): number {
  const value: number = clamp01(linear);
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

function srgbDecode(encoded: number): number {
  return encoded <= 0.04045
    ? encoded / 12.92
    : ((encoded + 0.055) / 1.055) ** 2.4;
}

function fromOklab(lightness: number, a: number, b: number): Rgba {
  const l: number = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m: number = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s: number = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: srgbEncode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: srgbEncode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: srgbEncode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1,
  };
}

function fromHsl(h: number, s: number, l: number): Rgba {
  const hueValue: number = ((h % 360) + 360) % 360;
  const k = (n: number): number => (n + hueValue / 30) % 12;
  const amount: number = s * Math.min(l, 1 - l);
  const f = (n: number): number =>
    l - amount * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: clamp01(f(0)), g: clamp01(f(8)), b: clamp01(f(4)), a: 1 };
}

/**
 * Reads `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `oklab()`, `oklch()`,
 * `black`, `white` and `transparent`. Anything else (including `var()` and
 * `color-mix()`, which depend on the page) is `undefined`.
 */
export function parseColor(value: string): Rgba | undefined {
  const text: string = value.trim().toLowerCase();
  if (text === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (text === 'white') return { r: 1, g: 1, b: 1, a: 1 };
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (text.startsWith('#')) {
    const hex: string = text.slice(1);
    if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) {
      return undefined;
    }
    const full: string =
      hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const byte = (index: number): number =>
      Number.parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255;
    return {
      r: byte(0),
      g: byte(1),
      b: byte(2),
      a: full.length === 8 ? byte(3) : 1,
    };
  }
  const match: RegExpMatchArray | null = text.match(
    /^(rgba?|hsla?|oklab|oklch)\((.*)\)$/
  );
  if (match === null) return undefined;
  const kind: string = match[1] ?? '';
  const { values, alpha } = parts(match[2] ?? '');
  const alphaValue: number | undefined = alphaOf(alpha);
  if (values.length !== 3 || alphaValue === undefined) return undefined;
  const [first = '', second = '', third = ''] = values;
  if (kind === 'rgb' || kind === 'rgba') {
    const r = channel(first);
    const g = channel(second);
    const b = channel(third);
    return r === undefined || g === undefined || b === undefined
      ? undefined
      : { r, g, b, a: alphaValue };
  }
  if (kind === 'hsl' || kind === 'hsla') {
    const h = hue(first);
    const s = fraction(second, 1);
    const l = fraction(third, 1);
    return h === undefined || s === undefined || l === undefined
      ? undefined
      : { ...fromHsl(h, clamp01(s), clamp01(l)), a: alphaValue };
  }
  const lightness = fraction(first, 1);
  if (lightness === undefined) return undefined;
  if (kind === 'oklab') {
    const a = fraction(second, 0.4);
    const b = fraction(third, 0.4);
    return a === undefined || b === undefined
      ? undefined
      : { ...fromOklab(lightness, a, b), a: alphaValue };
  }
  const chroma = fraction(second, 0.4);
  const h = hue(third);
  if (chroma === undefined || h === undefined) return undefined;
  const radians: number = (h * Math.PI) / 180;
  return {
    ...fromOklab(
      lightness,
      chroma * Math.cos(radians),
      chroma * Math.sin(radians)
    ),
    a: alphaValue,
  };
}

/** `top` drawn over an opaque `bottom`; the result is opaque. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a: number = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * srgbDecode(color.r) +
    0.7152 * srgbDecode(color.g) +
    0.0722 * srgbDecode(color.b)
  );
}

/** WCAG contrast ratio of two opaque colors, 1 to 21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const first: number = relativeLuminance(a);
  const second: number = relativeLuminance(b);
  const lighter: number = Math.max(first, second);
  const darker: number = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The color in OKLab: `[L, a, b]`, where equal steps look about equal. */
export function toOklab(color: Rgba): readonly [number, number, number] {
  const r: number = srgbDecode(color.r);
  const g: number = srgbDecode(color.g);
  const b: number = srgbDecode(color.b);
  const l: number = Math.cbrt(
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  );
  const m: number = Math.cbrt(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  );
  const s: number = Math.cbrt(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance of two opaque colors (Euclidean in OKLab). */
export function colorDistance(a: Rgba, b: Rgba): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// Brettel/Vienot-style full-severity matrices on linear RGB (Machado et al. 2009).
const VISION_MATRICES: Readonly<
  Record<
    VisionType,
    readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
  >
> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882,
    -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182,
    0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733,
    0.691367, 0.3039,
  ],
};

/** How an opaque color looks with the given color-vision deficiency. */
export function simulateVision(color: Rgba, type: VisionType): Rgba {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = VISION_MATRICES[type];
  const r: number = srgbDecode(color.r);
  const g: number = srgbDecode(color.g);
  const b: number = srgbDecode(color.b);
  return {
    r: srgbEncode(m0 * r + m1 * g + m2 * b),
    g: srgbEncode(m3 * r + m4 * g + m5 * b),
    b: srgbEncode(m6 * r + m7 * g + m8 * b),
    a: 1,
  };
}
