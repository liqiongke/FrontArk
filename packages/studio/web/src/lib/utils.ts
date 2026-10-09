import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 截断显示用的源码片段。 */
export function snippet(text: string | undefined | null, max = 90): string {
  if (text === undefined || text === null) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
}

export function relOf(root: string, p: string): string {
  const r = root.replace(/\\/g, '/').replace(/\/$/, '');
  const f = p.replace(/\\/g, '/');
  return f.startsWith(`${r}/`) ? f.slice(r.length + 1) : f;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

/** 把值渲染成可读的单行字符串（用于属性面板的折叠摘要）。 */
export function summarize(node: { editability: string; value?: unknown; expr?: string | null; enumMember?: string | null; enumObject?: string | null; ref?: { kind: string; member?: string | null } | null; handlerMethod?: string | null; children?: string[] }): string {
  switch (node.editability) {
    case 'literal':
      return typeof node.value === 'string' ? node.value : JSON.stringify(node.value);
    case 'enumRef':
      return `${node.enumObject}.${node.enumMember}`;
    case 'memberRef':
    case 'callRef':
    case 'expr':
    case 'moduleRef':
      return snippet(node.expr, 60) || '—';
    case 'handlerRef':
      return `this.handler.${node.handlerMethod}`;
    case 'object':
      return `{ ${node.children?.length ?? 0} 项 }`;
    case 'array':
      return `[ ${node.children?.length ?? 0} 项 ]`;
    default:
      return '只读';
  }
}
