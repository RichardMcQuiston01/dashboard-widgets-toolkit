/**
 * Mounts Vue components without a DOM, so `onMounted`, watchers and event
 * handlers run in tests (`renderToString` runs none of them). A tiny tree of
 * plain objects stands in for the document; props land on `props`.
 */
import {
  createRenderer,
  nextTick,
  type App,
  type Component,
  type RendererOptions,
} from 'vue';

export interface FakeNode {
  readonly kind: 'element' | 'text' | 'comment';
  readonly tag: string;
  text: string;
  children: FakeNode[];
  parent: FakeNode | null;
  props: Record<string, unknown>;
}

function node(kind: FakeNode['kind'], tag: string, text = ''): FakeNode {
  return { kind, tag, text, children: [], parent: null, props: {} };
}

function detach(child: FakeNode): void {
  const parent: FakeNode | null = child.parent;
  if (parent === null) return;
  parent.children = parent.children.filter((item) => item !== child);
  child.parent = null;
}

const options: RendererOptions<FakeNode, FakeNode> = {
  createElement: (tag) => node('element', tag),
  createText: (text) => node('text', '#text', text),
  createComment: (text) => node('comment', '#comment', text),
  setText: (target, text) => {
    target.text = text;
  },
  setElementText: (target, text) => {
    for (const child of target.children) child.parent = null;
    target.children = [];
    if (text !== '') {
      const created: FakeNode = node('text', '#text', text);
      created.parent = target;
      target.children.push(created);
    }
  },
  insert: (child, parent, anchor) => {
    detach(child);
    child.parent = parent;
    const at: number =
      anchor === null || anchor === undefined
        ? parent.children.length
        : parent.children.indexOf(anchor);
    parent.children.splice(at < 0 ? parent.children.length : at, 0, child);
  },
  remove: detach,
  parentNode: (child) => child.parent,
  nextSibling: (child) => {
    const siblings: FakeNode[] = child.parent?.children ?? [];
    return siblings[siblings.indexOf(child) + 1] ?? null;
  },
  patchProp: (target, key, _previous, next) => {
    target.props[key] = next;
  },
};

const renderer = createRenderer<FakeNode, FakeNode>(options);

export interface Mounted {
  readonly root: FakeNode;
  readonly app: App<FakeNode>;
  unmount(): void;
}

export function mountComponent(
  component: Component,
  props: Record<string, unknown> = {}
): Mounted {
  const root: FakeNode = node('element', 'root');
  const app: App<FakeNode> = renderer.createApp(component, props);
  app.mount(root);
  return { root, app, unmount: () => app.unmount() };
}

/** Lets promises, watchers and renders settle. */
export async function settle(rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

/** Every element below `from` (and `from`), depth first. */
export function elements(from: FakeNode): FakeNode[] {
  return [
    ...(from.kind === 'element' ? [from] : []),
    ...from.children.flatMap(elements),
  ];
}

export function findAll(from: FakeNode, tag: string): FakeNode[] {
  return elements(from).filter((item) => item.tag === tag);
}

export function textOf(from: FakeNode): string {
  return from.kind === 'text' ? from.text : from.children.map(textOf).join('');
}
