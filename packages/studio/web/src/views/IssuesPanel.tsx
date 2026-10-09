import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, CircleAlert, Info } from 'lucide-react';
import { Badge, Empty } from '@/ui';
import { cn } from '@/lib/utils';
import { useStudio } from '@/store/studio';

/** 中栏底部的问题面板：领域诊断（ST0xx / FA0xx）。 */
export function IssuesPanel() {
  const analysis = useStudio((s) => s.analysis);
  const selectNode = useStudio((s) => s.selectNode);
  const setInspectorTab = useStudio((s) => s.setInspectorTab);
  const focusSource = useStudio((s) => s.focusSource);
  const [open, setOpen] = useState(false);

  const issues = analysis?.issues ?? [];
  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warning').length;

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-[12px] hover:bg-muted/50"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-semibold">问题</span>
        {errors > 0 ? (
          <Badge tone="error">
            <CircleAlert className="mr-0.5 h-3 w-3" />
            {errors}
          </Badge>
        ) : null}
        {warns > 0 ? (
          <Badge tone="warn">
            <AlertTriangle className="mr-0.5 h-3 w-3" />
            {warns}
          </Badge>
        ) : null}
        {issues.length === 0 && <span className="text-muted-foreground">未发现问题</span>}
      </button>

      {open && (
        <div className="max-h-[180px] overflow-auto scroll-thin border-t border-border">
          {issues.length === 0 ? (
            <Empty>当前页面没有领域诊断问题。</Empty>
          ) : (
            issues.map((issue, i) => (
              <button
                key={`${issue.code}-${i}`}
                type="button"
                onClick={() => {
                  // 诊断都带 file/line（ST008 之类压根没有对应语义节点），
                  // 所以优先把源码面板指到那一行，而不是只选中节点。
                  if (issue.target) selectNode(issue.target);
                  if (issue.file) {
                    focusSource(issue.file, issue.line ?? 1);
                    setInspectorTab('source');
                  } else if (issue.target) {
                    setInspectorTab('property');
                  }
                }}
                className={cn(
                  'flex w-full items-start gap-2 border-b border-border/60 px-3 py-1.5 text-left text-[12px] hover:bg-muted/50',
                )}
              >
                <span className="mt-[2px] shrink-0">
                  {issue.level === 'error' ? (
                    <CircleAlert className="h-3.5 w-3.5 text-destructive" />
                  ) : issue.level === 'warning' ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </span>
                <span className="mono shrink-0 text-[11px] text-muted-foreground">{issue.code}</span>
                <span className="min-w-0 flex-1">{issue.message}</span>
                {issue.target ? <span className="mono shrink-0 text-[10.5px] text-muted-foreground/70">{issue.target}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
