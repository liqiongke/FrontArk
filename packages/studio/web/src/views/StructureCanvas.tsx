import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MousePointerClick, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Empty, Input } from '@/ui';
import { cn, summarize } from '@/lib/utils';
import * as api from '@/lib/api';
import { useStudio } from '@/store/studio';
import type { Op, SemanticNode } from '@/types';

/** 可以追加子项的容器（与 analyzer 的 templates.list 口径一致）。 */
const ADDABLE = new Set(['items', 'searchItems', 'summaryItems', 'toolList', 'formItems']);

/**
 * 结构画布：以「容器 + 子项」的视角编辑页面结构。
 * 与左侧结构树的区别是：这里每一行都带可执行动作（增 / 删 / 移）。
 */
export function StructureCanvas() {
  const analysis = useStudio((s) => s.analysis);
  const byId = useMemo(() => new Map((analysis?.nodes ?? []).map((n) => [n.id, n])), [analysis]);

  if (!analysis) return <Empty>先选择一个页面</Empty>;
  if (!analysis.page || analysis.page.level !== 'L1') {
    return <Empty>该页面不是框架页面（未识别到 ViewRoot 装配），结构画布不可用。</Empty>;
  }

  const roots = analysis.nodes.filter((n) => n.parentId === null);

  return (
    <div className="min-h-0 flex-1 overflow-auto scroll-thin px-2 py-2">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-[6px] border border-border bg-surface px-2 py-1.5">
        <span className="text-[11.5px] font-semibold text-muted-foreground">新增成员</span>
        <AddMemberButton memberKind="view" />
        <AddMemberButton memberKind="data" />
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5" />
          点任意行选中，右侧属性面板会跟随
        </span>
      </div>

      {roots.map((root) => (
        <CanvasRow key={root.id} node={root} depth={0} byId={byId} />
      ))}
    </div>
  );
}

