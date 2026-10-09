import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileCode2, RefreshCw } from 'lucide-react';
import { Badge, Button, Empty, Select, Spinner } from '@/ui';
import { basename, cn, relOf } from '@/lib/utils';
import * as api from '@/lib/api';
import { nodeById, useStudio } from '@/store/studio';

/**
 * 只读源码查看器：点结构树里的「⌖」就在这里定位到对应行。
 * 刻意不做成第二个编辑器 —— 真正的编辑交给外部 IDE（顶栏可一键唤起）。
 */
export function SourcePanel() {
  const project = useStudio((s) => s.project);
  const analysis = useStudio((s) => s.analysis);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const editorId = useStudio((s) => s.editorId);
  const customEditor = useStudio((s) => s.customEditor);
  const notice = useStudio((s) => s.notice);

  const node = nodeById(analysis, selectedNodeId);
  const files = useMemo(() => {
    if (!analysis?.page) return [];
    const list = analysis.page.files.map((f) => ({ file: f.file, rel: f.rel }));
    const entry = { file: analysis.page.entry, rel: analysis.page.entryRel };
    if (!list.some((f) => f.file === entry.file)) list.unshift(entry);
    return list;
  }, [analysis]);

  const [file, setFile] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 选中节点变化时，自动切到它所在的文件并定位
  useEffect(() => {
    if (!node?.anchor?.file) return;
    setFile(node.anchor.file);
    setHighlight(node.anchor.line);
  }, [node?.id, node?.anchor?.file, node?.anchor?.line]);

  useEffect(() => {
    if (!file) {
      setFile(files[0]?.file ?? '');
    }
  }, [files, file]);

  useEffect(() => {
    if (!file || !project) return;
    let cancelled = false;
    setBusy(true);
    void api
      .fetchSource(project.id, file)
      .then((res) => {
        if (cancelled) return;
        setText(res.data.text);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setText(`// 读取失败：${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, project]);

  // 定位到目标行
  useEffect(() => {
    if (!highlight || !scrollRef.current) return;
    const target = scrollRef.current.querySelector(`[data-line="${highlight}"]`);
    if (target) target.scrollIntoView({ block: 'center' });
  }, [highlight, text]);

  async function openExternally() {
    if (!project || !file) return;
    try {
      const res = await api.openInEditor({
        projectId: project.id,
        file,
        line: highlight ?? 1,
        column: 1,
        editor: editorId,
        command: customEditor || undefined,
      });
      notice('success', `${res.data.message}：${res.data.command}`);
    } catch (err) {
      notice('error', (err as Error).message);
    }
  }

  if (!project) return <Empty>先选择一个项目</Empty>;
  if (files.length === 0) return <Empty>当前页面没有可查看的源码文件</Empty>;

  const lines = text.split('\n');
  const root = project.rootPath;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Select value={file} onChange={(e) => setFile(e.target.value)} className="mono">
          {files.map((f) => (
            <option key={f.file} value={f.file}>
              {f.rel}
            </option>
          ))}
        </Select>
        <Button size="icon" variant="ghost" title="在外编辑器中打开（定位到当前行）" onClick={() => void openExternally()}>
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
        <span className="mono truncate" title={file}>
          {relOf(root, file)}
        </span>
        {busy ? <Spinner /> : null}
        {highlight ? (
          <Badge tone="info" className="ml-auto">
            第 {highlight} 行
          </Badge>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className={highlight ? '' : 'ml-auto'}
          title="重新读取磁盘内容"
          onClick={() => {
            const current = file;
            setFile('');
            window.setTimeout(() => setFile(current), 0);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div ref={scrollRef} className="mono min-h-0 flex-1 overflow-auto scroll-thin py-1 text-[11.5px] leading-[18px]">
        {lines.map((line, i) => {
          const no = i + 1;
          const active = highlight === no;
          return (
            <div
              key={no}
              data-line={no}
              className={cn('flex gap-2 px-2', active && 'bg-primary/10')}
            >
              <span
                className={cn(
                  'w-9 shrink-0 select-none text-right tabular-nums',
                  active ? 'font-semibold text-primary' : 'text-muted-foreground/50',
                )}
              >
                {no}
              </span>
              <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
        {basename(file)} · 共 {lines.length} 行 · 只读（编辑请用外部 IDE）
      </div>
    </div>
  );
}
