import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  detailToCsv,
  exportFileName,
  queryToCsv,
  widgetToCsv,
} from '../../src/core/export.js';
import type { DetailData } from '../../src/core/detail.js';

const detail: DetailData = {
  columns: [
    { key: 'a', label: 'Name' },
    { key: 'b', label: 'Total', numeric: true },
  ],
  rows: [
    [{ text: 'Ann, "A" Lee' }, { text: '$1,234.00', value: 1234 }],
    [{ text: 'Bo\nBee' }, { text: '$5.50', value: 5.5 }],
  ],
};

function csvOf(result: ReturnType<typeof detailToCsv>): string {
  assert.equal(result.ok, true);
  return result.ok ? result.value : '';
}

void describe('detailToCsv', () => {
  void it('quotes delimiters, quotes and line breaks (RFC 4180)', () => {
    assert.equal(
      csvOf(detailToCsv(detail)),
      'Name,Total\r\n"Ann, ""A"" Lee","$1,234.00"\r\n"Bo\nBee",$5.50\r\n'
    );
  });

  void it('exports sort values when asked, with a custom delimiter and BOM', () => {
    assert.equal(
      csvOf(
        detailToCsv(detail, {
          cells: 'value',
          delimiter: ';',
          newline: '\n',
          byteOrderMark: true,
        })
      ),
      '﻿Name;Total\n"Ann, ""A"" Lee";1234\n"Bo\nBee";5.5\n'
    );
  });

  void it('neutralizes spreadsheet formulas but keeps plain numbers', () => {
    const risky: DetailData = {
      columns: [{ key: 'a', label: 'Cell' }],
      rows: [
        [{ text: '=HYPERLINK("http://x")' }],
        [{ text: '@SUM(A1)' }],
        [{ text: '-5' }],
        [{ text: '+1.5e3' }],
        [{ text: '-cmd' }],
      ],
    };
    const lines: string[] = csvOf(detailToCsv(risky)).split('\r\n');
    assert.deepEqual(lines.slice(1, 6), [
      `"'=HYPERLINK(""http://x"")"`,
      "'@SUM(A1)",
      '-5',
      '+1.5e3',
      "'-cmd",
    ]);
    assert.equal(
      csvOf(detailToCsv(risky, { neutralizeFormulas: false })).split('\r\n')[2],
      '@SUM(A1)'
    );
  });

  void it('names the problem for ragged rows and no columns', () => {
    const ragged = detailToCsv({
      columns: detail.columns,
      rows: [[{ text: 'only one' }]],
    });
    assert.equal(ragged.ok, false);
    assert.match(
      ragged.ok ? '' : ragged.error,
      /row 1 has 1 cells but there are 2 columns/
    );
    const none = detailToCsv({ columns: [], rows: [] });
    assert.equal(none.ok, false);
  });
});

void describe('widgetToCsv', () => {
  void it('exports a TABLE without its footer', () => {
    const result = widgetToCsv({
      kind: 'TABLE',
      columns: [{ label: 'Product' }, { label: 'Sold', numeric: true }],
      rows: [[{ text: 'Mug' }, { text: '12', value: 12 }]],
      footer: 'and 40 more',
    });
    assert.equal(csvOf(result), 'Product,Sold\r\nMug,12\r\n');
  });

  void it('exports a BAR_LIST as name and value', () => {
    const result = widgetToCsv({
      kind: 'BAR_LIST',
      items: [{ label: 'US', value: 40, display: '40 orders' }],
    });
    assert.equal(csvOf(result), 'Name,Value\r\nUS,40 orders\r\n');
  });

  void it('exports a GRAPH like its table twin, one column per series', () => {
    const result = widgetToCsv({
      kind: 'GRAPH',
      chartType: 'line',
      valueFormat: 'number',
      xLabel: 'Month',
      series: [
        {
          name: 'A',
          points: [
            { label: 'Jan', value: 1 },
            { label: 'Feb', value: 2 },
          ],
        },
        { name: 'B', points: [{ label: 'Jan', value: 3 }] },
      ],
    });
    assert.equal(csvOf(result), 'Month,A,B\r\nJan,1,3\r\nFeb,2,\r\n');
  });

  void it('says which kinds cannot be exported', () => {
    const result = widgetToCsv({
      kind: 'GAUGE',
      value: 1,
      max: 2,
      label: 'x',
    } as never);
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.error, /GAUGE widget has no rows/);
  });
});

void describe('exportFileName', () => {
  void it('makes a safe name', () => {
    assert.equal(
      exportFileName('Recent Orders (Q3)', 'csv'),
      'recent-orders-q3.csv'
    );
    assert.equal(
      exportFileName('Café ../etc', 'svg', '2026-10-15T09:00:00Z'),
      'cafe-etc-2026-10-15.svg'
    );
    assert.equal(exportFileName('***', 'png'), 'export.png');
  });
});

void describe('queryToCsv', () => {
  const data: DetailData = {
    columns: [
      { key: 'name', label: 'Name', filterable: true },
      { key: 'total', label: 'Total', numeric: true },
    ],
    rows: [
      [{ text: 'Cy' }, { text: '$3', value: 3 }],
      [{ text: 'Ann' }, { text: '$10', value: 10 }],
      [{ text: 'Bo' }, { text: '$2', value: 2 }],
      [{ text: 'Anna' }, { text: '$7', value: 7 }],
    ],
  };

  void it('exports every row the filters select, ignoring the page', () => {
    const result = queryToCsv(data, {
      search: 'ann',
      sort: { column: 'total', direction: 'desc' },
      page: 2,
      pageSize: 1,
    });
    assert.equal(csvOf(result), 'Name,Total\r\nAnn,$10\r\nAnna,$7\r\n');
  });

  void it('names a missing column', () => {
    const result = queryToCsv(data, {
      sort: { column: 'nope', direction: 'asc' },
      page: 1,
      pageSize: 25,
    });
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.error, /sort column "nope"/);
  });
});

void describe('queryToCsv with hidden columns', () => {
  void it('leaves hidden columns out of the file', () => {
    const csv = queryToCsv(
      {
        columns: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        rows: [[{ text: '1' }, { text: '2' }]],
      },
      { page: 1, pageSize: 25, hidden: ['a'] }
    );
    assert.ok(csv.ok);
    assert.equal(csv.value, 'B\r\n2\r\n');
  });
});
