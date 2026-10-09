import { useMemo, useState } from 'react';
import { Check, PaintBucket, RotateCcw, Save } from 'lucide-react';
import { Badge, Button, Empty, Input, Select } from '@/ui';
import { cn, relOf } from '@/lib/utils';
import { useStudio } from '@/store/studio';
import type { ThemeToken } from '@/types';

/**
 * 主题配色编辑。
 *
 * 关键取舍：值就是 CSS 原文（框架用的是 oklch()），所以这里不引入颜色空间换算库 ——
 * 直接让浏览器渲染色块，再用原生取色器写 hex（同样是合法 CSS 值）。
 * 草稿只推给预览 iframe 做即时预览，**落盘必须显式点保存**。
 */
export function ThemePanel() {
  const theme = useStudio((s) => s.theme);
  const themeDraft = useStudio((s) => s.themeDraft);
  const draftTheme = useStudio((s) => s.draftTheme);
  const clearThemeDraft = useStudio((s) => s.clearThemeDraft);
  const saveThemeToken = useStudio((s) => s.saveThemeToken);
  const loadTheme = useStudio((s) => s.loadTheme);
  const project = useStudio((s) => s.project);

  const tokens = useMemo(() => theme?.files.flatMap((f) => f.tokens) ?? [], [theme]);
  const selectors = useMemo(() => [...new Set(tokens.map((t) => t.selector))], [tokens]);
  const groups = theme?.groups ?? [];
  const [group, setGroup] = useState('all');
  const [selector, setSelector] = useState(':root');

  const visible = tokens.filter(
    (t) => t.selector === selector && (group === 'all' || t.group === group),
  );

  if (!theme) return <Empty>主题解析中…</Empty>;
  if (tokens.length === 0) {
    return (
      <Empty>
        没有解析到主题 token。
        <br />
        可在项目设置里把自定义主题文件加进 themeFiles。
      </Empty>
    );
  }

  const root = project?.rootPath ?? '';
  const draftCount = Object.keys(themeDraft).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <PaintBucket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Select className="w-[104px]" value={selector} onChange={(e) => setSelector(e.target.value)}>
          {selectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select className="w-[104px]" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">全部分组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
          <option value="other">其它</option>
        </Select>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {draftCount > 0 ? <Badge tone="warn">{draftCount} 处未保存</Badge> : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearThemeDraft();
              void loadTheme();
            }}
            title="丢弃草稿并重新从磁盘解析"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        {visible.map((token) => (
          <TokenRow
            key={`${token.file}|${token.selector}|${token.token}`}
            token={token}
            root={root}
            draft={themeDraft[`${token.file}|${token.selector}|${token.token}`]}
            onDraft={(v) => draftTheme(`${token.file}|${token.selector}|${token.token}`, v)}
            onSave={() =>
              void saveThemeToken({
                file: token.file,
                selector: token.selector,
                token: token.token,
                value: themeDraft[`${token.file}|${token.selector}|${token.token}`] ?? token.value,
              })
            }
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-border px-2 py-1.5 text-[11px] leading-5 text-muted-foreground">
        草稿会即时推到预览（不落盘）；点「保存」才写入 CSS 文件。框架 token 落在 packages/framework，
        改动会影响所有应用。
      </div>
    </div>
  );
}

function TokenRow({
  token,
  root,
  draft,
  onDraft,
  onSave,
}: {
  token: ThemeToken;
  root: string;
  draft?: string;
  onDraft: (v: string) => void;
  onSave: () => void;
}) {
  const value = draft ?? token.value;
  const dirty = draft !== undefined && draft !== token.value;

  const fileLabel = relOf(root, token.file).split('/').slice(-2).join('/');

  return (
    <div className="border-b border-border/60 px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <div className="h-4 w-4 shrink-0 rounded-[3px] border border-border" style={{ background: value }} title={value} />
        <span className="mono truncate text-[11.5px]" title={`${token.selector} · --${token.token}`}>
          --{token.token}
        </span>
        {dirty ? <Badge tone="warn">未保存</Badge> : null}
        <span className="mono ml-auto shrink-0 truncate text-[10px] text-muted-foreground/60" title={relOf(root, token.file)}>
          {fileLabel}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          className={cn('mono h-6 min-w-0 flex-1', dirty && 'border-amber-500/60 ring-1 ring-amber-500/25')}
          value={value}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) onSave();
            if (e.key === 'Escape') onDraft(token.value);
          }}
        />
        <input
          type="color"
          className="h-6 w-7 shrink-0 cursor-pointer rounded-[4px] border border-border bg-card p-0"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'}
          onChange={(e) => onDraft(e.target.value)}
          title="用取色器选一个 hex 值（会覆盖 oklch）"
        />
        <Button size="icon" variant={dirty ? 'default' : 'ghost'} disabled={!dirty} onClick={onSave} title="写入该 token">
          {dirty ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 opacity-40" />}
        </Button>
      </div>
    </div>
  );
}