function CanvasRow({
  node,
  depth,
  byId,
}: {
  node: SemanticNode;
  depth: number;
  byId: Map<string, SemanticNode>;
}) {
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);
  const selected = selectedNodeId === node.id;

  const children = node.children.map((id) => byId.get(id)).filter(Boolean) as SemanticNode[];
  const isArray = node.editability === 'array';
  const isObject = node.editability === 'object';
  const isArrayItem = node.kind === 'arrayItem';
  const parent = node.parentId ? byId.get(node.parentId) : null;
  const parentIsArray = parent?.editability === 'array';
  const containerKey = node.name;

  const tone =
    node.kind === 'view'
      ? 'border-sky-500/35 bg-sky-500/5'
      : node.kind === 'data'
        ? 'border-violet-500/35 bg-violet-500/5'
        : node.kind === 'handler'
          ? 'border-amber-500/35 bg-amber-500/5'
          : 'border-border bg-card';

  return (
    <div
      className={cn('mt-1 rounded-[6px] border', tone)}
      style={{ marginLeft: depth > 0 ? 12 : 0 }}
    >
      <div
        onClick={() => selectNode(node.id)}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 px-2 py-1.5 transition-colors',
          selected && 'bg-primary/8',
        )}
      >
        <span className="truncate text-[12.5px] font-medium">{node.label || node.name}</span>
        {node.declaredId ? <Badge tone="muted" className="mono">{node.declaredId}</Badge> : null}
        {node.viewType ? <Badge tone="info">{node.viewType.replace(/^VType\./, '')}</Badge> : null}
        <span className="mono shrink-0 text-[11px] text-muted-foreground/70">{node.name}</span>
        {!isArray && !isObject ? (
          <span className="mono shrink-0 truncate text-[11px] text-muted-foreground/80">{summarize(node)}</span>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground/80">{children.length} 项</span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {isArray && ADDABLE.has(containerKey) ? <AddItemButton containerKey={containerKey} arrayId={node.id} /> : null}
          {isObject ? <AddPropButton objectId={node.id} /> : null}
          {isArrayItem && parentIsArray ? (
            <>
              <MoveButton arrayId={parent!.id} from={node.index ?? 0} to={(node.index ?? 0) - 1} disabled={(node.index ?? 0) <= 0} />
              <MoveButton
                arrayId={parent!.id}
                from={node.index ?? 0}
                to={(node.index ?? 0) + 1}
                disabled={(node.index ?? 0) >= parent!.children.length - 1}
              />
              <DeleteButton arrayId={parent!.id} index={node.index ?? 0} label={node.label} />
            </>
          ) : null}
          {node.kind === 'view' || node.kind === 'data' ? (
            <DeleteMemberButton node={node} />
          ) : null}
        </span>
      </div>

      {children.length > 0 && (
        <div className="border-t border-border/60 px-1 pb-1">
          {children.map((child) => (
            <CanvasRow key={child.id} node={child} depth={Math.min(depth + 1, 6)} byId={byId} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 提交一个动作并处理结果（成功提示由 store 负责）。 */
function useAction() {
  const submit = useStudio((s) => s.submit);
  return async (op: Op, title: string) => {
    await submit(op, title);
  };
}

function MoveButton({ arrayId, from, to, disabled }: { arrayId: string; from: number; to: number; disabled: boolean }) {
  const act = useAction();
  const up = to < from;
  return (
    <Button
      size="icon"
      variant="ghost"
      disabled={disabled}
      title={up ? '上移' : '下移'}
      onClick={(e) => {
        e.stopPropagation();
        void act({ kind: 'move-array-item', target: arrayId, from, to }, up ? '上移子项' : '下移子项');
      }}
    >
      {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
    </Button>
  );
}

function DeleteButton({ arrayId, index, label }: { arrayId: string; index: number; label: string }) {
  const act = useAction();
  return (
    <Button
      size="icon"
      variant="ghost"
      title={`删除「${label}」`}
      className="text-destructive hover:bg-destructive/10"
      onClick={(e) => {
        e.stopPropagation();
        void act({ kind: 'delete-array-item', target: arrayId, index }, `删除子项「${label}」`);
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function DeleteMemberButton({ node }: { node: SemanticNode }) {
  const act = useAction();
  const memberKind = node.kind === 'view' ? 'view' : 'data';
  const member = node.memberName ?? node.name;
  return (
    <Button
      size="icon"
      variant="ghost"
      title={`删除成员 ${member}（被引用时会阻断）`}
      className="text-destructive hover:bg-destructive/10"
      onClick={(e) => {
        e.stopPropagation();
        void act({ kind: 'delete-member', memberKind, member }, `删除成员 ${member}`);
      }}
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}

function AddItemButton({ containerKey, arrayId }: { containerKey: string; arrayId: string }) {
  const projectId = useStudio((s) => s.projectId);
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; label: string; text: string }[]>([]);

  useEffect(() => {
    if (!open || !projectId) return;
    void api
      .fetchTemplates(projectId, containerKey)
      .then((res) => setCandidates(res.data.candidates))
      .catch(() => setCandidates([]));
  }, [open, projectId, containerKey]);

  return (
    <span className="relative">
      <Button
        size="icon"
        variant="ghost"
        title="追加子项"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <span
          className="absolute right-0 top-7 z-20 block w-[220px] rounded-[6px] border border-border bg-card p-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-1.5 py-1 text-[11px] text-muted-foreground">选择模板</div>
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full rounded-[5px] px-1.5 py-1 text-left text-[12px] hover:bg-muted"
              onClick={() => {
                setOpen(false);
                void act({ kind: 'insert-array-item', target: arrayId, text: c.text }, `新增${c.label}`);
              }}
            >
              {c.label}
            </button>
          ))}
          {candidates.length === 0 && <div className="px-1.5 py-1 text-[11.5px] text-muted-foreground">该容器没有预置模板</div>}
        </span>
      )}
    </span>
  );
}

function AddPropButton({ objectId }: { objectId: string }) {
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <Button
        size="icon"
        variant="ghost"
        title="新增属性"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Input className="h-6 w-[92px]" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
      <Input className="h-6 w-[120px] mono" placeholder="值表达式" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button
        size="sm"
        variant="default"
        onClick={() => {
          if (!/^[A-Za-z_$][\w$]*$/.test(key.trim())) return;
          const text = value.trim() || 'null';
          setOpen(false);
          setKey('');
          setValue('');
          void act({ kind: 'insert-prop', target: objectId, key: key.trim(), text }, `新增属性 ${key.trim()}`);
        }}
      >
        加入
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}

function AddMemberButton({ memberKind }: { memberKind: 'view' | 'data' }) {
  const projectId = useStudio((s) => s.projectId);
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');

  useEffect(() => {
    if (!open || !projectId) return;
    const memberName = name.trim() || (memberKind === 'view' ? 'newView' : 'newData');
    void api
      .fetchMemberTemplate(projectId, memberKind, memberName, memberName.replace(/^\w/, (c) => c.toLowerCase()))
      .then((res) => setTemplate(res.data.text))
      .catch(() => setTemplate(''));
  }, [open, projectId, memberKind, name]);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        {memberKind === 'view' ? '视图节点' : '数据节点'}
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Input className="h-6 w-[120px]" placeholder="成员名" value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        size="sm"
        variant="default"
        onClick={() => {
          const memberName = name.trim() || (memberKind === 'view' ? 'newView' : 'newData');
          setOpen(false);
          setName('');
          void act(
            { kind: 'insert-member', memberKind, text: template, memberName },
            `新增${memberKind === 'view' ? '视图' : '数据'}节点 ${memberName}`,
          );
        }}
      >
        加入
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
