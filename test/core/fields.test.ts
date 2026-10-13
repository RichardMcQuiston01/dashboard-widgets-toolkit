import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateDetailData, tableDetailData } from '../../src/core/detail.js';
import {
  cellField,
  fieldCellProblem,
  fieldColumnProblems,
  isFormatterName,
  isSafeCellColor,
  isSafeEmail,
  isSafeWebUrl,
  validateFormatters,
} from '../../src/core/fields.js';
import { validateWidgetData } from '../../src/core/validate.js';

void describe('isSafeEmail', () => {
  void it('accepts plain addresses', () => {
    for (const address of [
      'a@b.co',
      'first.last+tag@example.com',
      'x_y@sub.example.org',
    ]) {
      assert.ok(isSafeEmail(address), address);
    }
  });

  void it('rejects display names, lists, header parameters and junk', () => {
    for (const address of [
      '',
      'no-at-sign',
      'a@b',
      'Name <a@b.co>',
      'a@b.co?cc=x@y.co',
      'a@b.co?body=hi',
      'a@b.co,c@d.co',
      'a@b.co;c@d.co',
      'a b@c.co',
      '"a"@b.co',
      `${'x'.repeat(250)}@b.co`,
      'javascript:alert(1)@b.co',
    ]) {
      assert.equal(isSafeEmail(address), false, address);
    }
  });
});

void describe('other value checks', () => {
  void it('urls must be absolute http(s)', () => {
    assert.ok(isSafeWebUrl('https://example.com/a?b=1'));
    assert.ok(isSafeWebUrl('HTTP://example.com'));
    for (const url of [
      '/relative',
      'mailto:a@b.co',
      'javascript:alert(1)',
      'https://a b',
      'ftp://x.y',
      '',
    ]) {
      assert.equal(isSafeWebUrl(url), false, url);
    }
  });

  void it('colors are #rgb or #rrggbb', () => {
    assert.ok(isSafeCellColor('#fff'));
    assert.ok(isSafeCellColor('#0F5394'));
    for (const color of [
      'red',
      '#ffff',
      '#12345',
      'rgb(0,0,0)',
      'url(x)',
      '#fff;x',
    ]) {
      assert.equal(isSafeCellColor(color), false, color);
    }
  });

  void it('formatter names start with a letter and use a small alphabet', () => {
    assert.ok(isFormatterName('statusIcon'));
    assert.ok(isFormatterName('a.b-c_d'));
    for (const name of ['', '1a', 'a b', 'a/b', 'x'.repeat(65)]) {
      assert.equal(isFormatterName(name), false, name);
    }
  });
});

void describe('cellField', () => {
  void it('text is the default', () => {
    assert.deepEqual(cellField({}, { text: 'a@b.co' }), { kind: 'text' });
    assert.deepEqual(cellField({ type: 'text' }, { text: 'x' }), {
      kind: 'text',
    });
  });

  void it('reads the value when it is a string, else the text', () => {
    assert.deepEqual(
      cellField({ type: 'email' }, { text: 'Ann', value: 'ann@b.co' }),
      {
        kind: 'email',
        href: 'mailto:ann@b.co',
      }
    );
    assert.deepEqual(cellField({ type: 'email' }, { text: 'ann@b.co' }), {
      kind: 'email',
      href: 'mailto:ann@b.co',
    });
    // A numeric value is for sorting, not the address.
    assert.deepEqual(
      cellField({ type: 'email' }, { text: 'ann@b.co', value: 3 }),
      {
        kind: 'email',
        href: 'mailto:ann@b.co',
      }
    );
  });

  void it('url, image and color', () => {
    assert.deepEqual(
      cellField({ type: 'url' }, { text: 'Site', value: 'https://x.co' }),
      {
        kind: 'url',
        href: 'https://x.co',
      }
    );
    assert.deepEqual(
      cellField({ type: 'image' }, { text: 'Logo', value: '/logo.png' }),
      {
        kind: 'image',
        src: '/logo.png',
      }
    );
    assert.deepEqual(
      cellField({ type: 'color' }, { text: 'Navy', value: '#123456' }),
      {
        kind: 'color',
        color: '#123456',
      }
    );
  });

  void it('falls back to text for anything unsafe', () => {
    const bad: [Parameters<typeof cellField>[0], string][] = [
      [{ type: 'email' }, 'a@b.co?cc=c@d.co'],
      [{ type: 'url' }, 'javascript:alert(1)'],
      [{ type: 'image' }, 'data:image/png;base64,AAAA'],
      [{ type: 'image' }, 'javascript:alert(1)'],
      [{ type: 'color' }, 'red; background: url(x)'],
    ];
    for (const [column, value] of bad) {
      assert.deepEqual(
        cellField(column, { text: 'x', value }),
        { kind: 'text' },
        value
      );
    }
  });

  void it('custom needs a formatter name', () => {
    assert.deepEqual(
      cellField({ type: 'custom', formatter: 'badge' }, { text: 'x' }),
      {
        kind: 'custom',
        formatter: 'badge',
      }
    );
    assert.deepEqual(cellField({ type: 'custom' }, { text: 'x' }), {
      kind: 'text',
    });
  });
});

