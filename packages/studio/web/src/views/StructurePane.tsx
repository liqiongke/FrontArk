import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Crosshair, FileCode2, ListFilter, Search, Unlink } from 'lucide-react';

import { Badge, Button, Empty, Input, Spinner } from '@/ui';
import { basename, cn } from '@/lib/utils';
import { buildStructureTree, filterByKind, searchTree, type TreeItem, type TreeSearch } from '@/lib/structureTree';
import { useStudio } from '@/store/studio';
import type { SemanticNode } from '@/types';

/** 页面行的展示名：优先别名，其次路由（根路由显示为「(根)」）。 */
function pageLabel(page: { route: string; name?: string | null }): string {
  const alias = page.name?.trim();
  if (alias) return alias;
  return page.route === '/' ? '(根)' : page.route;
}

/**
 * 写剪贴板：优先 Clipboard API，被拒或不可用时退回 execCommand。
 *
 * 需要兜底的原因：Clipboard API 只在安全上下文可用，且要求文档获得焦点与用户手势；
 * 用局域网 IP 打开、或页面未聚焦时它会直接 reject —— 用户的点击反而没反应。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的兜底
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 过滤菜单里可切换显示的节点类型。 */
const FILTER_KINDS: { kind: SemanticNode['kind']; label: string }[] = [
  { kind: 'view', label: '视图' },
  { kind: 'data', label: '数据' },
  { kind: 'handler', label: '处理器' },
  { kind: 'prop', label: '属性' },
  { kind: 'arrayItem', label: '数组项' },
];

