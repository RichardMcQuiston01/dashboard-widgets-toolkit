import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatCount,
  formatPercentChange,
  formatValue,
  kpiDelta,
  percentChange,
  shareOf,
} from '../../src/core/format.js';

const EN = 'en-US';

void describe('formatValue', () => {
  void it('formats numbers, currency and percents with the given locale', () => {
    assert.equal(formatValue(1284, 'number', { locale: EN }), '1,284');
    assert.equal(formatValue(12.5, 'currency', { locale: EN }), '$12.50');
    assert.equal(
      formatValue(12.5, 'currency', { locale: EN, currency: 'eur' }),
      '€12.50'
    );
    assert.equal(formatValue(0.255, 'percent', { locale: EN }), '25.5%');
    assert.equal(formatValue(1284, 'number', { locale: 'de-DE' }), '1.284');
    assert.equal(
      formatValue(1284, 'number', { locale: ['de-DE', 'en-US'] }),
      '1.284'
    );
  });

  void it('formats compact axis values', () => {
    assert.equal(
      formatValue(1200, 'number', { locale: EN, compact: true }),
      '1.2K'
    );
    assert.equal(
      formatValue(4_200_000, 'currency', { locale: EN, compact: true }),
      '$4.2M'
    );
  });

  void it('falls back instead of throwing on a bad currency or locale', () => {
    assert.equal(
      formatValue(5, 'currency', { locale: EN, currency: 'NOT-A-CODE' }),
      '5 NOT-A-CODE'
    );
    assert.equal(
      typeof formatValue(5, 'number', { locale: 'not a locale!!' }),
      'string'
    );
  });

  void it('shows a dash for non-finite values', () => {
    assert.equal(formatValue(Number.NaN, 'number'), '—');
  });

  void it('formatCount is a plain count', () => {
    assert.equal(formatCount(10_000, EN), '10,000');
  });
});

void describe('percentChange and formatPercentChange', () => {
  void it('returns null with nothing to compare', () => {
    assert.equal(percentChange(10, null), null);
    assert.equal(percentChange(10, undefined), null);
    assert.equal(percentChange(10, 0), null);
  });

  void it('works out the change, using the magnitude of a negative previous', () => {
    assert.equal(percentChange(120, 100), 20);
    assert.equal(percentChange(-50, -100), 50);
  });

  void it('formats with a sign, one decimal below 10%', () => {
    assert.equal(formatPercentChange(12.4, EN), '+12%');
    assert.equal(formatPercentChange(-8.04, EN), '-8%');
    assert.equal(formatPercentChange(2.46, EN), '+2.5%');
    assert.equal(formatPercentChange(0.01, EN), '±0%');
  });
});

void describe('kpiDelta', () => {
  void it('combines direction with whether higher is better', () => {
    assert.deepEqual(kpiDelta(120, 100, { locale: EN }), {
      percent: 20,
      direction: 'up',
      sentiment: 'good',
      text: '+20%',
      description: '+20% vs previous period',
    });
    const refunds = kpiDelta(120, 100, { locale: EN, higherIsBetter: false });
    assert.equal(refunds?.sentiment, 'bad');
    assert.equal(kpiDelta(80, 100, { locale: EN })?.sentiment, 'bad');
    assert.equal(
      kpiDelta(80, 100, { locale: EN, higherIsBetter: false })?.sentiment,
      'good'
    );
  });

  void it('treats a change that rounds to zero as flat and neutral', () => {
    const delta = kpiDelta(100.01, 100, { locale: EN });
    assert.equal(delta?.direction, 'flat');
    assert.equal(delta?.sentiment, 'neutral');
  });

  void it('takes a comparison label and returns null without a previous value', () => {
    assert.equal(
      kpiDelta(2, 1, { locale: EN, comparisonLabel: 'last month' })
        ?.description,
      '+100% vs last month'
    );
    assert.equal(kpiDelta(2, null), null);
  });
});

void describe('shareOf', () => {
  void it('is a whole percentage, 0 for no total', () => {
    assert.equal(shareOf(1, 3), 33);
    assert.equal(shareOf(5, 0), 0);
  });
});
