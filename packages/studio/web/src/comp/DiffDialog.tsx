import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { Badge, Button, Switch } from '@/ui';
import { relOf, snippet } from '@/lib/utils';
import { useStudio } from '@/store/studio';

/**
 * 编辑计划确认弹窗。
 *
 * 之所以要有这一步：所有写入都是「字符区间替换」，先把 before/after 摆出来，
 * 用户一眼就能确认「这次落盘到底改了哪几个字」。
 */
export function DiffDialog() {
  const plan = useStudio((s) => s.plan);
  const project = useStudio((s) => s.project);
  const autoApply = useStudio((s) => s.autoApply);
  const applyPlan = useStudio((s) => s.applyPlan);
  const discardPlan = useStudio((s) => s.discardPlan);
  const setState = useStudio.setState;

  if (!plan) return null;

  const root = project?.rootPath ?? '';
  const multi = plan.files.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6">
      <div className="flex max-h-[80vh] w-full max-w-[720px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <div className="text-[13px] font-semibold">{plan.title}</div>
            <Badge tone="muted">{plan.files.length} 个文件</Badge>
            <Badge tone="muted">{plan.impacts?.length ?? 0} 处改动</Badge>
          </div>
          <Button size="icon" variant="ghost" onClick={discardPlan} title="取消">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto scroll-thin px-4 py-3">
          {multi && (
            <div className="mb-2 flex items-start gap-2 rounded-[6px] border border-amber-500/30 bg-amber-500/8 px-2.5 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                本次会同时改动多个文件，并<strong>按顺序写入</strong>。任一步失败会立即停止，
                并报告已改 / 未改清单（不做自动回滚）。
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {plan.impacts?.map((impact, i) => (
              <div key={`${impact.file}-${i}`} className="rounded-[6px] border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                  {impact.label ? <Badge tone="info">{impact.label}</Badge> : null}
                  <span className="mono truncate">{relOf(root, impact.file)}</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border/70">
                  <div className="px-2 py-1.5">
                    <div className="mb-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground/80">改前</div>
                    <div className="mono break-all text-[12px] text-destructive/90">{snippet(impact.before, 220) || '(空)'}</div>
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="mb-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground/80">改后</div>
                    <div className="mono break-all text-[12px] text-emerald-700">{snippet(impact.after, 220) || '(删除)'}</div>
                  </div>
                </div>
                {impact.note ? (
                  <div className="border-t border-border/70 px-2 py-1 text-[11px] text-muted-foreground">{impact.note}</div>
                ) : null}
              </div>
            ))}
          </div>

          {plan.uncovered && plan.uncovered.length > 0 && (
            <div className="mt-3 rounded-[6px] border border-amber-500/30 bg-amber-500/8 px-2.5 py-2 text-[12px] text-amber-800">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <Info className="h-3.5 w-3.5" />
                未覆盖清单（{plan.uncovered.length} 处同名标识符无法静态确认语义）
              </div>
              <div className="mono max-h-24 space-y-0.5 overflow-auto scroll-thin">
                {plan.uncovered.map((u, i) => (
                  <div key={`${u.file}-${u.line}-${i}`}>
                    {relOf(root, u.file)}:{u.line}:{u.column}
                  </div>
                ))}
              </div>
              <div className="mt-1">这些位置不会被自动修改，请改完后人工复核。</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Switch
              checked={autoApply}
              onChange={(v) => {
                setState({ autoApply: v });
                localStorage.setItem('studio.autoApply', v ? '1' : '0');
              }}
            />
            以后「单文件单点」改动直接落盘，不再询问
          </label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={discardPlan}>
              取消
            </Button>
            <Button variant="default" onClick={() => void applyPlan(plan.id)}>
              应用到源码
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 右下角通知。 */
export function Toasts() {
  const notices = useStudio((s) => s.notices);
  const dismiss = useStudio((s) => s.dismiss);
  if (notices.length === 0) return null;

  const tone: Record<string, string> = {
    info: 'border-border bg-card text-foreground',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-800',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[380px] flex-col gap-1.5">
      {notices.map((n) => (
        <div
          key={n.id}
          onClick={() => dismiss(n.id)}
          className={`pointer-events-auto cursor-pointer rounded-[6px] border px-3 py-2 text-[12px] leading-5 shadow-lg ${tone[n.level]}`}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}
