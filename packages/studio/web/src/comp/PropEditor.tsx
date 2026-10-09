import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Crosshair, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Select, Switch, Textarea } from '@/ui';
import { cn, relOf, snippet } from '@/lib/utils';
import { useStudio } from '@/store/studio';
import type { Op, SemanticNode } from '@/types';

// 稳定的空对象：避免选择器每次返回新引用导致的无意义重渲染
const EMPTY_LABELS: Record<string, string> = {};
const EMPTY_ENUMS: Record<string, never> = {};
const EMPTY_NODES: SemanticNode[] = [];

/**
 * 属性编辑器：把语义节点渲染成可编辑控件。
 *
 * 控件选择完全由 analyzer 给出的 editability 决定 —— 前端不做任何猜测，
 * 因此「能编辑」与「只读」的边界与服务端生成编辑计划的能力严格一致。
 */
export function PropEditor({ rootId }: { rootId: string }) {
  const analysis = useStudio((s) => s.analysis);
  const byId = useMemo(() => new Map((analysis?.nodes ?? []).map((n) => [n.id, n])), [analysis]);
  const root = byId.get(rootId);
  if (!root) return null;

  if (root.editability === 'object' || root.editability === 'array') {
    return <ContainerEditor node={root} byId={byId} />;
  }
  return (
    <div className="px-3 py-2">
      <Control node={root} />
    </div>
  );
}

