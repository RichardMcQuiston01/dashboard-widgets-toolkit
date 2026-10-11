import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defaultDetailQuery,
  deriveDetailData,
  parseDetailQuery,
  clampServerQuery,
  parseDetailLink,
  sanitizeDetailQuery,
  serializeDetailLink,
  withDetailLink,
  queryRows,
  resolveDetailOptions,
  serverPage,
  resolveTableControls,
  tableDetailData,
  serializeDetailQuery,
  validateDetailData,
  type DetailData,
  type DetailQuery,
} from '../../src/core/detail.js';
import { validateWidgetDefinition } from '../../src/core/validate.js';

const data: DetailData = {
  columns: [
    { key: 'name', label: 'Name', filterable: true },
    { key: 'sold', label: 'Sold', numeric: true },
    { key: 'note', label: 'Note', sortable: false },
  ],
  rows: [
    [{ text: 'Café Jig' }, { text: '10', value: 10 }, { text: 'a' }],
    [{ text: 'bauble jig' }, { text: '9', value: 9 }, { text: 'b' }],
    [{ text: 'Coaster' }, { text: '100', value: 100 }, { text: 'c' }],
    [{ text: 'Ink pad' }, { text: '9', value: 9 }, { text: 'd' }],
  ],
};

function names(query: DetailQuery): string[] {
  const result = queryRows(data, query, 'en');
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value.rows.map((row) => row[0]?.text ?? '');
}

const base: DetailQuery = { page: 1, pageSize: 10 };

