import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const reactDirectory = new URL('../../src/react/', import.meta.url);

function printBlock(css: string): string {
  const start: number = css.indexOf('@media print');
  assert.notEqual(start, -1, 'styles.css has no @media print block');
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  throw new Error('styles.css: the @media print block is not closed');
}

void describe('print stylesheet', () => {
  void it('only names classes the components render', () => {
    const css: string = readFileSync(
      new URL('styles.css', reactDirectory),
      'utf8'
    );
    const source: string = readdirSync(reactDirectory)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => readFileSync(new URL(name, reactDirectory), 'utf8'))
      .join('\n');
    const classes: string[] = [
      ...new Set(printBlock(css).match(/\.dwt-[a-z0-9-]+/g) ?? []),
    ].map((name) => name.slice(1));
    assert.ok(classes.length > 10, 'expected the print block to name classes');
    const missing: string[] = classes.filter((name) => !source.includes(name));
    assert.deepEqual(
      missing,
      [],
      `print rules for classes no component renders: ${missing.join(', ')}`
    );
  });
});
