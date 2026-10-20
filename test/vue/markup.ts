/**
 * Normalizes server-rendered HTML so React's and Vue's output for the same
 * widget can be compared: attribute order, class order, style spacing, entity
 * spelling, framework comment markers, generated ids and void elements are
 * all spelled differently by the two renderers but mean the same thing.
 */

const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'img',
  'input',
  'br',
  'hr',
  'meta',
  'link',
]);
const ID_ATTRIBUTES: ReadonlySet<string> = new Set([
  'id',
  'for',
  'aria-labelledby',
  'aria-controls',
  'aria-describedby',
]);

function decodeEntities(text: string): string {
  return text
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"');
}

function normalizeStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const colon: number = part.indexOf(':');
      return `${part.slice(0, colon).trim()}:${part.slice(colon + 1).trim()}`;
    })
    .sort()
    .join(';');
}

export function normalizeMarkup(markup: string): string {
  const ids = new Map<string, string>();
  const idFor = (raw: string): string =>
    raw
      .split(/\s+/)
      .map((id) => {
        if (!ids.has(id)) ids.set(id, `#${ids.size + 1}`);
        return ids.get(id) ?? id;
      })
      .join(' ');

  const stripped: string = markup
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/>\s+</g, '><');

  return stripped.replaceAll(
    /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>/g,
    (_whole, closing: string, name: string, attributes: string) => {
      const tag: string = name.toLowerCase();
      if (closing === '/') return VOID_ELEMENTS.has(tag) ? '' : `</${tag}>`;
      const parsed: string[] = [];
      for (const match of attributes.matchAll(
        /\s+([^\s=>/]+)(?:="([^"]*)")?/g
      )) {
        const attribute: string = (match[1] ?? '').toLowerCase();
        let value: string = decodeEntities(match[2] ?? '');
        if (attribute === 'class') {
          value = value.split(/\s+/).filter(Boolean).sort().join(' ');
        } else if (attribute === 'style') {
          value = normalizeStyle(value);
        } else if (ID_ATTRIBUTES.has(attribute)) {
          value = idFor(value);
        }
        parsed.push(`${attribute}="${value}"`);
      }
      parsed.sort();
      return `<${tag}${parsed.map((a) => ` ${a}`).join('')}>`;
    }
  );
}
