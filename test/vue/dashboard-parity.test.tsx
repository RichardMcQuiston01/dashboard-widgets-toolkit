import { describe, it } from 'node:test';

import { createTheme, themePresets } from '../../src/core/index.js';
import type { DashboardLayout } from '../../src/core/layout.js';
import type { DashboardWidget } from '../../src/core/resolve.js';
import * as reactApi from '../../src/react/index.js';
import * as vueApi from '../../src/vue/index.js';
import { assertParity, type ParityOptions } from './helpers.js';

const definitions = [
  { key: 'a', title: 'Alpha', kind: 'TEXT', width: 6, sortOrder: 1 },
  { key: 'b', title: 'Beta', kind: 'TEXT', width: 6, sortOrder: 2 },
  { key: 'c', title: 'Gamma', kind: 'TEXT', width: 6, sortOrder: 3 },
  {
    key: 'pin',
    title: 'Pinned',
    kind: 'TEXT',
    width: 6,
    sortOrder: 4,
    locked: { move: true },
  },
] as const;

const widgets: DashboardWidget[] = definitions.map((definition) => ({
  definition: definition as never,
  status: 'ok' as const,
  data: {
    kind: 'TEXT' as const,
    value: `text of ${definition.key}`,
    label: definition.title,
  },
}));

const arranged: DashboardLayout = {
  order: ['c', 'a', 'b'],
  hidden: ['b'],
  minimized: ['c'],
};

const twoPages: DashboardLayout = {
  order: [],
  hidden: [],
  minimized: [],
  pages: [
    { key: 'p1', title: 'Sales', order: ['a', 'b'], hidden: [], minimized: [] },
    { key: 'p2', title: 'Stock', order: ['c'], hidden: ['pin'], minimized: [] },
  ],
};

const onLayoutChange = (): void => undefined;

function parity(
  name: string,
  props: Record<string, unknown>,
  options: ParityOptions = {}
): void {
  void it(name, async () => {
    await assertParity(
      name,
      <reactApi.Dashboard widgets={widgets} {...props} />,
      { component: vueApi.Dashboard, props: { widgets, ...props } },
      options
    );
  });
}

void describe('Dashboard: Vue draws what React draws', () => {
  parity('read-only, no layout', {});
  parity('read-only shows minimized widgets as cards', { layout: arranged });
  parity('with layout controls, a hidden bar and a minimized bar', {
    layout: arranged,
    onLayoutChange,
  });
  parity(
    'with the Arrange menus open',
    { layout: arranged, onLayoutChange },
    { menusOpen: true }
  );
  parity('toggle mode, not editing', {
    layout: arranged,
    onLayoutChange,
    editMode: 'toggle',
  });
  parity(
    'toggle mode, editing',
    {
      layout: arranged,
      onLayoutChange,
      editMode: 'toggle',
      defaultEditing: true,
    },
    { menusOpen: true }
  );
  parity('toggle mode without the toolbar', {
    onLayoutChange,
    editMode: 'toggle',
    toolbar: false,
    editing: true,
  });
  parity(
    'overrideLocks keeps the lock icon',
    { onLayoutChange, overrideLocks: true },
    { menusOpen: true }
  );
  parity('every widget hidden', {
    layout: { order: [], hidden: ['a', 'b', 'c', 'pin'], minimized: [] },
    onLayoutChange,
  });
  parity('no widgets', { widgets: [] });
  parity('two pages, read-only', { layout: twoPages });
  parity('two pages, the second in view', {
    layout: twoPages,
    activePage: 'p2',
  });
  parity(
    'two pages, editing',
    {
      layout: twoPages,
      onLayoutChange,
      editMode: 'toggle',
      defaultEditing: true,
    },
    { menusOpen: true }
  );
  parity(
    'one page, editing shows only Add page',
    { onLayoutChange },
    { menusOpen: true }
  );
  parity('maxPages reached', {
    layout: twoPages,
    onLayoutChange,
    maxPages: 2,
  });
  parity('an empty page', {
    layout: {
      ...twoPages,
      pages: [
        ...(twoPages.pages ?? []),
        { key: 'p3', title: 'Empty', order: [], hidden: [], minimized: [] },
      ],
    },
    activePage: 'p3',
  });
  parity('labels and classes from the dashboard itself', {
    labels: { customize: 'Edit', allHidden: 'Nada' },
    classNames: { dashboard: 'extra', card: 'rounded' },
    onLayoutChange,
    editMode: 'toggle',
    linkTarget: '_blank',
    className: 'mine',
  });

  void it('a theme wraps the dashboard', async () => {
    const created = createTheme(themePresets.mono);
    if (!created.ok) throw new Error(created.error);
    await assertParity(
      'theme',
      <reactApi.Dashboard widgets={widgets} theme={created.value} />,
      {
        component: vueApi.Dashboard,
        props: { widgets, theme: created.value },
      }
    );
  });

  void it('WidgetGrid', async () => {
    const onRetry = (): void => undefined;
    await assertParity(
      'grid',
      <reactApi.WidgetGrid widgets={widgets} onRetry={onRetry} freshness />,
      {
        component: vueApi.WidgetGrid,
        props: { widgets, onRetry, freshness: true },
      }
    );
  });

  void it('saved viewer settings apply (title and width)', async () => {
    const layout: DashboardLayout = {
      ...arranged,
      settings: { a: { title: 'Renamed', width: 12 } },
    };
    await assertParity(
      'settings',
      <reactApi.Dashboard widgets={widgets} layout={layout} />,
      { component: vueApi.Dashboard, props: { widgets, layout } }
    );
  });
});
