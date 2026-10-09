import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Crosshair, ExternalLink, Info, Layers, PencilLine, ShieldAlert } from 'lucide-react';
import { Badge, Button, Empty, Input, Switch, Tabs } from '@/ui';
import { cn, relOf } from '@/lib/utils';
import { ancestorsOf, nodeById, useStudio, type InspectorTab } from '@/store/studio';
import { PropEditor } from '@/comp/PropEditor';
import { ThemePanel } from './ThemePanel';
import { SourcePanel } from './SourcePanel';

const KIND_LABEL: Record<string, string> = {
  page: '页面',
  view: '视图',
  data: '数据',
  handler: '处理器',
  prop: '属性',
  arrayItem: '数组项',
};

/** 页面识别级别 → 展示文案（L3 是转发壳，能力比 L2 更少）。 */
const PAGE_LEVEL_LABEL: Record<string, string> = {
  L1: '框架页面（可编辑）',
  L2: '普通 React 页面（只读）',
  L3: '入口为转发壳（仅源码导航）',
};

/** 右栏：属性 / 结构 / 数据 / 主题 / 源码。 */
export function Inspector() {
  const analysis = useStudio((s) => s.analysis);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const tab = useStudio((s) => s.inspectorTab);
  const setTab = useStudio((s) => s.setInspectorTab);
  const project = useStudio((s) => s.project);

  const node = nodeById(analysis, selectedNodeId);
  const issueCount = analysis?.issues.length ?? 0;

  const tabs: { value: InspectorTab; label: string; badge?: React.ReactNode }[] = [
    { value: 'property', label: '属性' },
    { value: 'structure', label: '结构' },
    { value: 'data', label: '数据' },
    { value: 'theme', label: '主题' },
    { value: 'source', label: '源码' },
  ];

  async function openExternally() {
    if (!node?.anchor) return;
    // 走 store 的统一入口：它会在真正落盘/起进程前弹一次确认
    await useStudio.getState().openExternally({
      file: node.anchor.file,
      line: node.anchor.line,
      column: node.anchor.column,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <Tabs value={tab} onChange={setTab} items={tabs} />

      {(tab === 'property' || tab === 'structure' || tab === 'data') && (
        <div className="shrink-0 border-b border-border px-2.5 py-2">
          {node ? (
            <>
              <div className="flex items-center gap-1.5">
                <Badge tone="info">{KIND_LABEL[node.kind] ?? node.kind}</Badge>
                <span className="truncate text-[13px] font-semibold" title={node.id}>
                  {node.label || node.name}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  title="在外编辑器中打开（定位到该行）"
                  onClick={() => void openExternally()}
                  disabled={!node.anchor}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="在源码面板中定位"
                  disabled={!node.anchor}
                  onClick={() => setTab('source')}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mono mt-1 break-all text-[10.5px] leading-4 text-muted-foreground/80">{node.id}</div>
              {node.anchor ? (
                <div className="mono mt-0.5 text-[10.5px] text-muted-foreground/70">
                  {project ? relOf(project.rootPath, node.anchor.file) : node.anchor.file}:{node.anchor.line}:{node.anchor.column}
                </div>
              ) : null}
              {node.description ? (
                <div className="mt-1 rounded-[5px] bg-muted/60 px-1.5 py-1 text-[11px] leading-4 text-muted-foreground">
                  {node.description}
                </div>
              ) : null}
              {node.degraded ? (
                <div className="mt-1 flex items-start gap-1.5 rounded-[5px] border border-amber-500/30 bg-amber-500/8 px-1.5 py-1 text-[11px] leading-4 text-amber-800">
                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  该节点所在容器含动态写法（对象展开 / 计算属性），已整体降级为只读，避免覆盖顺序判断错误。
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-[12px] text-muted-foreground">未选中节点。点左侧结构树、中栏结构画布，或直接在预览里点元素。</div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        {tab === 'property' &&
          (node ? (
            <PropEditor rootId={node.id} />
          ) : (
            <Empty>
              在左栏选中一个节点后，这里会列出它<strong>全部</strong>可编辑属性。
              <br />
              能改的用控件改，不能改的（函数、JSX、模板串）会标明只读并给出源码位置。
            </Empty>
          ))}

        {tab === 'structure' && <StructureTab node={node} />}
        {tab === 'data' && <DataTab />}
        {tab === 'theme' && <ThemePanel />}
        {tab === 'source' && <SourcePanel />}
      </div>

      <div className="shrink-0 border-t border-border px-2.5 py-1 text-[10.5px] text-muted-foreground">
        {analysis?.page ? (
          <>
            {PAGE_LEVEL_LABEL[analysis.page.level] ?? '未知类型'} · 节点 {analysis.nodes.length} · 诊断 {issueCount}
          </>
        ) : (
          '尚未解析页面'
        )}
      </div>
    </div>
  );
}

/** 结构页：节点身份、引用关系、语义重命名。 */
function StructureTab({ node }: { node: ReturnType<typeof nodeById> }) {
  const analysis = useStudio((s) => s.analysis);
  const project = useStudio((s) => s.project);
  const selectNode = useStudio((s) => s.selectNode);
  const submit = useStudio((s) => s.submit);

  const chain = useMemo(() => ancestorsOf(analysis, node?.id ?? null), [analysis, node?.id]);

  if (!node) return <Empty>未选中节点</Empty>;

  const page = analysis?.page;
  const isMember = node.kind === 'view' || node.kind === 'data';
  const memberName = node.memberName ?? node.name;
  const declaredId = node.declaredId ?? '';

  const refs = (analysis?.refs ?? []).filter((r) => {
    if (!declaredId) return false;
    return r.member === declaredId || r.member === memberName;
  });

  return (
    <div className="px-3 py-2">
      <Section title="定位">
        <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
          {chain.map((n, i) => (
            <span key={n.id} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
              <button
                type="button"
                className={cn('rounded-[4px] px-1 py-0.5 hover:bg-muted', n.id === node.id && 'bg-primary/10 font-medium text-primary')}
                onClick={() => selectNode(n.id)}
              >
                {n.label || n.name}
              </button>
            </span>
          ))}
        </div>
      </Section>

      <Section title="身份">
        <Kv k="节点 id" v={node.id} mono />
        <Kv k="成员名" v={memberName} mono />
        {declaredId ? <Kv k="声明 id" v={declaredId} mono /> : null}
        {node.viewType ? <Kv k="视图类型" v={node.viewType} mono /> : null}
        {node.containerKey ? <Kv k="所属容器" v={node.containerKey} mono /> : null}
        {node.index !== null && node.index !== undefined ? <Kv k="数组下标" v={String(node.index)} mono /> : null}
      </Section>

      {isMember && (
        <>
          <Section title="引用关系">
            {refs.length === 0 ? (
              <div className="text-[11.5px] text-muted-foreground">没有其它节点引用它。</div>
            ) : (
              <div className="space-y-1">
                {refs.map((ref, i) => (
                  <button
                    key={`${ref.from}-${i}`}
                    type="button"
                    onClick={() => selectNode(ref.from)}
                    className="flex w-full items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[11.5px] hover:bg-muted"
                  >
                    <Badge tone="muted">{ref.kind}</Badge>
                    <span className="mono truncate">{ref.from}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Section title="语义重命名">
            <RenameForm
              member={memberName}
              declaredId={declaredId}
              onSubmit={(from, to, syncId) =>
                void submit(
                  { kind: 'rename-member', memberKind: node.kind === 'view' ? 'view' : 'data', from, to, syncId },
                  `重命名 ${from} → ${to}`,
                )
              }
            />
          </Section>
        </>
      )}

      {page?.rootId && node.id === `view.${page.rootId}` ? (
        <Section title="页面根">
          <div className="text-[11.5px] text-muted-foreground">
            该节点是 <span className="mono">getRootId()</span> 的返回目标，预览会从它开始渲染。
          </div>
        </Section>
      ) : null}

      <Section title="增删与排序">
        <div className="flex items-start gap-1.5 text-[11.5px] leading-5 text-muted-foreground">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            切换到中栏的「结构画布」，每一行都有 <PencilLine className="inline h-3 w-3" /> 增 / 删 / 上移 / 下移 动作。
            删除被引用的成员会被服务端阻断。
          </div>
        </div>
      </Section>

      {node.anchor ? (
        <Section title="源码位置">
          <div className="mono break-all text-[11px] text-muted-foreground">
            {project ? relOf(project.rootPath, node.anchor.file) : node.anchor.file}
          </div>
          <div className="mono text-[11px] text-muted-foreground">
            行 {node.anchor.line}–{node.anchor.endLine}（字符 {node.anchor.start}–{node.anchor.end}）
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function RenameForm({
  member,
  declaredId,
  onSubmit,
}: {
  member: string;
  declaredId: string;
  onSubmit: (from: string, to: string, syncId: boolean) => void;
}) {
  const [to, setTo] = useState('');
  const [syncId, setSyncId] = useState(true);

  useEffect(() => {
    setTo('');
  }, [member]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input className="mono w-[110px]" value={member} readOnly />
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          className="mono"
          placeholder="newName"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && /^[A-Za-z_$][\w$]*$/.test(to.trim())) onSubmit(member, to.trim(), syncId);
          }}
        />
      </div>
      <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Switch checked={syncId} onChange={setSyncId} />
        同步更新声明 id（{declaredId || '—'} → {to.trim() || '…'}）
      </label>
      <Button
        size="sm"
        variant="default"
        disabled={!/^[A-Za-z_$][\w$]*$/.test(to.trim()) || to.trim() === member}
        onClick={() => onSubmit(member, to.trim(), syncId)}
      >
        <PencilLine className="h-3.5 w-3.5" />
        生成重命名计划
      </Button>
      <div className="flex items-start gap-1 text-[11px] leading-4 text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        会一并改写 this.x 引用、id 字面量、@Active 路径与 handler 里的字符串常量；
        无法静态确认的引用会列进「未覆盖清单」，需要人工复核。
      </div>
    </div>
  );
}

/** 数据页：数据节点与它们的请求配置。 */
function DataTab() {
  const analysis = useStudio((s) => s.analysis);
  const selectNode = useStudio((s) => s.selectNode);

  const nodes = useMemo(
    () => (analysis?.nodes ?? []).filter((n) => n.kind === 'data'),
    [analysis],
  );

  if (!analysis) return <Empty>尚未解析页面</Empty>;
  if (nodes.length === 0) return <Empty>该页面没有声明数据节点</Empty>;

  const refs = analysis.refs ?? [];

  return (
    <div className="px-3 py-2">
      {nodes.map((node) => {
        const declaredId = node.declaredId ?? '';
        const url = node.children
          .map((id) => analysis.nodes.find((n) => n.id === id))
          .find((n) => n?.name === 'url');
        const keyAttr = node.children
          .map((id) => analysis.nodes.find((n) => n.id === id))
          .find((n) => n?.name === 'keyAttr');
        const usedBy = refs.filter((r) => r.member === declaredId).length;

        return (
          <div key={node.id} className="mb-2 rounded-[6px] border border-border bg-surface px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <button type="button" className="text-[12.5px] font-semibold hover:underline" onClick={() => selectNode(node.id)}>
                {node.label || node.name}
              </button>
              <Badge tone="muted" className="mono">
                {declaredId || '未声明 id'}
              </Badge>
              <Badge tone={usedBy > 0 ? 'info' : 'muted'} className="ml-auto">
                被引用 {usedBy} 处
              </Badge>
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11.5px]">
              <div className="flex gap-2">
                <span className="w-14 shrink-0 text-muted-foreground">请求地址</span>
                <span className="mono truncate">{String(url?.value ?? '—')}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-14 shrink-0 text-muted-foreground">主键</span>
                <span className="mono truncate">{String(keyAttr?.value ?? '未设置')}</span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {node.children
                .map((id) => analysis.nodes.find((n) => n.id === id))
                .filter((n): n is NonNullable<typeof n> => Boolean(n))
                .map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => selectNode(child.id)}
                    className="rounded-[4px] border border-border px-1.5 py-[1px] text-[10.5px] text-muted-foreground hover:bg-muted"
                  >
                    {child.name}
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 py-0.5 text-[11.5px]">
      <span className="w-[64px] shrink-0 text-muted-foreground">{k}</span>
      <span className={cn('break-all', mono && 'mono')}>{v}</span>
    </div>
  );
}
