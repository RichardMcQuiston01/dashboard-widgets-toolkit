import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  colorDistance,
  composite,
  contrastRatio,
  parseColor,
  relativeLuminance,
  simulateVision,
  type Rgba,
} from '../../src/core/color.js';

function must(value: string): Rgba {
  const parsed: Rgba | undefined = parseColor(value);
  assert.ok(parsed, `${value} should parse`);
  return parsed;
}

function near(actual: number, expected: number, tolerance = 0.01): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`
  );
}

void describe('parseColor', () => {
  void it('reads hex in 3, 4, 6 and 8 digits', () => {
    assert.deepEqual(must('#fff'), { r: 1, g: 1, b: 1, a: 1 });
    assert.deepEqual(must('#000000'), { r: 0, g: 0, b: 0, a: 1 });
    near(must('#ff000080').a, 0.5, 0.01);
    near(must('#f008').a, 0.533, 0.01);
  });

  void it('reads rgb, hsl, oklab and oklch in modern and legacy syntax', () => {
    assert.deepEqual(must('rgb(255, 0, 0)'), { r: 1, g: 0, b: 0, a: 1 });
    near(must('rgba(0, 0, 0, 0.25)').a, 0.25);
    near(must('rgb(0 0 0 / 50%)').a, 0.5);
    const red = must('hsl(0 100% 50%)');
    near(red.r, 1);
    near(red.g, 0);
    const green = must('hsl(120, 100%, 25%)');
    near(green.g, 0.5, 0.02);
    // oklch white and black.
    near(must('oklch(1 0 0)').r, 1, 0.02);
    near(must('oklch(0 0 0)').r, 0, 0.02);
    near(must('oklab(1 0 0)').g, 1, 0.02);
  });

  void it('knows black, white and transparent, and nothing page-dependent', () => {
    assert.equal(must('black').r, 0);
    assert.equal(must('WHITE').r, 1);
    assert.equal(must('transparent').a, 0);
    for (const value of [
      'var(--brand)',
      'color-mix(in srgb, red, blue)',
      'rebeccapurple',
      '#12',
      'rgb(1, 2)',
      'oklch(nope)',
      '',
    ]) {
      assert.equal(parseColor(value), undefined, value);
    }
  });
});

void describe('contrast and distance', () => {
  void it('matches known WCAG ratios', () => {
    near(contrastRatio(must('#000000'), must('#ffffff')), 21, 0.01);
    near(contrastRatio(must('#ffffff'), must('#ffffff')), 1, 0.001);
    // #767676 on white is the classic AA threshold (4.54:1).
    near(contrastRatio(must('#767676'), must('#ffffff')), 4.54, 0.01);
    near(contrastRatio(must('#777777'), must('#ffffff')), 4.48, 0.01);
    assert.ok(
      relativeLuminance(must('#ffffff')) > relativeLuminance(must('#808080'))
    );
  });

  void it('composites alpha over an opaque background', () => {
    const over = composite(must('rgba(0, 0, 0, 0.5)'), must('#ffffff'));
    near(over.r, 0.5);
    assert.equal(over.a, 1);
  });

  void it('colorDistance is 0 for equal colors and larger for different ones', () => {
    assert.equal(colorDistance(must('#336699'), must('#336699')), 0);
    assert.ok(colorDistance(must('#000000'), must('#ffffff')) > 0.9);
    assert.ok(
      colorDistance(must('#336699'), must('#346699')) <
        colorDistance(must('#336699'), must('#996633'))
    );
  });
});

void describe('simulateVision', () => {
  void it('pulls red and green together for red-green deficiencies', () => {
    const red: Rgba = must('#d03b3b');
    const green: Rgba = must('#2e9d44');
    const normal: number = colorDistance(red, green);
    for (const type of ['protanopia', 'deuteranopia'] as const) {
      const seen: number = colorDistance(
        simulateVision(red, type),
        simulateVision(green, type)
      );
      assert.ok(seen < normal, `${type}: ${seen} should be below ${normal}`);
    }
  });

  void it('leaves grays alone', () => {
    const gray: Rgba = must('#808080');
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const seen: Rgba = simulateVision(gray, type);
      near(seen.r, gray.r, 0.02);
      near(seen.g, gray.g, 0.02);
      near(seen.b, gray.b, 0.02);
    }
  });
});
