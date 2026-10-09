import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Crosshair, FileCode2, Search } from 'lucide-react';

import { Badge, Empty, Input, Spinner } from '@/ui';
import { basename, cn } from '@/lib/utils';
import { useStudio } from '@/store/studio';
import type { SemanticNode } from '@/types';

/** 只读页面的级别提示：L2 与 L3 的能力不同，别都只说"只读"。 */
const PAGE_LEVEL_HINT: Record<string, string> = {
  L2: '普通 React 页面：只读浏览 + 源码跳转',
  L3: '入口是转发壳（重导出/动态装配）：仅源码导航',
};

/** 左栏：页面清单 + 当前页面的语义结构树。 */
export function StructurePane() {
  const pages = useStudio((s) => s.pages);
  const route = useStudio((s) => s.route);
  const analysis = useStudio((s) => s.analysis);
  const loading = useStudio((s) => s.loading);
  const openRoute = useStudio((s) => s.openRoute);

  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 换页面时重置展开状态，并把结构的主体默认展开
  useEffect(() => {
    if (!analysis) return;
    const seed = new Set<string>(['page']);
    for (const node of analysis.nodes) {
      if (node.kind === 'view' || node.kind === 'data' || node.kind === 'handler') seed.add(node.id);
    }
    setExpanded(seed);
  }, [analysis]);

  const byId = useMemo(() => new Map((analysis?.nodes ?? []).map((n) => [n.id, n])), [analysis]);

  const matched = useMemo(() => {
    if (!analysis) return null;
    const kw = keyword.trim().toLowerCase();
    if (!kw) return null;
    const hits = new Set<string>();
    for (const node of analysis.nodes) {
      if (
        node.id.toLowerCase().includes(kw) ||
        node.label.toLowerCase().includes(kw) ||
        String(node.value ?? '').toLowerCase().includes(kw)
      ) {
        hits.add(node.id);
        let parent = node.parentId;
        while (parent) {
          hits.add(parent);
          parent = byId.get(parent)?.parentId ?? null;
        }
      }
    }
    return hits;
  }, [analysis, keyword, byId]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof pages>();
    for (const page of pages) {
      const seg = page.route.split('/').filter(Boolean);
      const group = seg.length > 1 ? `/${seg[0]}` : '/';
      map.set(group, [...(map.get(group) ?? []), page]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pages]);

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
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[12px] transition-colors',
                    page.route === route ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                  )}
                >
                  <span className="truncate">{page.route === '/' ? '(根)' : page.route}</span>
                  {page.level && page.level !== 'L1' ? (
                    <span
                      className="ml-auto shrink-0 text-[10px] text-muted-foreground/70"
                      title={PAGE_LEVEL_HINT[page.level]}
                    >
                      {page.level}
                    </span>
                  ) : null}
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
        {loading && <Spinner className="ml-auto" />}
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
        {analysis &&
          analysis.nodes
            .filter((n) => n.parentId === null)
            .map((root) => (
              <TreeNode
                key={root.id}
                node={root}
                depth={0}
                byId={byId}
                matched={matched}
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
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
  node,
  depth,
  byId,
  matched,
  expanded,
  onToggle,
}: {
  node: SemanticNode;
  depth: number;
  byId: Map<string, SemanticNode>;
  matched: Set<string> | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);

  if (matched && !matched.has(node.id)) return null;

  const children = node.children.filter((id) => {
    const child = byId.get(id);
    if (!child) return false;
    if (matched && !matched.has(child.id)) return false;
    return true;
  });
  const isOpen = expanded.has(node.id) || Boolean(matched);
  const selected = selectedNodeId === node.id;

  return (
    <>
      <div
        onClick={() => selectNode(node.id)}
        onDoubleClick={() => onToggle(node.id)}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-1 rounded-[5px] py-[3px] pr-1.5 text-left transition-colors',
          selected ? 'bg-primary/12' : 'hover:bg-muted/70',
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
        title={node.id}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (children.length) onToggle(node.id);
          }}
          className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center', children.length ? '' : 'opacity-0')}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>

        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold',
            KIND_TONE[node.kind] ?? 'bg-muted',
          )}
        >
          {KIND_MARK[node.kind] ?? '·'}
        </span>

        <span className={cn('truncate text-[12px]', selected && 'font-medium')}>
          {node.label || node.name}
        </span>
        <span className="mono shrink-0 text-[11px] text-muted-foreground/70">{node.name}</span>

        <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
          {selected && node.anchor ? (
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
          {node.degraded ? <Badge tone="warn" title="该节点含动态写法，只读">只读</Badge> : null}
        </span>
      </div>

      {isOpen &&
        children.map((id) => {
          const child = byId.get(id);
          if (!child) return null;
          return (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              byId={byId}
              matched={matched}
              expanded={expanded}
              onToggle={onToggle}
            />
          );
        })}
    </>
  );
}
