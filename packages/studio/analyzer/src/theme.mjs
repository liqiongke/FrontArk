/**
 * 主题配色：CSS 自定义属性的解析与定点改写。
 *
 * 只处理 `selector { --token: value; }` 这一种形态（框架的 theme.css 正是这个形态），
 * 用自带的轻量扫描器而不是 postcss —— 少一个依赖，且我们只需要「值区间」。
 */
import { applyEdits, offsetToLineCol, toPosix } from './fsutil.mjs';

/** token 分组：让右侧调色板不是一长条。 */
const GROUPS = [
  { id: 'base', label: '底色与文字', tokens: ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'surface', 'surface-foreground'] },
  { id: 'primary', label: '主色与强调', tokens: ['primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground'] },
  { id: 'muted', label: '弱化与边框', tokens: ['muted', 'muted-foreground', 'border', 'input', 'ring', 'divider'] },
  { id: 'table', label: '表格与行状态', tokens: ['table-head', 'row-hover', 'selected', 'selected-foreground'] },
  { id: 'sidebar', label: '侧栏', tokens: ['sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring'] },
  { id: 'other', label: '其它', tokens: [] },
];

const COLOR_RE = /^(#[0-9A-Fa-f]{3,8}|oklch\([^)]*\)|rgba?\([^)]*\)|hsla?\([^)]*\)|color-mix\([^)]*\)|transparent|currentColor|inherit|var\([^)]*\))$/;

export function isValidColor(value) {
  return COLOR_RE.test(String(value).trim());
}

/**
 * 解析若干 CSS 文件里的自定义属性。
 * @param {{ files: {file:string, text:string}[], onlyTokens?: boolean }} params
 */
export function parseTheme({ files }) {
  const out = [];
  for (const f of files) {
    const file = toPosix(f.file);
    const blocks = scanBlocks(f.text);
    const tokens = [];
    for (const block of blocks) {
      const body = f.text.slice(block.bodyStart, block.bodyEnd);
      const re = /([ \t]*)--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
      let m;
      while ((m = re.exec(body))) {
        const rawValue = m[3];
        const valueOffsetInBody = m.index + m[0].indexOf(rawValue);
        const start = block.bodyStart + valueOffsetInBody;
        const end = start + rawValue.length;
        const pos = offsetToLineCol(f.text, start);
        tokens.push({
          file,
          selector: block.selector,
          token: m[2],
          value: rawValue.trim(),
          anchor: {
            file,
            start: start + rawValue.length - rawValue.trimEnd().length * 0,
            end: start + rawValue.trimEnd().length,
            line: pos.line,
            column: pos.column,
          },
          group: groupOf(m[2]),
        });
      }
    }
    out.push({ file, blocks: blocks.map((b) => ({ selector: b.selector, line: offsetToLineCol(f.text, b.openBrace).line })), tokens });
  }
  return { files: out, groups: GROUPS };
}

function groupOf(token) {
  for (const g of GROUPS) {
    if (g.tokens.includes(token)) return g.id;
  }
  return 'other';
}

/** 扫描 `selector { ... }` 块（保留所有偏移，不做任何重排）。 */
function scanBlocks(text) {
  const blocks = [];
  let depth = 0;
  let blockStart = -1;
  let bodyStart = -1;
  let selectorStart = 0;
  let inComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        blockStart = i;
        bodyStart = i + 1;
        const raw = text.slice(selectorStart, i);
        blocks.push({
          selector: raw.replace(/\/\*[\s\S]*?\*\//g, '').trim() || '@unknown',
          openBrace: i,
          bodyStart,
          bodyEnd: -1,
          end: -1,
        });
      }
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const block = blocks[blocks.length - 1];
        if (block && block.bodyEnd < 0) {
          block.bodyEnd = i;
          block.end = i + 1;
        }
        selectorStart = i + 1;
      }
      continue;
    }
  }
  for (const b of blocks) {
    if (b.bodyEnd < 0) b.bodyEnd = text.length;
  }
  return blocks;
}

/**
 * 生成 token 改写计划。
 * @param {{ files: {file:string,text:string}[], file: string, selector: string, token: string, value: string }} params
 */
export function planThemeSet({ files, file, selector, token, value }) {
  const target = toPosix(file);
  const source = files.find((f) => toPosix(f.file) === target);
  if (!source) throw Object.assign(new Error(`文件不在快照内：${file}`), { code: 'ENOFILE' });
  if (!isValidColor(value)) {
    throw Object.assign(new Error(`颜色值格式不受支持：${value}`), { code: 'EBADVALUE' });
  }

  const blocks = scanBlocks(source.text);
  const block = blocks.find((b) => b.selector === selector);
  if (!block) throw Object.assign(new Error(`找不到选择器 ${selector}`), { code: 'ENOTARGET' });

  const body = source.text.slice(block.bodyStart, block.bodyEnd);
  const re = new RegExp(`([ \\t]*)--${escapeRe(token)}\\s*:\\s*([^;]+);`);
  const m = re.exec(body);
  if (!m) throw Object.assign(new Error(`选择器 ${selector} 下没有 token --${token}`), { code: 'ENOTARGET' });

  const rawValue = m[2];
  const valueOffsetInBody = m.index + m[0].indexOf(rawValue);
  const start = block.bodyStart + valueOffsetInBody;
  const end = start + rawValue.trimEnd().length;
  const before = source.text.slice(start, end);
  const after = String(value).trim();
  if (before === after) return { files: [], impacts: [], noop: true };

  const nextText = applyEdits(source.text, [{ start, end, newText: after }]);
  return {
    files: [{ file: target, edits: [{ file: target, start, end, newText: after }], nextText }],
    impacts: [{ nodeId: `theme.${selector}.${token}`, file: target, before, after, label: `${selector} → --${token}` }],
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 在 CSS 文本里追加一组 token（另存为预设时使用）。 */
export function renderThemeOverride(selector, vars) {
  const lines = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}
