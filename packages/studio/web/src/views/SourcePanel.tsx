import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileCode2, RefreshCw } from 'lucide-react';
import { Badge, Button, Empty, Select, Spinner } from '@/ui';
import { basename, cn, relOf } from '@/lib/utils';
import * as api from '@/lib/api';
import { nodeById, useStudio } from '@/store/studio';

/** 行高（px）：窗口化按它换算滚动位置，必须与实际渲染一致。 */
const LINE_HEIGHT = 18;
/** 超过这么多行才启用窗口化。 */
const VIRTUALIZE_ABOVE = 1200;
/** 可视范围上下各多渲染的行数。 */
const WINDOW = 160;

/**
 * 只读源码查看器：点结构树里的「⌖」就在这里定位到对应行。
 * 刻意不做成第二个编辑器 —— 真正的编辑交给外部 IDE（顶栏可一键唤起）。
 */
export function SourcePanel() {
  const project = useStudio((s) => s.project);
  const analysis = useStudio((s) => s.analysis);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const sourceFocus = useStudio((s) => s.sourceFocus);
  const clearSourceFocus = useStudio((s) => s.clearSourceFocus);

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
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const lines = useMemo(() => text.split('\n'), [text]);

  // 选中节点变化时，自动切到它所在的文件并定位
  useEffect(() => {
    if (!node?.anchor?.file) return;
    setFile(node.anchor.file);
    setHighlight(node.anchor.line);
  }, [node?.id, node?.anchor?.file, node?.anchor?.line]);

  // 一次性定位请求（问题面板点诊断）。优先级高于上面的节点锚点：
  // 有些诊断（缺 token、语法错误）压根不对应任何语义节点，只知道文件与行号。
  useEffect(() => {
    if (!sourceFocus) return;
    setFile(sourceFocus.file);
    setHighlight(sourceFocus.line);
    clearSourceFocus();
  }, [sourceFocus, clearSourceFocus]);

  // 诊断可能指向不在页面文件清单里的文件（例如框架的主题 css），
  // 临时把它并进下拉，否则 Select 的 value 找不到 option，界面上看不出当前在看哪个文件。
  const shownFiles = useMemo(() => {
    if (!file || files.some((f) => f.file === file)) return files;
    return [{ file, rel: relOf(project?.rootPath ?? '', file) }, ...files];
  }, [files, file, project]);

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

  // 大文件的窗口化：只渲染可视范围上下各 WINDOW 行。
  // 整文件逐行渲染成 <div> 时，3000 行的文件就是 3000 个 DOM 节点，
  // 每次选中节点触发的高亮重渲染都要重新协调它们。
  const big = lines.length > VIRTUALIZE_ABOVE;
  const first = big ? Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - WINDOW) : 0;
  const last = big
    ? Math.min(lines.length, Math.ceil((scrollTop + viewHeight) / LINE_HEIGHT) + WINDOW)
    : lines.length;
  const slice = big ? lines.slice(first, last) : lines;

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!big) return;
    const el = e.currentTarget;
    const top = el.scrollTop;
    const h = el.clientHeight;
    // 用 rAF 合并：滚动事件比渲染帧密得多
    if (rafRef.current !== 0) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(top);
      setViewHeight(h);
    });
  }

  // 定位到目标行
  useEffect(() => {
    const el = scrollRef.current;
    if (!highlight || !el) return;
    if (big) {
      // 先按行高直接把滚动位置挪过去，保证目标行落在渲染窗口内，
      // 否则 querySelector 会因为"还没渲染"而找不到它。
      el.scrollTop = Math.max(0, (highlight - 1) * LINE_HEIGHT - el.clientHeight / 2);
      setScrollTop(el.scrollTop);
      setViewHeight(el.clientHeight);
    }
    const raf = window.requestAnimationFrame(() => {
      el.querySelector(`[data-line="${highlight}"]`)?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [highlight, text, big]);

  async function openExternally() {
    if (!file) return;
    // 走 store 的统一入口：它会在真正起进程前弹一次确认
    await useStudio.getState().openExternally({ file, line: highlight ?? 1, column: 1 });
  }

  if (!project) return <Empty>先选择一个项目</Empty>;
  if (files.length === 0) return <Empty>当前页面没有可查看的源码文件</Empty>;

  const root = project.rootPath;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Select value={file} onChange={(e) => setFile(e.target.value)} className="mono">
          {shownFiles.map((f) => (
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="mono min-h-0 flex-1 overflow-auto scroll-thin py-1 text-[11.5px]"
        style={{ lineHeight: `${LINE_HEIGHT}px` }}
      >
        {big && first > 0 ? <div style={{ height: first * LINE_HEIGHT }} aria-hidden /> : null}
        {slice.map((line, i) => {
          const no = first + i + 1;
          const active = highlight === no;
          return (
            <div key={no} data-line={no} className={cn('flex gap-2 px-2', active && 'bg-primary/10')}>
              <span
                className={cn(
                  'w-9 shrink-0 select-none text-right tabular-nums',
                  active ? 'font-semibold text-primary' : 'text-muted-foreground/50',
                )}
              >
                {no}
              </span>
              {/* 不换行：窗口化按固定行高估算滚动位置，一旦折行偏移量就不准了 */}
              <span className="whitespace-pre">{line || ' '}</span>
            </div>
          );
        })}
        {big && last < lines.length ? <div style={{ height: (lines.length - last) * LINE_HEIGHT }} aria-hidden /> : null}
      </div>

      <div className="shrink-0 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
        {basename(file)} · 共 {lines.length} 行{big ? `（窗口化渲染 ${first + 1}–${last}）` : ''} · 只读（编辑请用外部 IDE）
      </div>
    </div>
  );
}
