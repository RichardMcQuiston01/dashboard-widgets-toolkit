import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ageOf,
  formatAge,
  msUntilAgeChanges,
} from '../../src/core/freshness.js';

const NOW = 1_800_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

void describe('ageOf and formatAge', () => {
  void it('says just now under 45 seconds, and for a time in the future', () => {
    assert.equal(
      formatAge(NOW - 10 * SECOND, NOW, { locale: 'en-US' }),
      'just now'
    );
    assert.equal(
      formatAge(NOW - 44 * SECOND, NOW, { locale: 'en-US' }),
      'just now'
    );
    assert.equal(
      formatAge(NOW + 5 * MINUTE, NOW, { locale: 'en-US' }),
      'just now'
    );
    assert.equal(
      formatAge(NOW, NOW, { locale: 'en-US', justNow: 'a moment ago' }),
      'a moment ago'
    );
  });

  void it('rounds down to minutes, hours and days', () => {
    const en = { locale: 'en-US' };
    assert.equal(formatAge(NOW - 45 * SECOND, NOW, en), '1 minute ago');
    assert.equal(
      formatAge(NOW - 2 * MINUTE - 59 * SECOND, NOW, en),
      '2 minutes ago'
    );
    assert.equal(formatAge(NOW - 59 * MINUTE, NOW, en), '59 minutes ago');
    assert.equal(formatAge(NOW - HOUR, NOW, en), '1 hour ago');
    assert.equal(
      formatAge(NOW - 23 * HOUR - 59 * MINUTE, NOW, en),
      '23 hours ago'
    );
    assert.equal(formatAge(NOW - 3 * DAY, NOW, en), '3 days ago');
  });

  void it('uses the locale for the words', () => {
    assert.equal(
      formatAge(NOW - 5 * MINUTE, NOW, { locale: 'es' }),
      'hace 5 minutos'
    );
  });

  void it('ageOf reports the unit and value', () => {
    assert.deepEqual(ageOf(NOW - 90 * MINUTE, NOW), {
      justNow: false,
      unit: 'hour',
      value: 1,
    });
  });
});

void describe('msUntilAgeChanges', () => {
  void it('points at the next change of the label', () => {
    assert.equal(msUntilAgeChanges(NOW - 10 * SECOND, NOW), 35 * SECOND);
    assert.equal(msUntilAgeChanges(NOW - 50 * SECOND, NOW), 10 * SECOND);
    assert.equal(
      msUntilAgeChanges(NOW - 2 * MINUTE - 20 * SECOND, NOW),
      40 * SECOND
    );
    assert.equal(
      msUntilAgeChanges(NOW - 3 * HOUR - 10 * MINUTE, NOW),
      50 * MINUTE
    );
  });

  void it('never asks for less than a second', () => {
    assert.equal(msUntilAgeChanges(NOW - 44_999, NOW), 1000);
  });
});
