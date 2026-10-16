/**
 * Turns a rendered chart into a standalone SVG or PNG. Browser-only (it reads
 * computed styles and draws to a canvas). The live chart takes its colors from
 * CSS custom properties (`var(--dwt-series-1, #...)`) that a saved file
 * cannot resolve, so every element's painted values are copied in as explicit
 * styles, and the legend (HTML beside the chart) is redrawn inside the SVG.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Painted properties copied onto each element so the file needs no stylesheet. */
const PAINT_PROPERTIES: readonly string[] = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-variant-numeric',
  'text-anchor',
  'dominant-baseline',
  'visibility',
];

/** Parts of the live chart that only make sense when interacting. */
const INTERACTIVE_SELECTOR = '.dwt-hit-layer, .dwt-crosshair, .dwt-tooltip';

const LEGEND_ROW_HEIGHT = 24;
const LEGEND_PADDING = 8;

interface LegendEntry {
  readonly name: string;
  readonly kind: 'bar' | 'line';
  readonly color: string;
}

export interface ChartSvgResult {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

function inlinePaint(source: Element, copy: Element): void {
  const computed: CSSStyleDeclaration = getComputedStyle(source);
  const style: string = PAINT_PROPERTIES.map(
    (property) => `${property}:${computed.getPropertyValue(property)}`
  ).join(';');
  copy.setAttribute('style', style);
  // Presentation attributes may hold var(...); the style above wins, but a
  // leftover var() would confuse other tools.
  for (const attribute of ['fill', 'stroke']) {
    if (copy.getAttribute(attribute)?.includes('var(') === true) {
      copy.removeAttribute(attribute);
    }
  }
}

function inlineTree(source: Element, copy: Element): void {
  inlinePaint(source, copy);
  const sourceChildren: Element[] = Array.from(source.children);
  const copyChildren: Element[] = Array.from(copy.children);
  sourceChildren.forEach((child, index) => {
    const twin: Element | undefined = copyChildren[index];
    if (twin !== undefined) inlineTree(child, twin);
  });
}

function legendEntries(figure: Element): LegendEntry[] {
  return Array.from(figure.querySelectorAll('.dwt-legend-item')).flatMap(
    (item) => {
      const rect: Element | null = item.querySelector('rect');
      const line: Element | null = item.querySelector('line');
      const key: Element | null = rect ?? line;
      if (key === null) return [];
      const computed: CSSStyleDeclaration = getComputedStyle(key);
      return [
        {
          name: item.textContent?.trim() ?? '',
          kind: rect === null ? ('line' as const) : ('bar' as const),
          color: rect === null ? computed.stroke : computed.fill,
        },
      ];
    }
  );
}

/** The first opaque background up the tree, so a saved chart is readable on its own. */
function surfaceColor(from: Element): string {
  for (
    let node: Element | null = from;
    node !== null;
    node = node.parentElement
  ) {
    const color: string = getComputedStyle(node).backgroundColor;
    if (
      color !== '' &&
      color !== 'transparent' &&
      !/rgba\(.*,\s*0\)$/.test(color)
    ) {
      return color;
    }
  }
  return '#ffffff';
}

function legendMarkup(
  entries: readonly LegendEntry[],
  width: number,
  textColor: string,
  fontFamily: string
): { readonly markup: string; readonly height: number } {
  if (entries.length === 0) return { markup: '', height: 0 };
  let x = LEGEND_PADDING;
  let y = LEGEND_ROW_HEIGHT / 2;
  const parts: string[] = [];
  for (const entry of entries) {
    const textWidth: number = entry.name.length * 6.5 + 24;
    if (x + textWidth > width - LEGEND_PADDING && x > LEGEND_PADDING) {
      x = LEGEND_PADDING;
      y += LEGEND_ROW_HEIGHT;
    }
    parts.push(
      entry.kind === 'bar'
        ? `<rect x="${x + 3}" y="${y - 5}" width="10" height="10" rx="2" fill="${entry.color}"/>`
        : `<line x1="${x + 1}" x2="${x + 15}" y1="${y}" y2="${y}" stroke="${entry.color}" stroke-width="2" stroke-linecap="round"/>`,
      `<text x="${x + 20}" y="${y}" dominant-baseline="central" font-size="12" font-family="${fontFamily.replaceAll('"', "'")}" fill="${textColor}">${escapeXml(entry.name)}</text>`
    );
    x += textWidth;
  }
  return {
    markup: parts.join(''),
    height: y + LEGEND_ROW_HEIGHT / 2,
  };
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The chart in `figure` (a `.dwt-chart`) as a standalone SVG document with its
 * legend, its `<title>` and `<desc>`, a background, and no interactive parts.
 * Returns an error message when the figure holds no chart.
 */
export function chartToSvg(figure: Element):
  | { readonly ok: true; readonly value: ChartSvgResult }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const source: SVGSVGElement | null =
    figure.querySelector('svg.dwt-chart-svg');
  if (source === null) {
    return {
      ok: false,
      error: 'Cannot export the chart: it has not rendered an <svg> yet.',
    };
  }
  const box: SVGRect | null = source.viewBox.baseVal;
  const width: number = box.width > 0 ? box.width : source.clientWidth;
  const height: number = box.height > 0 ? box.height : source.clientHeight;
  if (!(width > 0 && height > 0)) {
    return {
      ok: false,
      error: 'Cannot export the chart: its size is zero (is it hidden?).',
    };
  }
  const copy: SVGSVGElement = source.cloneNode(true) as SVGSVGElement;
  inlineTree(source, copy);
  copy.querySelectorAll(INTERACTIVE_SELECTOR).forEach((node) => node.remove());
  for (const attribute of ['tabindex', 'class', 'width', 'height']) {
    copy.removeAttribute(attribute);
  }
  const computed: CSSStyleDeclaration = getComputedStyle(source);
  const entries: LegendEntry[] = legendEntries(figure);
  const legend = legendMarkup(
    entries,
    width,
    getComputedStyle(figure.querySelector('.dwt-legend') ?? figure).color,
    computed.fontFamily
  );
  const totalHeight: number = height + legend.height;
  copy.setAttribute('x', '0');
  copy.setAttribute('y', String(legend.height));
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  const inner: string = new XMLSerializer().serializeToString(copy);
  const svg = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${width} ${totalHeight}" width="${width}" height="${totalHeight}" role="img"><rect width="100%" height="100%" fill="${surfaceColor(figure)}"/>${legend.markup}${inner}</svg>`;
  return { ok: true, value: { svg, width, height: totalHeight } };
}

/**
 * Rasterizes an SVG document to a PNG at `scale` (default 2, for sharp text).
 * Resolves to an error message when the browser cannot decode or draw it.
 */
export async function svgToPng(
  result: ChartSvgResult,
  scale = 2
): Promise<
  | { readonly ok: true; readonly value: Blob }
  | { readonly ok: false; readonly error: string }
> {
  const url: string = URL.createObjectURL(
    new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' })
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('the browser could not decode the chart SVG'));
      image.src = url;
    });
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = Math.round(result.width * scale);
    canvas.height = Math.round(result.height * scale);
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (context === null) {
      return {
        ok: false,
        error: 'Cannot export the chart as PNG: no canvas 2D context.',
      };
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    return blob === null
      ? {
          ok: false,
          error:
            'Cannot export the chart as PNG: the canvas produced no image.',
        }
      : { ok: true, value: blob };
  } catch (cause) {
    return {
      ok: false,
      error: `Cannot export the chart as PNG: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