void describe('queryRows', () => {
  void it('returns every row in order when the query is empty', () => {
    assert.deepEqual(names(base), [
      'Café Jig',
      'bauble jig',
      'Coaster',
      'Ink pad',
    ]);
  });

  void it('sorts text with the locale, ignoring case', () => {
    assert.deepEqual(
      names({ ...base, sort: { column: 'name', direction: 'asc' } }),
      ['bauble jig', 'Café Jig', 'Coaster', 'Ink pad']
    );
  });

  void it('sorts numbers by value, not text, and keeps ties stable', () => {
    assert.deepEqual(
      names({ ...base, sort: { column: 'sold', direction: 'asc' } }),
      ['bauble jig', 'Ink pad', 'Café Jig', 'Coaster']
    );
    assert.deepEqual(
      names({ ...base, sort: { column: 'sold', direction: 'desc' } }),
      ['Coaster', 'Café Jig', 'bauble jig', 'Ink pad']
    );
  });

  void it('filters by search and by column, ignoring case and accents', () => {
    assert.deepEqual(names({ ...base, search: 'CAFE' }), ['Café Jig']);
    assert.deepEqual(names({ ...base, filters: { name: 'jig' } }), [
      'Café Jig',
      'bauble jig',
    ]);
    assert.deepEqual(
      names({ ...base, search: 'jig', filters: { name: 'bauble' } }),
      ['bauble jig']
    );
    assert.deepEqual(names({ ...base, filters: { name: '   ' } }).length, 4);
  });

  void it('pages, reports totals and clamps the page', () => {
    const second = queryRows(data, { page: 2, pageSize: 3 }, 'en');
    assert.ok(second.ok);
    assert.equal(second.value.rows.length, 1);
    assert.equal(second.value.totalRows, 4);
    assert.equal(second.value.pageCount, 2);
    const clamped = queryRows(data, { page: 99, pageSize: 3 }, 'en');
    assert.ok(clamped.ok);
    assert.equal(clamped.value.page, 2);
    const none = queryRows(data, { ...base, search: 'zzz' }, 'en');
    assert.ok(none.ok);
    assert.deepEqual(
      [none.value.totalRows, none.value.page, none.value.pageCount],
      [0, 1, 1]
    );
  });

  void it('names the column when it does not exist or cannot sort', () => {
    const missing = queryRows(data, {
      ...base,
      sort: { column: 'price', direction: 'asc' },
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.match(
        missing.error,
        /sort column "price" does not exist\. Columns: "name", "sold", "note"/
      );
    }
    const unsortable = queryRows(data, {
      ...base,
      sort: { column: 'note', direction: 'asc' },
    });
    assert.equal(unsortable.ok, false);
    if (!unsortable.ok)
      assert.match(unsortable.error, /"note" is not sortable/);
    const badFilter = queryRows(data, { ...base, filters: { nope: 'x' } });
    assert.equal(badFilter.ok, false);
    if (!badFilter.ok) assert.match(badFilter.error, /filter column "nope"/);
  });
});

void describe('detail query strings', () => {
  void it('round-trips a query, leaving defaults out', () => {
    const query: DetailQuery = {
      search: 'bauble jig & co',
      filters: { name: 'ré' },
      sort: { column: 'sold', direction: 'desc' },
      page: 3,
      pageSize: 25,
    };
    const text: string = serializeDetailQuery(query);
    assert.equal(serializeDetailQuery(defaultDetailQuery()), '');
    const back = parseDetailQuery(`?${text}`, 25, data);
    assert.ok(back.ok);
    assert.deepEqual(back.value, query);
  });

  void it('ignores unknown parameters and reads plus as a space', () => {
    const result = parseDetailQuery('tab=drafts&q=a+b&page=2');
    assert.ok(result.ok);
    assert.equal(result.value.search, 'a b');
    assert.equal(result.value.page, 2);
  });

  void it('rejects malformed values with the parameter named', () => {
    for (const [text, pattern] of [
      ['page=0', /page must be a whole number from 1, got "0"/],
      ['page=x', /page must be a whole number/],
      ['sort=sold:up', /sort must look like "column:asc"/],
      ['q=%E0%A4%A', /not valid percent-encoding/],
    ] as const) {
      const result = parseDetailQuery(text);
      assert.equal(result.ok, false, text);
      if (!result.ok) assert.match(result.error, pattern);
    }
    const unknown = parseDetailQuery('sort=price:asc', 25, data);
    assert.equal(unknown.ok, false);
    if (!unknown.ok)
      assert.match(unknown.error, /sort column "price" does not exist/);
  });
});

void describe('validateDetailData', () => {
  void it('accepts good data', () => {
    assert.ok(validateDetailData(data).ok);
  });

  void it('reports every problem with its position', () => {
    const result = validateDetailData({
      columns: [
        { key: 'a', label: 'A' },
        { key: 'a', label: 3 },
      ],
      rows: [
        [{ text: 'x' }],
        [
          { text: 'y', value: NaN },
          { text: 'z', href: 'javascript:alert(1)' },
        ],
      ],
      totalRows: -1,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /^Detail data: /);
    assert.match(
      result.error,
      /columns\[1\]\.key "a" is used by an earlier column/
    );
    assert.match(
      result.error,
      /columns\[1\]\.label must be a string, got number/
    );
    assert.match(result.error, /rows\[0\] has 1 cells but there are 2 columns/);
    assert.match(
      result.error,
      /rows\[1\]\[0\]\.value must be a string or a finite number/
    );
    assert.match(
      result.error,
      /rows\[1\]\[1\]\.href "javascript:alert\(1\)" is not allowed/
    );
    assert.match(result.error, /totalRows must be a non-negative whole number/);
  });

  void it('rejects non-objects and missing columns', () => {
    const notObject = validateDetailData(null, 'Widget "x" detail');
    assert.equal(notObject.ok, false);
    if (!notObject.ok) {
      assert.equal(
        notObject.error,
        'Widget "x" detail: must be an object, got null.'
      );
    }
    const empty = validateDetailData({ columns: [], rows: [] });
    assert.equal(empty.ok, false);
  });
});

void describe('detail option on definitions', () => {
  const base = { key: 'x', title: 'X', kind: 'TABLE' } as const;

  void it('resolves defaults', () => {
    assert.equal(resolveDetailOptions(base), undefined);
    assert.equal(resolveDetailOptions({ ...base, detail: false }), undefined);
    assert.deepEqual(resolveDetailOptions({ ...base, detail: true }), {
      title: 'X',
      pageSize: 25,
      mode: 'client',
    });
    assert.deepEqual(
      resolveDetailOptions({
        ...base,
        detail: { title: 'All X', pageSize: 50, mode: 'server' },
      }),
      { title: 'All X', pageSize: 50, mode: 'server' }
    );
  });

  void it('validates the setting', () => {
    assert.ok(validateWidgetDefinition({ ...base, detail: true }).ok);
    assert.ok(
      validateWidgetDefinition({
        ...base,
        detail: { pageSize: 200, mode: 'server' },
      }).ok
    );
    const bad = validateWidgetDefinition({
      ...base,
      detail: { pageSize: 0, mode: 'remote', title: 3 },
    });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.match(
      bad.error,
      /detail\.pageSize must be a whole number from 1 to 200, got 0/
    );
    assert.match(bad.error, /detail\.mode must be one of "client", "server"/);
    assert.match(bad.error, /detail\.title must be a string, got number/);
    const wrongType = validateWidgetDefinition({ ...base, detail: 'yes' });
    assert.equal(wrongType.ok, false);
    if (!wrongType.ok)
      assert.match(
        wrongType.error,
        /detail must be true, false or an options object, got string/
      );
  });
});

void describe('deriveDetailData', () => {
  void it('turns a complete TABLE into detail data', () => {
    const derived = deriveDetailData({
      kind: 'TABLE',
      columns: [{ label: 'Name' }, { label: 'Sold', numeric: true }],
      rows: [[{ text: 'Jig', href: '/jig' }, { text: '7' }]],
    });
    assert.deepEqual(derived?.columns, [
      { key: 'c0', label: 'Name' },
      { key: 'c1', label: 'Sold', numeric: true },
    ]);
    assert.equal(derived?.rows[0]?.[0]?.href, '/jig');
  });

  void it('refuses a TABLE with a footer, since rows were left out', () => {
    assert.equal(
      deriveDetailData({
        kind: 'TABLE',
        columns: [{ label: 'A' }],
        rows: [],
        footer: 'and 12 more',
      }),
      undefined
    );
  });

  void it('turns a BAR_LIST into label and value columns', () => {
    const derived = deriveDetailData(
      {
        kind: 'BAR_LIST',
        items: [
          { label: 'US', value: 1200 },
          { label: 'DE', value: 3, display: '3 orders' },
        ],
      },
      'en-US'
    );
    assert.equal(derived?.rows[0]?.[1]?.text, '1,200');
    assert.equal(derived?.rows[0]?.[1]?.value, 1200);
    assert.equal(derived?.rows[1]?.[1]?.text, '3 orders');
  });

  void it('has nothing for kinds that need a provider', () => {
    assert.equal(
      deriveDetailData({ kind: 'TEXT', label: 'a', value: 'b' }),
      undefined
    );
  });
});

void describe('table controls', () => {
  void it('resolves tableControls with both on by default', () => {
    assert.equal(resolveTableControls({}), undefined);
    assert.equal(resolveTableControls({ tableControls: false }), undefined);
    assert.deepEqual(resolveTableControls({ tableControls: true }), {
      search: true,
      sort: true,
    });
    assert.deepEqual(resolveTableControls({ tableControls: { sort: false } }), {
      search: true,
      sort: false,
    });
    assert.equal(
      resolveTableControls({ tableControls: { search: false, sort: false } }),
      undefined
    );
  });

  void it('sorts and searches a TABLE by cell values when given', () => {
    const detail = tableDetailData({
      kind: 'TABLE',
      columns: [{ label: 'When' }, { label: 'Total', numeric: true }],
      rows: [
        [
          { text: 'yesterday', value: 200 },
          { text: '$99.00', value: 9900 },
        ],
        [
          { text: '3 days ago', value: 100 },
          { text: '$1,234.00', value: 123400 },
        ],
        [
          { text: 'today', value: 300 },
          { text: '$5.00', value: 500 },
        ],
      ],
    });
    const byWhen = queryRows(detail, {
      page: 1,
      pageSize: 10,
      sort: { column: 'c0', direction: 'asc' },
    });
    assert.ok(byWhen.ok);
    assert.deepEqual(
      byWhen.value.rows.map((row) => row[0]?.text),
      ['3 days ago', 'yesterday', 'today']
    );
    const byTotal = queryRows(detail, {
      page: 1,
      pageSize: 10,
      sort: { column: 'c1', direction: 'desc' },
    });
    assert.ok(byTotal.ok);
    assert.deepEqual(
      byTotal.value.rows.map((row) => row[1]?.text),
      ['$1,234.00', '$99.00', '$5.00']
    );
  });

  void it('turns a TABLE with a footer into queryable rows', () => {
    const detail = tableDetailData({
      kind: 'TABLE',
      columns: [{ label: 'Name' }, { label: 'Sold', numeric: true }],
      rows: [
        [{ text: 'b' }, { text: '2' }],
        [{ text: 'a' }, { text: '10' }],
      ],
      footer: 'and 5 more',
    });
    assert.deepEqual(
      detail.columns.map((column) => column.key),
      ['c0', 'c1']
    );
    const result = queryRows(detail, {
      page: 1,
      pageSize: 10,
      sort: { column: 'c0', direction: 'asc' },
    });
    assert.ok(result.ok);
    assert.equal(result.value.rows[0]?.[0]?.text, 'a');
  });

  void it('validates tableControls on a definition', () => {
    const base = { key: 'x', title: 'X', kind: 'TABLE' } as const;
    assert.ok(validateWidgetDefinition({ ...base, tableControls: true }).ok);
    assert.ok(
      validateWidgetDefinition({ ...base, tableControls: { search: false } }).ok
    );
    for (const tableControls of ['yes', { sort: 'no' }]) {
      const result = validateWidgetDefinition({ ...base, tableControls });
      assert.equal(result.ok, false);
    }
    const wrongKind = validateWidgetDefinition({
      key: 'x',
      title: 'X',
      kind: 'KPI',
      tableControls: true,
    });
    assert.equal(wrongKind.ok, false);
    if (!wrongKind.ok) {
      assert.match(
        wrongKind.error,
        /tableControls only applies to TABLE widgets, but kind is "KPI"/
      );
    }
  });
});

void describe('server mode', () => {
  const page: DetailData = {
    columns: [{ key: 'name', label: 'Name' }],
    rows: [[{ text: 'a' }], [{ text: 'b' }]],
    totalRows: 25,
  };
  const query: DetailQuery = { page: 2, pageSize: 10 };

  void it('serverPage trusts the rows and counts pages from totalRows', () => {
    const result = serverPage(page, query);
    assert.ok(result.ok);
    assert.equal(result.value.rows.length, 2);
    assert.equal(result.value.totalRows, 25);
    assert.equal(result.value.pageCount, 3);
    assert.equal(result.value.page, 2);
  });

  void it('serverPage fails without totalRows', () => {
    const { totalRows: _total, ...withoutTotal } = page;
    const result = serverPage(withoutTotal, query);
    assert.ok(!result.ok);
    assert.match(result.error, /needs totalRows/);
  });

  void it('clampServerQuery asks again for the last page when the data shrank', () => {
    assert.equal(clampServerQuery(page, query), undefined);
    const shrunk = clampServerQuery(
      { ...page, rows: [], totalRows: 12 },
      { page: 5, pageSize: 10 }
    );
    assert.deepEqual(shrunk, { page: 2, pageSize: 10 });
    const empty = clampServerQuery(
      { ...page, rows: [], totalRows: 0 },
      { page: 3, pageSize: 10 }
    );
    assert.deepEqual(empty, { page: 1, pageSize: 10 });
  });

  void it('validateDetailData checks the answer is one page in server mode', () => {
    assert.ok(
      validateDetailData(page, 'D', { mode: 'server', pageSize: 10 }).ok
    );
    const missing = validateDetailData(
      { columns: page.columns, rows: page.rows },
      'D',
      { mode: 'server' }
    );
    assert.ok(!missing.ok);
    assert.match(missing.error, /server mode needs totalRows/);
    const tooMany = validateDetailData(page, 'D', {
      mode: 'server',
      pageSize: 1,
    });
    assert.ok(!tooMany.ok);
    assert.match(tooMany.error, /2 rows came back for a page size of 1/);
    const beyond = validateDetailData({ ...page, totalRows: 1 }, 'D', {
      mode: 'server',
    });
    assert.ok(!beyond.ok);
    assert.match(beyond.error, /totalRows is 1 but 2 rows/);
    assert.ok(validateDetailData({ columns: page.columns, rows: [] }, 'D').ok);
  });
});

void describe('detail deep links', () => {
  const defs = [
    { key: 'orders', title: 'Orders', detail: { pageSize: 10 } as const },
    { key: 'plain', title: 'Plain' },
    { key: 'orders#1', title: 'Orders (#1)', detail: true as const },
  ];

  void it('serializes the open detail view with its query, and nothing for none', () => {
    assert.equal(serializeDetailLink(undefined), '');
    assert.equal(serializeDetailLink(null), '');
    assert.equal(
      serializeDetailLink({ key: 'orders', query: { page: 1, pageSize: 10 } }),
      'widget=orders'
    );
    assert.equal(
      serializeDetailLink({
        key: 'orders#1',
        query: {
          page: 2,
          pageSize: 10,
          search: 'a b',
          sort: { column: 'total', direction: 'desc' },
        },
      }),
      'widget=orders%231&q=a%20b&sort=total%3Adesc&page=2'
    );
  });

  void it('round-trips through parseDetailLink, taking the page size from the definition', () => {
    const link = {
      key: 'orders',
      query: {
        page: 3,
        pageSize: 10,
        search: 'jig',
        filters: { name: 'x' },
        sort: { column: 'total', direction: 'asc' },
      },
    } as const;
    const parsed = parseDetailLink(`?${serializeDetailLink(link)}`, defs);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value, link);
    const clone = parseDetailLink('widget=orders%231', defs);
    assert.ok(clone.ok);
    assert.equal(clone.value?.query.pageSize, 25);
  });

  void it('is ok with undefined when there is no widget parameter', () => {
    for (const text of ['', '?tab=sales', 'page=2']) {
      const parsed = parseDetailLink(text, defs);
      assert.ok(parsed.ok);
      assert.equal(parsed.value, undefined);
    }
  });

  void it('names the problem for an unknown widget, no detail view, or a bad parameter', () => {
    const unknown = parseDetailLink('widget=zzz', defs);
    assert.ok(!unknown.ok);
    assert.match(unknown.error, /widget "zzz" does not exist.*"orders"/);
    const plain = parseDetailLink('widget=plain', defs);
    assert.ok(!plain.ok);
    assert.match(plain.error, /widget "plain" has no detail view/);
    const empty = parseDetailLink('widget=', defs);
    assert.ok(!empty.ok);
    assert.match(empty.error, /"widget" parameter is empty/);
    const page = parseDetailLink('widget=orders&page=0', defs);
    assert.ok(!page.ok);
    assert.match(page.error, /page must be a whole number/);
  });

  void it('withDetailLink keeps other parameters and replaces the detail ones', () => {
    const link = {
      key: 'orders',
      query: { page: 2, pageSize: 10, search: 'x' },
    };
    assert.equal(
      withDetailLink('?tab=sales&page=9&widget=old&f.a=1&q=zzz', link),
      'tab=sales&widget=orders&q=x&page=2'
    );
    assert.equal(
      withDetailLink('tab=sales&widget=orders&q=x', null),
      'tab=sales'
    );
    assert.equal(withDetailLink('', link), 'widget=orders&q=x&page=2');
  });

  void it('sanitizeDetailQuery drops filters and sorts the data cannot honor', () => {
    const columns = [
      { key: 'name' },
      { key: 'note', sortable: false },
      { key: 'total' },
    ];
    const fine: DetailQuery = {
      page: 2,
      pageSize: 10,
      filters: { name: 'a' },
      sort: { column: 'total', direction: 'asc' },
    };
    assert.equal(sanitizeDetailQuery(fine, columns), fine);
    assert.deepEqual(
      sanitizeDetailQuery(
        {
          page: 2,
          pageSize: 10,
          search: 's',
          filters: { name: 'a', gone: 'b' },
          sort: { column: 'note', direction: 'asc' },
        },
        columns
      ),
      { page: 2, pageSize: 10, search: 's', filters: { name: 'a' } }
    );
    assert.deepEqual(
      sanitizeDetailQuery(
        {
          page: 1,
          pageSize: 10,
          filters: { gone: 'b' },
          sort: { column: 'nope', direction: 'desc' },
        },
        columns
      ),
      { page: 1, pageSize: 10 }
    );
  });
});