void describe('column and cell problems', () => {
  void it('column type and formatter', () => {
    assert.deepEqual(fieldColumnProblems({ type: 'email' }, 'columns[0]'), []);
    assert.deepEqual(
      fieldColumnProblems({ type: 'custom', formatter: 'badge' }, 'columns[0]'),
      []
    );
    assert.match(
      fieldColumnProblems({ type: 'phone' }, 'columns[1]').join(' '),
      /columns\[1\]\.type must be one of text, email, url, image, color, custom, got "phone"/
    );
    assert.match(
      fieldColumnProblems({ type: 'custom' }, 'columns[2]').join(' '),
      /columns\[2\]\.type "custom" needs columns\[2\]\.formatter/
    );
    assert.match(
      fieldColumnProblems({ type: 'email', formatter: 'x' }, 'columns[3]').join(
        ' '
      ),
      /columns\[3\]\.formatter "x" needs columns\[3\]\.type "custom"/
    );
    assert.match(
      fieldColumnProblems(
        { type: 'custom', formatter: '1 bad' },
        'columns[4]'
      ).join(' '),
      /columns\[4\]\.formatter must be a name/
    );
  });

  void it('a typed cell names the field it came from', () => {
    assert.equal(
      fieldCellProblem({ type: 'email' }, { text: 'a@b.co' }, 'x'),
      undefined
    );
    assert.equal(
      fieldCellProblem({}, { text: 'not an email' }, 'x'),
      undefined
    );
    assert.match(
      fieldCellProblem(
        { type: 'email' },
        { text: 'Ann', value: 'ann' },
        'rows[0][1]'
      ) ?? '',
      /rows\[0\]\[1\]\.value "ann" is not a plain email address/
    );
    assert.match(
      fieldCellProblem(
        { type: 'url' },
        { text: 'javascript:1' },
        'rows[0][1]'
      ) ?? '',
      /rows\[0\]\[1\]\.text "javascript:1" is not an absolute http or https URL/
    );
  });
});

void describe('validation of tables and detail data', () => {
  const table = {
    kind: 'TABLE',
    columns: [
      { label: 'Name' },
      { label: 'Email', type: 'email' },
      { label: 'Logo', type: 'image' },
      { label: 'Status', type: 'custom', formatter: 'statusIcon' },
    ],
    rows: [
      [
        { text: 'Ann' },
        { text: 'Ann', value: 'ann@example.com' },
        { text: 'Acme logo', value: 'https://example.com/a.png' },
        { text: 'Active', value: 'active' },
      ],
    ],
  };

  void it('accepts typed columns and survives a JSON round trip', () => {
    const result = validateWidgetData(JSON.parse(JSON.stringify(table)));
    assert.ok(result.ok, result.ok ? '' : result.error);
    assert.deepEqual(result.value, table);
  });

  void it('names the column, row and cell of every problem', () => {
    const result = validateWidgetData({
      ...table,
      columns: [
        ...table.columns.slice(0, 3),
        { label: 'Status', type: 'custom' },
      ],
      rows: [
        [
          { text: 'Ann' },
          { text: 'Ann', value: 'ann@example.com?cc=x@y.co' },
          { text: 'Logo', value: 'data:image/png;base64,AAAA' },
          { text: 'Active' },
        ],
      ],
    });
    assert.ok(!result.ok);
    assert.match(
      result.error,
      /columns\[3\]\.type "custom" needs columns\[3\]\.formatter/
    );
    assert.match(
      result.error,
      /rows\[0\]\[1\]\.value "ann@example.com\?cc=x@y.co" is not a plain email/
    );
    assert.match(
      result.error,
      /rows\[0\]\[2\]\.value "data:image\/png;base64,AAAA" is not an http, https or relative image URL/
    );
  });

  void it('detail data accepts and checks the same fields', () => {
    const detail = {
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email', type: 'email' },
      ],
      rows: [[{ text: 'Ann' }, { text: 'ann@example.com' }]],
    };
    assert.ok(validateDetailData(detail).ok);
    const bad = validateDetailData({
      ...detail,
      columns: [
        detail.columns[0],
        { key: 'email', label: 'Email', type: 'phone' },
      ],
      rows: [[{ text: 'Ann' }, { text: 'nope' }]],
    });
    assert.ok(!bad.ok);
    assert.match(bad.error, /columns\[1\]\.type must be one of/);
  });

  void it("a table's detail data keeps each column type and formatter", () => {
    const data = tableDetailData(
      table as Parameters<typeof tableDetailData>[0]
    );
    assert.equal(data.columns[1]?.type, 'email');
    assert.equal(data.columns[3]?.formatter, 'statusIcon');
    assert.equal(data.columns[0]?.type, undefined);
  });
});

void describe('validateFormatters', () => {
  const columns = [
    { label: 'A' },
    { label: 'Status', type: 'custom' as const, formatter: 'statusIcon' },
    { label: 'Tag', type: 'custom' as const, formatter: 'tag' },
  ];

  void it('passes when every custom column has a formatter', () => {
    assert.ok(validateFormatters(columns, ['statusIcon', 'tag']).ok);
    assert.ok(validateFormatters([{ label: 'A' }], []).ok);
  });

  void it('names each column that has none', () => {
    const result = validateFormatters(columns, ['tag'], 'orders');
    assert.ok(!result.ok);
    assert.match(
      result.error,
      /orders: columns\[1\] \("Status"\) uses the formatter "statusIcon", which is not registered \(registered: tag\)/
    );
    const none = validateFormatters(columns, []);
    assert.ok(!none.ok);
    assert.match(none.error, /registered: none/);
  });
});
