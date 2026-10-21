import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineWidget } from '../../src/core/definition.js';
import {
  DATE_RANGE_PRESET_LABELS,
  EMPTY_SETTINGS_PATCH,
  optionsDraftFrom,
  optionsPatchFrom,
  optionsPatchKey,
  storedOptionDefault,
} from '../../src/core/options-draft.js';

const widget = defineWidget({
  key: 'orders',
  title: 'Orders',
  kind: 'TABLE',
  options: [
    {
      type: 'number',
      key: 'limit',
      label: 'Rows',
      min: 1,
      max: 20,
      default: 5,
    },
    { type: 'dateRange', key: 'range', label: 'Range', default: 'last30' },
    {
      type: 'columns',
      key: 'columns',
      label: 'Columns',
      columns: [
        { key: 'c0', label: 'A' },
        { key: 'c1', label: 'B' },
      ],
      default: ['c0', 'c1'],
    },
  ],
});

void describe('options draft (shared by every renderer’s dialog)', () => {
  void it('starts from the saved settings', () => {
    assert.deepEqual(optionsDraftFrom(undefined), {
      title: '',
      width: undefined,
      flexible: undefined,
      options: {},
      view: undefined,
    });
    assert.equal(optionsDraftFrom({ title: 'Sales' }).title, 'Sales');
  });

  void it('keeps only what differs from the author’s defaults', () => {
    const draft = {
      ...optionsDraftFrom(undefined),
      title: '  Sales  ',
      options: { limit: 5, range: 'last7', columns: ['c0', 'c1'] },
    };
    const patch = optionsPatchFrom(widget, draft);
    assert.equal(patch.title, 'Sales');
    assert.deepEqual(patch.options, { range: 'last7' });
  });

  void it('treats choosing the defaults again as no change', () => {
    const draft = {
      ...optionsDraftFrom(undefined),
      options: { limit: 5, range: 'last30' },
    };
    assert.equal(
      optionsPatchKey(optionsPatchFrom(widget, draft)),
      optionsPatchKey(EMPTY_SETTINGS_PATCH)
    );
  });

  void it('gives equal keys for the same options in any order', () => {
    const a = optionsPatchKey({
      ...EMPTY_SETTINGS_PATCH,
      options: { a: 1, b: 2 },
    });
    const b = optionsPatchKey({
      ...EMPTY_SETTINGS_PATCH,
      options: { b: 2, a: 1 },
    });
    assert.equal(a, b);
  });

  void it('stores a date range as its preset, not the interval', () => {
    assert.equal(storedOptionDefault(widget.options?.[1] as never), 'last30');
    assert.equal(DATE_RANGE_PRESET_LABELS.last30, 'Last 30 days');
  });
});
