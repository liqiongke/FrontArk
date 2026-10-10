/**
 * 结构树的构建。
 *
 * 直接把 analyze 的扁平节点表按 node.parentId 渲染，得到的是**源码词法嵌套**；
 * 但布局里真正的父子关系是 `items` 数组里的 `this.X.id` **引用**（多个布局可以引用同一个视图）。
 * 所以这里按引用关系重建一棵树，并做两件扁平表表达不了的事：
 *   1）以根视图（getRootId 的目标，如 layout）为顶层，它 items 引用到的子视图嵌在它下面；
 *   2）把散落在根下的 data 节点收进一个统一的「数据」根。
 *
 * 由于同一 nodeId 会在多个父节点下重复出现，每个 TreeItem 用**路径式 key** 区分。
 */
import type { Analysis, SemanticNode } from '@/types';

type ViewMembers = NonNullable<Analysis['page']>['viewMembers'];

export interface TreeItem {
  /** 路径式唯一 key：同一 nodeId 可能重复出现，React key 与展开态都必须按路径而非 nodeId。 */
  key: string;
  /** 真实语义节点；合成分组节点（如「数据」根）为 null。 */
  node: SemanticNode | null;
  kind: SemanticNode['kind'];
  label: string;
  /** 合成节点：只可展开，不可选中。 */
  synthetic?: boolean;
  /** 孤悬视图：没有被任何布局 items 引用到。 */
  orphan?: boolean;
  children: TreeItem[];
}

export function buildStructureTree(analysis: Analysis): TreeItem[] {
  const byId = new Map(analysis.nodes.map((n) => [n.id, n]));
  const viewMembers = analysis.page?.viewMembers ?? {};
  const memberNames = Object.keys(viewMembers);

  // 非 L1 页面（没有 ViewBase 成员，如 L2/L3）：没有可用的引用关系，退回按 parentId 渲染。
  if (memberNames.length === 0) {
    return analysis.nodes.filter((n) => n.parentId === null).map((n) => nodeItem(n, byId));
  }

  const rootMembers = memberNames.filter((m) => viewMembers[m].isRoot);
  const ancestors = new Set(rootMembers);

  // 被任何成员引用到的视图（含根视图）：不在其中的即为孤悬视图。
  const referenced = new Set<string>(rootMembers);
  for (const m of memberNames) {
    for (const ref of viewMembers[m].layoutItems ?? []) referenced.add(ref);
  }

  const top: string[] = [];
  const addTop = (m: string) => {
    if (top.includes(m) || !viewMembers[m]) return;
    top.push(m);
  };

  // 根视图（getRootId 的目标，如 layout）就在顶层：form/table 作为它 items 引用到的
  // 子视图嵌在它下面。这样树是从根一路展开的，与源码里的布局层级一致。
  rootMembers.forEach(addTop);
  // 未被任何布局引用到的视图：补到顶层，避免在面板里「消失」。
  for (const m of memberNames) if (!referenced.has(m)) addTop(m);
  // 没识别出根视图时兜底：以所有成员作为顶层。
  if (top.length === 0) for (const m of memberNames) addTop(m);

  const items: TreeItem[] = top.map((m) => {
    // 从根成员开始递归；ancestors 预置根成员，防止根被再次嵌进子层形成环。
    const item = viewItem(m, 'views', ancestors, viewMembers, byId);
    // 未被任何布局引用到的视图即孤悬（根成员在 referenced 里，不会命中）。
    if (!referenced.has(m)) item.orphan = true;
    return item;
  });

  // 统一「数据」根：把散落的 data 成员收进来。
  const dataItems = analysis.nodes.filter((n) => n.kind === 'data' && n.parentId === 'page').map((n) => nodeItem(n, byId));
  if (dataItems.length > 0) {
    items.push({ key: 'data-root', node: null, kind: 'data', label: '数据', synthetic: true, children: dataItems });
  }

  // 处理器容器：沿用真实节点。
  const handlerNode = byId.get('handler');
  if (handlerNode) items.push(nodeItem(handlerNode, byId));

  return items;
}

/** 按 `layoutItems` 引用关系递归展开视图；普通视图（无 items）为叶子。 */
function viewItem(
  member: string,
  parentKey: string,
  ancestors: Set<string>,
  viewMembers: ViewMembers,
  byId: Map<string, SemanticNode>,
): TreeItem {
  const node = byId.get(`view.${member}`) ?? null;
  const item: TreeItem = {
    key: `${parentKey}/view.${member}`,
    node,
    kind: 'view',
    label: node?.label || `视图「${member}」`,
    children: [],
  };
  const refs = viewMembers[member].layoutItems ?? [];
  if (refs.length === 0) return item;

  const next = new Set(ancestors).add(member);
  for (const ref of refs) {
    // 环保护：成员在其祖先路径中已出现过就不再向下展开。
    if (!viewMembers[ref] || next.has(ref)) continue;
    item.children.push(viewItem(ref, item.key, next, viewMembers, byId));
  }
  return item;
}

/** 真实节点 → TreeItem：子节点按 node.children 的词法嵌套展开（用于 data / handler）。 */
function nodeItem(node: SemanticNode, byId: Map<string, SemanticNode>, parentKey = ''): TreeItem {
  const key = parentKey ? `${parentKey}/${node.id}` : node.id;
  return {
    key,
    node,
    kind: node.kind,
    label: node.label || node.name,
    children: node.children
      .map((id) => byId.get(id))
      .filter((c): c is SemanticNode => Boolean(c))
      .map((c) => nodeItem(c, byId, key)),
  };
}

/** 按类型隐藏节点：被隐藏的节点连同其子树一起剪掉。 */
export function filterByKind(items: TreeItem[], hidden: Set<SemanticNode['kind']>): TreeItem[] {
  if (hidden.size === 0) return items;
  const visit = (item: TreeItem): TreeItem | null => {
    if (hidden.has(item.kind)) return null;
    const children = item.children.map(visit).filter((c): c is TreeItem => Boolean(c));
    return children.length === item.children.length ? item : { ...item, children };
  };
  return items.map(visit).filter((i): i is TreeItem => Boolean(i));
}

export interface TreeSearch {
  /** 命中节点自身的 key。 */
  hits: Set<string>;
  /** 需要自动展开的 key：命中节点 + 其所有祖先。 */
  expand: Set<string>;
}

export function searchTree(items: TreeItem[], keyword: string): TreeSearch {
  const kw = keyword.toLowerCase();
  const hits = new Set<string>();
  const expand = new Set<string>();

  const visit = (item: TreeItem): boolean => {
    const self = matches(item, kw);
    let any = self;
    for (const child of item.children) if (visit(child)) any = true;
    if (self) hits.add(item.key);
    if (any) expand.add(item.key);
    return any;
  };
  for (const item of items) visit(item);

  return { hits, expand };
}

function matches(item: TreeItem, kw: string): boolean {
  if (item.label.toLowerCase().includes(kw)) return true;
  const n = item.node;
  if (!n) return false;
  return n.id.toLowerCase().includes(kw) || n.name.toLowerCase().includes(kw) || String(n.value ?? '').toLowerCase().includes(kw);
}