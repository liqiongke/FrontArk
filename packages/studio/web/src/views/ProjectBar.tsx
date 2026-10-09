import { useEffect, useState } from 'react';
import { Check, FolderPlus, History, Plus, RefreshCw, Redo2, Save, Undo2, Wrench, X } from 'lucide-react';
import { Badge, Button, Input, Select, Switch } from '@/ui';
import { useStudio } from '@/store/studio';
import * as api from '@/lib/api';
import { relOf, snippet } from '@/lib/utils';
import type { PageCandidate } from '@/types';

/** 顶栏：项目、路由、编辑器、撤销重做、自动落盘开关。 */
export function ProjectBar() {
  const projects = useStudio((s) => s.projects);
  const project = useStudio((s) => s.project);
  const projectId = useStudio((s) => s.projectId);
  const pages = useStudio((s) => s.pages);
  const route = useStudio((s) => s.route);
  const preview = useStudio((s) => s.preview);
  const autoApply = useStudio((s) => s.autoApply);
  const editors = useStudio((s) => s.editors);
  const editorId = useStudio((s) => s.editorId);
  const customEditor = useStudio((s) => s.customEditor);
  const editorCommandSaved = useStudio((s) => s.editorCommandSaved);
  const setCustomEditor = useStudio((s) => s.setCustomEditor);
  const saveEditorCommand = useStudio((s) => s.saveEditorCommand);
  const health = useStudio((s) => s.health);
  const history = useStudio((s) => s.history);
  const staged = useStudio((s) => s.staged);
  const saveAllStaged = useStudio((s) => s.saveAllStaged);
  const discardStaged = useStudio((s) => s.discardStaged);
  const openProject = useStudio((s) => s.openProject);
  const openRoute = useStudio((s) => s.openRoute);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const loadPreview = useStudio((s) => s.loadPreview);
  const loadEditors = useStudio((s) => s.loadEditors);
  const setState = useStudio.setState;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const grouped = groupPages(pages);

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <div className="flex items-center gap-1.5 pr-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-primary text-[11px] font-bold text-primary-foreground">
            F
          </div>
          <span className="text-[13px] font-semibold tracking-wide">FrontArk Studio</span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* 项目 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">项目</span>
          <Select
            className="w-[150px]"
            value={projectId ?? ''}
            onChange={(e) => void openProject(e.target.value)}
          >
            {projects.length === 0 && <option value="">（未注册）</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)} title="添加项目（设置目标工程路径）">
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 路由 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">页面</span>
          <Select className="w-[190px]" value={route} onChange={(e) => void openRoute(e.target.value)}>
            {pages.length === 0 && <option value="">（无页面）</option>}
            {grouped.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((p) => (
                  <option key={p.route} value={p.route}>
                    {p.route}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>

        <div className="h-4 w-px bg-border" />

        <Button size="sm" variant="outline" onClick={() => void undo()} title="撤销上一条已应用的编辑">
          <Undo2 className="h-3.5 w-3.5" />
          撤销
        </Button>
        <Button size="sm" variant="outline" onClick={() => void redo()} title="重做">
          <Redo2 className="h-3.5 w-3.5" />
          重做
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setInspectorOpen(true)} title="编辑历史">
          <History className="h-3.5 w-3.5" />
          <span className="tabular-nums">{history.length}</span>
        </Button>

        {staged.length > 0 ? (
          <>
            <div className="h-4 w-px bg-border" />
            <Badge tone="warn" title="这些改动还只在草稿里，尚未写入源码">
              待保存 {staged.length}
            </Badge>
            <Button size="sm" variant="default" onClick={() => void saveAllStaged()} title="写入源码（Ctrl+S）">
              <Save className="h-3.5 w-3.5" />
              保存全部
            </Button>
            <Button size="icon" variant="ghost" onClick={discardStaged} title="丢弃全部未保存的改动">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground" title="开启后，「单文件单点」改动会直接落盘">
            <Switch
              checked={autoApply}
              onChange={(v) => {
                setState({ autoApply: v });
                localStorage.setItem('studio.autoApply', v ? '1' : '0');
              }}
            />
            改完即存
          </label>

          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">编辑器</span>
            <Select
              className="w-[132px]"
              value={editorId}
              onChange={(e) => {
                setState({ editorId: e.target.value });
                localStorage.setItem('studio.editor', e.target.value);
              }}
              onFocus={() => {
                if (editors.length === 0) void loadEditors(true);
              }}
            >
              {editors.length === 0 && <option value="">（未探测到）</option>}
              {editors.map((e) => (
                <option key={e.id} value={e.id} title={e.path}>
                  {e.label}
                </option>
              ))}
              <option value="__custom__">自定义命令…</option>
            </Select>
            <Button size="icon" variant="ghost" onClick={() => void loadEditors(true)} title="重新探测本机编辑器（含各种 VS Code 改造版）">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {editorId === '__custom__' && (
              <>
                <Input
                  className="mono w-[230px]"
                  placeholder="myide --goto {file}:{line}:{column}"
                  value={customEditor}
                  onChange={(e) => setCustomEditor(e.target.value)}
                  title="占位符：{file} {line} {column} {project}。命令保存在服务端配置里，不进请求体。"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !editorCommandSaved) void saveEditorCommand(customEditor);
                  }}
                />
                <Button
                  size="sm"
                  variant={editorCommandSaved ? 'ghost' : 'default'}
                  disabled={editorCommandSaved}
                  onClick={() => void saveEditorCommand(customEditor)}
                  title="保存到服务端配置（仅本机可写）"
                >
                  {editorCommandSaved ? <Check className="h-3.5 w-3.5 opacity-50" /> : <Save className="h-3.5 w-3.5" />}
                  保存
                </Button>
              </>
            )}
          </div>

          {health?.authNeeded && (
            <div className="flex items-center gap-1.5" title="服务端要求 Token；因为 EventSource 无法设置请求头，SSE 走 query 传递">
              <span className="text-[11.5px] text-muted-foreground">Token</span>
              <Input
                className="mono w-[120px]"
                type="password"
                placeholder="访问 Token"
                defaultValue={api.getToken()}
                onChange={(e) => api.setToken(e.target.value)}
                onBlur={() => window.location.reload()}
              />
            </div>
          )}

          <div className="flex items-center gap-1.5" title={preview?.hint}>
            <span className={`h-2 w-2 rounded-full ${preview?.ready ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            <span className="text-[11.5px] text-muted-foreground">预览 {preview?.ready ? '就绪' : '未启动'}</span>
            <Button size="icon" variant="ghost" onClick={() => void loadPreview()} title="重新检测预览宿主">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {project && project.warnings.length > 0 && (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-500/8 px-3 py-1.5 text-[11.5px] text-amber-800">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>{project.warnings.join('；')}</div>
        </div>
      )}

      {dialogOpen && <AddProjectDialog onClose={() => setDialogOpen(false)} />}
      {inspectorOpen && <HistoryDialog onClose={() => setInspectorOpen(false)} />}
    </>
  );
}

function groupPages(pages: PageCandidate[]): [string, PageCandidate[]][] {
  const map = new Map<string, PageCandidate[]>();
  for (const page of pages) {
    const seg = page.route.split('/').filter(Boolean);
    const group = seg.length > 1 ? `/${seg[0]}` : '/';
    const list = map.get(group) ?? [];
    list.push(page);
    map.set(group, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** 添加项目：设置目标工程路径。 */
function AddProjectDialog({ onClose }: { onClose: () => void }) {
  const health = useStudio((s) => s.health);
  const addProject = useStudio((s) => s.addProject);
  const notice = useStudio((s) => s.notice);
  const [rootPath, setRootPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<string[] | null>(null);

  const suggestion = health ? `${health.repoRoot}/apps/demo` : '';

  useEffect(() => {
    if (suggestion && !rootPath) setRootPath(suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  async function submit() {
    if (!rootPath.trim()) {
      notice('warn', '请填写目标工程目录');
      return;
    }
    setBusy(true);
    setProbe(null);
    try {
      await addProject(rootPath.trim().replace(/\/+$/, ''));
      onClose();
    } catch (err) {
      const lines = [
        `注册失败：${(err as Error).message}`,
        '',
        '要点：',
        '· 该目录下必须有 package.json',
        '· 目前只支持本仓库内、且使用了 @jl/framework 的工程',
        '· 路径建议使用绝对路径（Windows 可用正斜杠）',
      ];
      setProbe(lines);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6">
      <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Plus className="h-4 w-4" />
            添加项目
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <div className="mb-1 text-[12px] text-muted-foreground">目标工程路径</div>
            <Input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="d:/workspace/web/apps/demo"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
            {suggestion && (
              <button
                type="button"
                className="mt-1 text-[11.5px] text-primary hover:underline"
                onClick={() => setRootPath(suggestion)}
              >
                用当前仓库的示例工程：{suggestion}
              </button>
            )}
          </div>
          <div className="rounded-[6px] border border-border bg-surface px-2.5 py-2 text-[11.5px] leading-5 text-muted-foreground">
            注册后 Studio 会静态扫描该工程：识别 <span className="mono">src/pages</span> 下的页面、
            从 <span className="mono">tsconfig</span> 读取别名、合并 <span className="mono">.env</span> 作为预览数据源。
            <br />
            注册只会把路径写进 Studio 自己的配置目录，<strong>不会改动目标工程的任何文件</strong>。
          </div>
          {probe && (
            <pre className="mono max-h-40 overflow-auto scroll-thin whitespace-pre-wrap rounded-[6px] border border-destructive/30 bg-destructive/8 px-2.5 py-2 text-[11.5px] text-destructive">
              {probe.join('\n')}
            </pre>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="default" disabled={busy} onClick={() => void submit()}>
            {busy ? '探测中…' : '注册并打开'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 编辑历史。 */
function HistoryDialog({ onClose }: { onClose: () => void }) {
  const history = useStudio((s) => s.history);
  const openProject = useStudio((s) => s.openProject);
  const projectId = useStudio((s) => s.projectId);
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6">
      <div className="flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-[13px] font-semibold">编辑历史（最近 {history.length} 条）</div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto scroll-thin divide-y divide-border">
          {history.length === 0 && <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">还没有编辑记录</div>}
          {history.map((rec) => (
            <div key={rec.id} className="px-4 py-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-medium">{rec.title}</div>
                <div className="shrink-0 text-[11px] text-muted-foreground">{rec.at.replace('T', ' ').slice(0, 19)}</div>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge tone="muted">{rec.route}</Badge>
                <span>{rec.files} 个文件</span>
                <button type="button" className="text-primary hover:underline" onClick={() => setDetail(detail === rec.id ? null : rec.id)}>
                  {detail === rec.id ? '收起' : '查看详情'}
                </button>
              </div>
              {detail === rec.id && <HistoryDetail projectId={projectId} recordId={rec.id} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-border bg-muted/40 px-4 py-2.5">
          <Button variant="ghost" onClick={() => void openProject(projectId!)}>
            重新载入当前项目
          </Button>
          <Button variant="default" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 单条编辑记录的详情：这次到底改了哪几处（before/after 片段）。
 *
 * 历史接口本来就带着 impacts，之前这里却是"再拉一次列表然后打印一句请用撤销"，
 * 等于给了个假详情 —— 用户点开是想看改了什么，不是想知道怎么撤销。
 */
function HistoryDetail({ projectId, recordId }: { projectId: string | null; recordId: string }) {
  const root = useStudio((s) => s.project?.rootPath ?? '');
  const [impacts, setImpacts] = useState<HistoryImpact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void api
      .fetchHistory(projectId)
      .then((res) => {
        if (cancelled) return;
        const rec = res.data.history.find((h) => h.id === recordId);
        setImpacts(rec?.impacts ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, recordId]);

  if (error) return <div className="mt-1 text-[11px] text-destructive">{error}</div>;
  if (!impacts) return <div className="mt-1 text-[11px] text-muted-foreground">加载改动明细…</div>;
  if (impacts.length === 0) {
    return (
      <div className="mt-1 text-[11px] text-muted-foreground">
        该记录没有可展示的明细（服务重启前写入的历史只保留了元数据）。
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-1">
      {impacts.map((im, i) => (
        <div key={`${im.file}-${i}`} className="rounded-[5px] border border-border bg-surface px-2 py-1">
          <div className="mono truncate text-[10.5px] text-muted-foreground">
            {im.label ? `${im.label} · ` : ''}
            {relOf(root, im.file)}
          </div>
          <div className="mono break-all text-[11px]">
            <span className="text-destructive/90">{snippet(im.before, 120) || '(空)'}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="text-emerald-700">{snippet(im.after, 120) || '(删除)'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface HistoryImpact {
  file: string;
  before: string;
  after: string;
  label?: string;
}
