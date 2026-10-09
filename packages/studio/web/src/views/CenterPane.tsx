import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LayoutGrid, Maximize2, MonitorPlay, MousePointerClick, RefreshCw } from 'lucide-react';
import { Badge, Button, Empty, Spinner } from '@/ui';
import { cn } from '@/lib/utils';
import { useStudio } from '@/store/studio';
import { StructureCanvas } from './StructureCanvas';
import { IssuesPanel } from './IssuesPanel';

/**
 * 中栏：可在「真实渲染预览」与「结构画布」之间切换。
 *
 * 预览不是自己拼 UI，而是把目标页面的组件搬进 iframe 里跑；
 * 所以看到的排版、间距、交互与真实应用完全一致。
 */
export function CenterPane() {
  const project = useStudio((s) => s.project);
  const analysis = useStudio((s) => s.analysis);
  const route = useStudio((s) => s.route);
  const preview = useStudio((s) => s.preview);
  const previewTick = useStudio((s) => s.previewTick);
  const centerMode = useStudio((s) => s.centerMode);
  const setCenterMode = useStudio((s) => s.setCenterMode);
  const setIframe = useStudio((s) => s.setIframe);
  const reloadPreview = useStudio((s) => s.reloadPreview);
  const loadPreview = useStudio((s) => s.loadPreview);
  const postToPreview = useStudio((s) => s.postToPreview);
  const selectNode = useStudio((s) => s.selectNode);
  const notice = useStudio((s) => s.notice);

  const [booting, setBooting] = useState(true);

  const src = useMemo(() => {
    if (!project || !preview || !analysis?.page?.entry) return '';
    // 环境变量**不进 URL**（会留在浏览器历史与访问日志里），
    // 改由预览宿主挂起、通过 fa-want-env / fa-env 一对消息取走。
    const params = new URLSearchParams({
      page: analysis.page.entry,
      route,
      project: project.id,
      api: preview.apiBase,
      base: preview.mockBase ?? '',
      studio: window.location.origin,
      t: String(previewTick),
    });
    return `${preview.baseUrl}?${params.toString()}`;
  }, [project, preview, analysis?.page?.entry, route, previewTick]);

  // 换页面/换项目时重新进入加载态
  useEffect(() => {
    setBooting(true);
    const timer = window.setTimeout(() => setBooting(false), 2500);
    return () => window.clearTimeout(timer);
  }, [src]);

  // 与预览宿主通信：点选元素 / 报错 / 提示 / 索取环境变量
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // 只接受预览宿主的消息：Studio 里同时挂着目标工程的代码，
      // 不校验来源等于让任意嵌套页面冒充预览回传指令。
      const state = useStudio.getState();
      const previewOrigin = state.preview?.baseUrl ? new URL(state.preview.baseUrl).origin : null;
      if (previewOrigin && event.origin !== previewOrigin) return;

      const data = event.data as {
        type?: string;
        nodeId?: string;
        message?: string;
        title?: string;
        detail?: string;
        level?: string;
      };
      if (!data?.type?.startsWith('fa-')) return;

      if (data.type === 'fa-select' && data.nodeId) {
        selectNode(data.nodeId);
        state.setInspectorTab('property');
      }
      if (data.type === 'fa-mounted') setBooting(false);
      if (data.type === 'fa-want-env') {
        state.postToPreview({ type: 'fa-env', env: state.preview?.env ?? {} });
      }
      if (data.type === 'fa-notice') notice(data.level === 'warn' ? 'warn' : 'info', data.message ?? '');
      if (data.type === 'fa-error') notice('error', `${data.title}：${data.detail?.slice(0, 300) ?? ''}`);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [selectNode, notice]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Empty className="max-w-[420px]">
          <div className="mb-2 text-[13px] font-semibold text-foreground">还没有项目</div>
          点左上角「添加项目」，把目标工程的路径填进去（例如本仓库的 apps/demo），
          Studio 会扫描它的页面结构并在这里渲染出来。
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2">
        <div className="flex shrink-0 items-center rounded-[6px] border border-border p-0.5">
          <ModeButton active={centerMode === 'preview'} onClick={() => setCenterMode('preview')} icon={<MonitorPlay className="h-3.5 w-3.5" />} text="渲染预览" />
          <ModeButton active={centerMode === 'structure'} onClick={() => setCenterMode('structure')} icon={<LayoutGrid className="h-3.5 w-3.5" />} text="结构画布" />
        </div>

        <Badge tone="muted" className="mono shrink-0">
          {route}
        </Badge>

        {centerMode === 'preview' && (
          <span className="flex min-w-0 items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
            点表头 / 标签 / 按钮可直接选中对应节点
          </span>
        )}

        {centerMode === 'preview' && !preview?.mockBase && (
          <Badge tone="warn" className="shrink-0" title="目标工程的 VITE_BASE_URL 未探测到，预览里的请求可能拿不到数据">
            数据源未配置
          </Badge>
        )}
        {preview?.maskedEnvKeys && preview.maskedEnvKeys.length > 0 ? (
          <Badge tone="muted" className="shrink-0" title={`已掩码：${preview.maskedEnvKeys.join('、')}`}>
            {preview.maskedEnvKeys.length} 个敏感变量已掩码
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {centerMode === 'preview' && (
            <>
              <Button size="icon" variant="ghost" title="刷新预览" onClick={() => reloadPreview()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="在新窗口打开预览"
                disabled={!src}
                onClick={() => src && window.open(src, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="让预览重新建立元素索引"
                onClick={() => postToPreview({ type: 'fa-retag' })}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {centerMode === 'structure' ? (
        <StructureCanvas />
      ) : !preview?.ready ? (
        <Empty className="m-auto max-w-[440px]">
          <div className="mb-2 text-[13px] font-semibold text-foreground">预览宿主未启动</div>
          <div className="mb-3 leading-6">
            预览由独立的 Vite 进程提供（默认 127.0.0.1:7099）。请在另一个终端执行：
          </div>
          <pre className="mono mb-3 rounded-[6px] border border-border bg-surface px-2.5 py-2 text-left text-[11.5px]">
            pnpm --filter @jl/studio-preview dev
          </pre>
          <Button variant="outline" onClick={() => void loadPreview()}>
            重新检测
          </Button>
        </Empty>
      ) : (
        <div className="relative min-h-0 flex-1">
          {booting && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/70">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Spinner />
                正在装载页面…
              </div>
            </div>
          )}
          {src ? (
            <iframe
              key={src}
              ref={setIframe}
              src={src}
              title="页面预览"
              className="h-full w-full border-0 bg-background"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <Empty>该页面无法预览（未识别到可渲染的入口文件）</Empty>
          )}
        </div>
      )}

      <IssuesPanel />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  text,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] px-2 py-1 text-[12px] transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {text}
    </button>
  );
}