/** 左栏：页面清单 + 当前页面的语义结构树。 */
export function StructurePane() {
  const pages = useStudio((s) => s.pages);
  const route = useStudio((s) => s.route);
  const analysis = useStudio((s) => s.analysis);
  const loading = useStudio((s) => s.loading);
  const openRoute = useStudio((s) => s.openRoute);

  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<SemanticNode['kind']>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  /** 刚复制过的路由：用它把图标短暂切成对勾做反馈。 */
  const [copiedRoute, setCopiedRoute] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const notice = useStudio((s) => s.notice);

  const copyRoute = async (target: string) => {
    if (!(await copyText(target))) {
      notice('error', '复制失败：浏览器拒绝了剪贴板访问，请改用 localhost 打开');
      return;
    }
    setCopiedRoute(target);
    window.setTimeout(() => setCopiedRoute((cur) => (cur === target ? null : cur)), 1200);
  };

  // 换页面时重置展开状态：默认全部折叠。
  useEffect(() => setExpanded(new Set()), [analysis]);

  // 过滤菜单：点击面板外部关闭。
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  const tree = useMemo(() => (analysis ? buildStructureTree(analysis) : []), [analysis]);
  const visible = useMemo(() => filterByKind(tree, hiddenKinds), [tree, hiddenKinds]);
  const matched = useMemo(() => (keyword.trim() ? searchTree(visible, keyword.trim()) : null), [visible, keyword]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof pages>();
    for (const page of pages) {
      const seg = page.route.split('/').filter(Boolean);
      const group = seg.length > 1 ? `/${seg[0]}` : '/';
      map.set(group, [...(map.get(group) ?? []), page]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pages]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleKind = (kind: SemanticNode['kind']) =>
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 border-b border-border px-2.5 py-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-semibold">页面</span>
          <Badge tone="muted" className="ml-auto">
            {pages.length}
          </Badge>
        </div>
        <div className="max-h-[150px] overflow-auto scroll-thin">
          {groups.map(([group, list]) => (
            <div key={group} className="mb-1">
              <div className="px-1 py-0.5 text-[11px] font-medium text-muted-foreground/80">{group}</div>
              {list.map((page) => (
                <button
                  key={page.route}
                  type="button"
                  onClick={() => void openRoute(page.route)}
                  // 别名为主，路由退到 tooltip：悬停即可看到真实路径。
                  title={page.route}
                  className={cn(
                    'group flex w-full items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[12px] transition-colors',
                    page.route === route ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                  )}
                >
                  <span className="truncate">{pageLabel(page)}</span>
                  <span
                    role="button"
                    aria-label="复制页面路径"
                    title="复制页面路径"
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyRoute(page.route);
                    }}
                    className={cn(
                      'ml-auto hidden shrink-0 items-center rounded-[4px] p-0.5 group-hover:flex',
                      copiedRoute === page.route
                        ? 'flex text-emerald-600'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {copiedRoute === page.route ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {pages.length === 0 && <Empty>该项目下未发现页面</Empty>}
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2.5">
        <span className="text-[12px] font-semibold">结构</span>
        {analysis?.page && (
          // 带上级别：L2（普通 React）与 L3（转发壳）能力不同，只说"只读"分不出来
          <Badge tone={analysis.page.level === 'L1' ? 'success' : 'warn'}>
            {analysis.page.level === 'L1' ? '可编辑' : `只读 · ${analysis.page.level}`}
          </Badge>
        )}
        <div ref={filterRef} className="relative ml-auto flex items-center gap-1">
          {loading && <Spinner />}
          <Button
            size="icon"
            variant="ghost"
            title="过滤节点类型"
            aria-label="过滤节点类型"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
          >
            <ListFilter className="h-3.5 w-3.5" />
          </Button>
          {filterOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-[6px] border border-border bg-card p-1 shadow-lg">
              <div className="flex items-center justify-between px-1.5 py-1 text-[11px] text-muted-foreground">
                <button type="button" className="hover:text-foreground" onClick={() => setHiddenKinds(new Set())}>
                  全选
                </button>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => setHiddenKinds(new Set(FILTER_KINDS.map((k) => k.kind)))}
                >
                  清空
                </button>
              </div>
              {FILTER_KINDS.map(({ kind, label }) => {
                const on = !hiddenKinds.has(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleKind(kind)}
                    className="flex w-full items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-1.5 top-1.5 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节点 / 字段 / 值"
            className="pl-6"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin py-1">
        {!analysis && !loading && <Empty>选择一个页面后显示结构</Empty>}
        {analysis && visible.length === 0 && <Empty>当前过滤条件下没有可显示的节点</Empty>}
        {analysis && visible.length > 0 && matched && matched.hits.size === 0 && <Empty>没有匹配的节点</Empty>}
        {visible.map((item) => (
          <TreeNode key={item.key} item={item} depth={0} matched={matched} expanded={expanded} onToggle={toggle} />
        ))}
      </div>

      {analysis?.page && (
        <div className="shrink-0 border-t border-border px-2.5 py-1.5 text-[11px] leading-5 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>根视图</span>
            <span className="mono">{analysis.page.rootId ?? '未识别'}</span>
          </div>
          <div className="truncate" title={analysis.page.entryRel}>
            {basename(analysis.page.entryRel)}
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_TONE: Record<string, string> = {
  page: 'bg-foreground text-background',
  view: 'bg-sky-500/15 text-sky-700',
  data: 'bg-violet-500/15 text-violet-700',
  handler: 'bg-amber-500/15 text-amber-700',
  arrayItem: 'bg-muted text-muted-foreground',
  prop: 'bg-transparent text-muted-foreground',
};

const KIND_MARK: Record<string, string> = {
  page: 'P',
  view: 'V',
  data: 'D',
  handler: 'H',
  arrayItem: '#',
  prop: '·',
};

function TreeNode({
  item,
  depth,
  matched,
  expanded,
  onToggle,
}: {
  item: TreeItem;
  depth: number;
  matched: TreeSearch | null;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);

  // 搜索时只保留「命中节点 + 其祖先路径」，并自动展开。
  if (matched && !matched.expand.has(item.key)) return null;

  const node = item.node;
  const children = matched ? item.children.filter((c) => matched.expand.has(c.key)) : item.children;
  const isOpen = matched ? true : expanded.has(item.key);
  const selected = node !== null && selectedNodeId === node.id;

  return (
    <>
      <div
        onClick={() => {
          if (node && !item.synthetic) selectNode(node.id);
        }}
        onDoubleClick={() => {
          if (children.length) onToggle(item.key);
        }}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-1 rounded-[5px] py-[3px] pr-1.5 text-left transition-colors',
          selected ? 'bg-primary/12' : 'hover:bg-muted/70',
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
        title={node?.id ?? item.label}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (children.length) onToggle(item.key);
          }}
          className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center', children.length ? '' : 'opacity-0')}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>

        <span
          title={item.orphan ? '未被任何布局引用（孤悬节点）' : undefined}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold',
            item.synthetic
              ? 'bg-muted text-muted-foreground'
              : item.orphan
                ? 'bg-amber-500/15 text-amber-700'
                : (KIND_TONE[item.kind] ?? 'bg-muted'),
          )}
        >
          {item.orphan ? <Unlink className="h-3 w-3" /> : (KIND_MARK[item.kind] ?? '·')}
        </span>

        <span className={cn('truncate text-[12px]', selected && 'font-medium', item.orphan && 'text-muted-foreground')}>
          {item.label}
        </span>
        {node && !item.synthetic ? (
          <span className="mono shrink-0 text-[11px] text-muted-foreground/70">{node.name}</span>
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
          {selected && node?.anchor ? (
            <button
              type="button"
              className="mono hidden group-hover:flex items-center gap-0.5 text-[10.5px] text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                useStudio.getState().setInspectorTab('source');
              }}
              title={`跳转到 ${node.anchor.file}:${node.anchor.line}`}
            >
              <Crosshair className="h-3 w-3" />
              {basename(node.anchor.file)}:{node.anchor.line}
            </button>
          ) : null}
          {node?.degraded ? (
            <Badge tone="warn" title="该节点含动态写法，只读">
              只读
            </Badge>
          ) : null}
        </span>
      </div>

      {isOpen &&
        children.map((child) => (
          <TreeNode
            key={child.key}
            item={child}
            depth={depth + 1}
            matched={matched}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}