function ContainerEditor({ node, byId }: { node: SemanticNode; byId: Map<string, SemanticNode> }) {
  const children = node.children.map((id) => byId.get(id)).filter(Boolean) as SemanticNode[];
  if (children.length === 0) {
    return (
      <div className="px-3 py-3 text-[12px] text-muted-foreground">
        空{node.editability === 'array' ? '数组' : '对象'}。可在中栏「结构画布」里追加子项。
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/60">
      {children.map((child) => (
        <Row key={child.id} node={child} byId={byId} depth={0} />
      ))}
    </div>
  );
}

function Row({ node, byId, depth }: { node: SemanticNode; byId: Map<string, SemanticNode>; depth: number }) {
  const labels = useStudio((s) => s.analysis?.labels) ?? EMPTY_LABELS;
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);
  const staged = useStudio((s) => s.staged);
  const isContainer = node.editability === 'object' || node.editability === 'array';
  const [open, setOpen] = useState(depth === 0);
  const selected = selectedNodeId === node.id;
  // 该节点是否有暂存未落盘的改动（草稿去重键以 target 结尾，正是节点 id）
  const dirty = staged.some((entry) => 'target' in entry.op && entry.op.target === node.id);

  const label = labels[node.name] ?? node.label ?? node.name;

  return (
    <div className={cn(selected && 'bg-primary/6')}>
      <div
        className="flex items-start gap-1.5 px-2 py-1.5 hover:bg-muted/40"
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => selectNode(node.id)}
      >
        <span
          className={cn('mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center', isContainer ? '' : 'opacity-0')}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>

        <div className="w-[104px] shrink-0 pt-[3px]">
          <div className="truncate text-[12px]" title={node.id}>
            {label}
          </div>
          <div className="mono truncate text-[10.5px] text-muted-foreground/70">{node.name}</div>
        </div>

        <div className="min-w-0 flex-1">
          {isContainer ? (
            <div className="pt-[3px] text-[11.5px] text-muted-foreground">
              {node.editability === 'array' ? '数组' : '对象'} · {node.children.length} 项
              {node.degraded ? <Badge tone="warn" className="ml-2">含动态写法，只读</Badge> : null}
            </div>
          ) : (
            <Control node={node} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 pt-[2px]">
          {dirty ? (
            <Badge tone="warn" title="已改动但尚未写入源码：点顶栏「保存」或按 Ctrl+S">
              未保存
            </Badge>
          ) : null}
          <ReadonlyBadge node={node} />
          {node.anchor ? <LocateButton node={node} /> : null}
          {node.kind === 'arrayItem' || node.kind === 'prop' ? <DeleteNodeButton node={node} /> : null}
        </div>
      </div>

      {isContainer && open && node.children.length > 0 && (
        <div className="divide-y divide-border/40">
          {node.children.map((id) => {
            const child = byId.get(id);
            if (!child) return null;
            return <Row key={child.id} node={child} byId={byId} depth={depth + 1} />;
          })}
        </div>
      )}
    </div>
  );
}

function ReadonlyBadge({ node }: { node: SemanticNode }) {
  if (node.editability === 'object' || node.editability === 'array') return null;
  if (node.editability === 'expr' || node.editability === 'sourceOnly') {
    return (
      <Badge tone="muted" title="该形态无法静态确定语义，只读；请用外部 IDE 修改">
        只读
      </Badge>
    );
  }
  if (node.editability === 'moduleRef') {
    return (
      <Badge tone="muted" title="模块级常量被多处引用，首版只提供跳转">
        常量
      </Badge>
    );
  }
  return null;
}

/** 定位到源码：切到「源码」Tab 并滚到该节点的锚点行。 */
function LocateButton({ node }: { node: SemanticNode }) {
  const project = useStudio((s) => s.project);
  const selectNode = useStudio((s) => s.selectNode);
  const setInspectorTab = useStudio((s) => s.setInspectorTab);
  const anchor = node.anchor;
  if (!anchor) return null;
  const rel = project ? relOf(project.rootPath, anchor.file) : anchor.file;
  return (
    <Button
      size="icon"
      variant="ghost"
      title={`定位到源码 ${rel}:${anchor.line}`}
      onClick={(e) => {
        e.stopPropagation();
        selectNode(node.id);
        setInspectorTab('source');
      }}
    >
      <Crosshair className="h-3.5 w-3.5" />
    </Button>
  );
}

function DeleteNodeButton({ node }: { node: SemanticNode }) {
  const submit = useStudio((s) => s.submit);
  const nodes = useStudio((s) => s.analysis?.nodes) ?? EMPTY_NODES;
  const parent = useMemo(() => {
    if (!node.parentId) return null;
    return nodes.find((n) => n.id === node.parentId) ?? null;
  }, [nodes, node.parentId]);

  return (
    <Button
      size="icon"
      variant="ghost"
      className="text-destructive hover:bg-destructive/10"
      title="删除该项"
      onClick={(e) => {
        e.stopPropagation();
        const op: Op =
          node.kind === 'arrayItem' && parent
            ? { kind: 'delete-array-item', target: parent.id, index: node.index ?? 0 }
            : { kind: 'delete-prop', target: node.id };
        void submit(op, `删除 ${node.label || node.name}`);
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

/** 单个节点的值控件。 */
function Control({ node }: { node: SemanticNode }) {
  switch (node.editability) {
    case 'literal':
      return <LiteralControl node={node} />;
    case 'enumRef':
      return <EnumControl node={node} />;
    case 'memberRef':
      return <MemberControl node={node} />;
    case 'handlerRef':
      return <HandlerControl node={node} />;
    case 'callRef':
      return <ActiveBindingControl node={node} />;
    default:
      return <ReadonlyCode node={node} />;
  }
}

/**
 * 值类改动的入口：只**暂存**，不落盘。
 *
 * 改一个列宽就写一次磁盘既没有回头路，也会把 git diff 打成一堆碎片。
 * 统一进草稿区（顶栏显示待保存数量），由用户点「保存」或 Ctrl+S 再落盘。
 * 结构性改动（删除 / 新增 / 重排 / 重命名）风险更高，仍走「生成计划 → 看 diff」。
 */
function useCommit(node: SemanticNode) {
  const stageOp = useStudio((s) => s.stageOp);
  return (op: Op, title: string) => stageOp(op, title, node.label || node.name);
}

function LiteralControl({ node }: { node: SemanticNode }) {
  const commit = useCommit(node);
  const [value, setValue] = useState(() => stringify(node.value));

  useEffect(() => {
    setValue(stringify(node.value));
  }, [node.id, node.value]);

  if (node.valueType === 'boolean') {
    return (
      <div className="flex items-center gap-2 pt-[2px]">
        <Switch
          checked={Boolean(node.value)}
          onChange={(v) => commit({ kind: 'set', target: node.id, value: v }, `修改 ${node.name}`)}
        />
        <span className="text-[11.5px] text-muted-foreground">{node.value ? 'true' : 'false'}</span>
      </div>
    );
  }

  if (node.valueType === 'null') {
    return <div className="pt-[3px] text-[11.5px] text-muted-foreground">null</div>;
  }

  const isNumber = node.valueType === 'number';

  return (
    <Input
      className={cn(isNumber && 'text-right tabular-nums')}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') setValue(stringify(node.value));
      }}
      onBlur={() => {
        const current = stringify(node.value);
        if (value === current) return;
        commit(
          { kind: 'set', target: node.id, value: isNumber ? Number(value) : value },
          `修改 ${node.label || node.name}`,
        );
      }}
    />
  );
}

function EnumControl({ node }: { node: SemanticNode }) {
  const commit = useCommit(node);
  const enums = useStudio((s) => s.analysis?.enums) ?? EMPTY_ENUMS;
  const def = node.enumObject ? enums[node.enumObject] : undefined;
  const current = `${node.enumObject}.${node.enumMember}`;

  if (!def) {
    return (
      <div className="flex items-center gap-2">
        <Input className="mono" value={current} readOnly />
        <Badge tone="warn">未解析到 {node.enumObject} 枚举定义</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        className="mono"
        value={node.enumMember ?? ''}
        onChange={(e) =>
          commit({ kind: 'set-ref', target: node.id, ref: `${node.enumObject}.${e.target.value}` }, `修改 ${node.name}`)
        }
      >
        {def.members.map((m) => (
          <option key={m.name} value={m.name} title={m.description}>
            {m.name}（{m.label}）
          </option>
        ))}
      </Select>
      {def.members.find((m) => m.name === node.enumMember)?.label ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {def.members.find((m) => m.name === node.enumMember)?.label}
        </span>
      ) : null}
    </div>
  );
}

function MemberControl({ node }: { node: SemanticNode }) {
  const commit = useCommit(node);
  const page = useStudio((s) => s.analysis?.page);
  const refKind = node.ref?.kind;

  const options = useMemo(() => {
    if (!page) return [];
    if (refKind === 'data') {
      return Object.keys(page.dataMembers).map((m) => ({
        value: `this.data.${m}.id`,
        label: `${m} → ${page.dataMembers[m].id ?? '（无 id）'}`,
      }));
    }
    if (refKind === 'view') {
      return Object.keys(page.viewMembers).map((m) => ({
        value: `this.${m}.id`,
        label: `${m} → ${page.viewMembers[m].id ?? '（无 id）'}`,
      }));
    }
    return [];
  }, [page, refKind]);

  if (options.length === 0) {
    return <RawExprControl node={node} />;
  }

  const current = node.expr ?? options[0].value;
  return (
    <Select
      className="mono"
      value={current}
      onChange={(e) => commit({ kind: 'set-ref', target: node.id, ref: e.target.value }, `修改 ${node.name}`)}
    >
      {!options.some((o) => o.value === current) && <option value={current}>{current}（当前）</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function HandlerControl({ node }: { node: SemanticNode }) {
  const commit = useCommit(node);
  const methods = useStudio((s) => s.analysis?.page?.handlerMethods ?? []);
  const current = node.handlerMethod ?? '';

  return (
    <Select
      className="mono"
      value={current}
      onChange={(e) => commit({ kind: 'set-ref', target: node.id, ref: `this.handler.${e.target.value}` }, `修改 ${node.name}`)}
    >
      {!methods.includes(current) && <option value={current}>{current}（未解析到，可能在基类）</option>}
      {methods.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </Select>
  );
}

function ActiveBindingControl({ node }: { node: SemanticNode }) {
  const commit = useCommit(node);
  const page = useStudio((s) => s.analysis?.page);
  const members = Object.keys(page?.viewMembers ?? {});
  const current = node.ref?.member ?? '';

  return (
    <div className="space-y-1">
      <Select
        className="mono"
        value={current}
        onChange={(e) =>
          commit(
            { kind: 'set-ref', target: node.id, ref: `DataBase.active(this.${e.target.value}.id)` },
            `修改 ${node.name}`,
          )
        }
      >
        {!members.includes(current) && <option value={current}>{current || '（未识别）'}</option>}
        {members.map((m) => (
          <option key={m} value={m}>
            焦点行绑定 → {m}（{page?.viewMembers[m].id}）
          </option>
        ))}
      </Select>
      <div className="text-[11px] text-muted-foreground">
        @Active 引用必须指向<strong>视图 id</strong>，不是数据节点 id。
      </div>
    </div>
  );
}

function RawExprControl({ node }: { node: SemanticNode }) {
  const commit = useCommit(node);
  const [value, setValue] = useState(node.expr ?? '');

  useEffect(() => {
    setValue(node.expr ?? '');
  }, [node.id, node.expr]);

  return (
    <Textarea
      rows={2}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (next === (node.expr ?? '')) return;
        if (!next) {
          useStudio.getState().notice('warn', '表达式不能为空');
          setValue(node.expr ?? '');
          return;
        }
        commit({ kind: 'set-ref', target: node.id, ref: next }, `修改 ${node.name}`);
      }}
    />
  );
}

function ReadonlyCode({ node }: { node: SemanticNode }) {
  const project = useStudio((s) => s.project);
  const setInspectorTab = useStudio((s) => s.setInspectorTab);

  return (
    <div className="space-y-1">
      <div className="mono max-h-24 overflow-auto scroll-thin break-all rounded-[5px] border border-border bg-surface px-2 py-1 text-[11.5px] text-muted-foreground">
        {snippet(node.expr, 400) || '（无表达式）'}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>该形态无法结构化编辑</span>
        {node.anchor ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
            onClick={() => setInspectorTab('source')}
          >
            <Crosshair className="h-3 w-3" />
            {project ? relOf(project.rootPath, node.anchor.file) : node.anchor.file}:{node.anchor.line}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}
