import { useEffect } from 'react';
import { AlertOctagon, Database, ServerCog } from 'lucide-react';
import { subscribeEvents } from '@/lib/api';
import { useStudio } from '@/store/studio';
import { Badge, Empty, Spinner } from '@/ui';
import { ConfirmDialog, DiffDialog, Toasts, UncoveredDialog } from '@/comp/DiffDialog';
import { CenterPane } from '@/views/CenterPane';
import { Inspector } from '@/views/Inspector';
import { ProjectBar } from '@/views/ProjectBar';
import { StructurePane } from '@/views/StructurePane';
import { basename } from '@/lib/utils';

export default function App() {
  const bootstrap = useStudio((s) => s.bootstrap);
  const serverError = useStudio((s) => s.serverError);
  const health = useStudio((s) => s.health);
  const project = useStudio((s) => s.project);
  const analysis = useStudio((s) => s.analysis);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const route = useStudio((s) => s.route);
  const history = useStudio((s) => s.history);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 服务端事件：文件被外部改动 / 计划落盘后，刷新分析与预览
  useEffect(() => {
    return subscribeEvents((event) => {
      const payload = event.payload as { projectId?: string; route?: string };
      const state = useStudio.getState();
      if (payload.projectId && state.projectId && payload.projectId !== state.projectId) return;
      if (event.type === 'files-changed') {
        void state.refreshAnalysis();
        state.reloadPreview();
        void state.loadHistory();
      }
      if (event.type === 'projects-changed') {
        void state.loadProjects();
      }
    });
  }, []);

  /**
   * 全局快捷键。
   *
   *   Ctrl+S        保存草稿（并阻止浏览器的"保存网页"）
   *   Ctrl+Z / Ctrl+Shift+Z  撤销 / 重做（走服务端编辑历史，不是浏览器撤销）
   *
   * 焦点在输入框里时不拦 Ctrl+Z：用户此刻要撤销的多半是自己刚敲的字。
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        const state = useStudio.getState();
        if (state.staged.length > 0) void state.saveAllStaged();
        else state.notice('info', '没有待保存的改动');
        return;
      }
      if (key !== 'z') return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (inField) return;
      e.preventDefault();
      const state = useStudio.getState();
      if (e.shiftKey) void state.redo();
      else void state.undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (serverError) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className="max-w-[520px] rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-destructive">
            <AlertOctagon className="h-4 w-4" />
            无法连接 Studio 服务
          </div>
          <pre className="mono mb-3 whitespace-pre-wrap text-[11.5px] text-muted-foreground">{serverError}</pre>
          <div className="text-[12px] leading-6 text-muted-foreground">
            请在仓库根目录执行：
            <pre className="mono mt-1 rounded-[6px] border border-border bg-surface px-2 py-1.5">
              go -C packages/studio/server run . -root .
            </pre>
            或直接用 <span className="mono">packages/studio/start.ps1</span> 一键起三个进程。
          </div>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Spinner />
          正在连接服务…
        </div>
      </div>
    );
  }

  const selected = analysis?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ProjectBar />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[268px] shrink-0 flex-col border-r border-border">
          <StructurePane />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <CenterPane />
        </main>

        <aside className="flex w-[392px] shrink-0 flex-col border-l border-border">
          <Inspector />
        </aside>
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-card px-3 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <ServerCog className="h-3 w-3" />
          服务 {health.ok ? '正常' : '异常'}
        </span>
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          analyzer {health.analyzer.error ? `异常（重启 ${health.analyzer.restarts} 次）` : '就绪'}
        </span>
        {health.analyzer.error ? <Badge tone="error">{health.analyzer.error.slice(0, 60)}</Badge> : null}
        <span className="mono">仓库 {health.repoRoot}</span>
        <span className="ml-auto flex items-center gap-3">
          {project ? <span className="mono">项目 {basename(project.rootPath)}</span> : null}
          {route ? <span className="mono">{route}</span> : null}
          {selected?.anchor ? (
            <span className="mono">
              选中 {selected.id} @ {basename(selected.anchor.file)}:{selected.anchor.line}
            </span>
          ) : null}
          <span>历史 {history.length}</span>
        </span>
      </footer>

      {!project && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Empty className="pointer-events-auto max-w-[360px] rounded-lg border border-border bg-card shadow-sm">
            添加一个项目开始
          </Empty>
        </div>
      )}

      <DiffDialog />
      <UncoveredDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
