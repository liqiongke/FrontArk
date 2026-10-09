/**
 * 主题配色：CSS 自定义属性的解析与定点改写。
 *
 * 只处理 `selector { --token: value; }` 这一种形态（框架的 theme.css 正是这个形态），
 * 用自带的轻量扫描器而不是 postcss —— 少一个依赖，且我们只需要「值区间」。
 */
import { applyEdits, offsetToLineCol, toPosix } from './fsutil.mjs';
import { contrastRatio, formatLikeTarget, parseColor } from './color.mjs';

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
/**
 * 必须有值的 token。缺了它们整站会塌成"无样式"，而且是从别处莫名其妙地塌，
 * 所以在保存前就要拦下来。
 */
const REQUIRED_TOKENS = ['background', 'foreground', 'primary', 'primary-foreground', 'border'];

/** 需要做对比度检查的前景/背景配对（WCAG AA 正文要求 4.5:1）。 */
const CONTRAST_PAIRS = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['destructive-foreground', 'destructive'],
  ['sidebar-foreground', 'sidebar'],
];

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

/**
 * 主题校验：非法值 / 必需的 token 缺失 / 同选择器内重复 / 对比度不足。
 *
 * 这些以前完全没有——"改了颜色但看不出区别在哪"是最常见的困惑来源，
 * 而对比度不足恰恰是静态就能算出来的。
 */
export function validateTheme({ files }) {
  const issues = [];
  const checks = [];

  for (const f of files) {
    const file = toPosix(f.file);
    const bySelector = new Map();

    for (const token of f.tokens ?? []) {
      const list = bySelector.get(token.selector) ?? [];
      list.push(token);
      bySelector.set(token.selector, list);

      if (!isValidColor(token.value)) {
        issues.push({
          level: 'error',
          code: 'ST008',
          message: `${token.selector} 下的 --${token.token} 不是受支持的颜色写法：${token.value}`,
          target: `theme.${token.selector}.${token.token}`,
          file,
          line: token.anchor?.line ?? null,
        });
      } else if (parseColor(token.value) === null && !/^(var|currentColor|inherit|transparent)/i.test(token.value.trim())) {
        // 语法合法但算不出 sRGB（color-mix / 未知函数）：只提示，不阻断。
        // 单独一个码，面板里才能和"真的写错了"分开过滤。
        issues.push({
          level: 'info',
          code: 'ST012',
          message: `${token.selector} 下的 --${token.token} 无法静态求值，对比度检查已跳过：${token.value}`,
          target: `theme.${token.selector}.${token.token}`,
          file,
          line: token.anchor?.line ?? null,
        });
      }
    }

    for (const [selector, list] of bySelector) {
      const seen = new Map();
      for (const token of list) {
        const n = (seen.get(token.token) ?? 0) + 1;
        seen.set(token.token, n);
      }
      for (const [name, count] of seen) {
        if (count > 1) {
          issues.push({
            level: 'warning',
            code: 'ST013',
            message: `${selector} 下的 --${name} 重复声明了 ${count} 次（CSS 里后者生效），请在面板中按"第 N 处"逐条确认。`,
            target: `theme.${selector}.${name}`,
            file,
          });
        }
      }

      // 必需 token 只在最"基础"的那个选择器上要求（:root）
      if (selector === ':root') {
        const names = new Set(list.map((t) => t.token));
        for (const req of REQUIRED_TOKENS) {
          if (!names.has(req)) {
            issues.push({
              level: 'error',
              code: 'ST014',
              message: `:root 缺少必需的 token --${req}，整站样式会不完整。`,
              target: `theme.:root.${req}`,
              file,
            });
          }
        }
      }

      // 对比度。
      //
      // 取值必须遵循 CSS 的实际级联：当前选择器没声明某个 token 时，它继承自 :root。
      // 只查当前块的话，「.dark 只覆盖 --background、--foreground 仍用 :root」这种
      // 最常见写法会被整条跳过 —— 深色模式的对比度就成了永远的盲区。
      const rootTokens = bySelector.get(':root') ?? [];
      const valueOf = (name) =>
        list.find((t) => t.token === name)?.value ??
        rootTokens.find((t) => t.token === name)?.value ??
        null;
      for (const [fg, bg] of CONTRAST_PAIRS) {
        const fgValue = valueOf(fg);
        const bgValue = valueOf(bg);
        if (!fgValue || !bgValue) continue;
        const ratio = contrastRatio(parseColor(fgValue), parseColor(bgValue));
        if (ratio === null) continue;
        const pass = ratio >= AA_NORMAL;
        checks.push({
          selector,
          file,
          fg,
          bg,
          fgValue,
          bgValue,
          ratio: Math.round(ratio * 100) / 100,
          level: pass ? 'pass' : ratio >= AA_LARGE ? 'large-only' : 'fail',
        });
        if (!pass) {
          // 文档 §5.7.4：对比度不足只告警、不阻断保存。
          // 但低于 AA_LARGE 时连大字号都不达标，措辞上要更明确。
          const severe = ratio < AA_LARGE;
          issues.push({
            level: 'warning',
            code: 'ST015',
            message:
              `${selector}：--${fg} 与 --${bg} 的对比度为 ${Math.round(ratio * 100) / 100}:1` +
              `（WCAG AA 正文要求 ≥ ${AA_NORMAL}:1${severe ? `，大字号要求 ≥ ${AA_LARGE}:1` : ''}），文字可能偏难读。`,
            target: `theme.${selector}.${fg}`,
            file,
          });
        }
      }
    }
  }

  return { issues, checks };
}

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
      const seenInBlock = new Map();
      while ((m = re.exec(body))) {
        const rawValue = m[3];
        const valueOffsetInBody = m.index + m[0].indexOf(rawValue);
        const start = block.bodyStart + valueOffsetInBody;
        // 值区间的右端要避开分号前的空白；左端保持原样（可能有意留了空格）。
        const trimmedEnd = start + rawValue.length - (rawValue.length - rawValue.trimEnd().length);
        const pos = offsetToLineCol(f.text, start);

        // 同一选择器内同名 token 可以合法出现多次（后者按 CSS 层叠生效）。
        // 用 occurrence 区分，前端才能按第 N 处精确改写，而不是只改得到第一个。
        const occurrence = seenInBlock.get(m[2]) ?? 0;
        seenInBlock.set(m[2], occurrence + 1);

        tokens.push({
          file,
          selector: block.selector,
          token: m[2],
          value: rawValue.trim(),
          occurrence,
          duplicate: false, // 解析结束后统一回填
          anchor: {
            file,
            start,
            end: trimmedEnd,
            line: pos.line,
            column: pos.column,
          },
          group: groupOf(m[2]),
        });
      }
    }
    // 回填「该 token 在选择器内重复出现」：前端据此提示用户确认改第几处。
    const counts = new Map();
    for (const t of tokens) counts.set(t.token, (counts.get(t.token) ?? 0) + 1);
    for (const t of tokens) t.duplicate = (counts.get(t.token) ?? 0) > 1;

    out.push({
      file,
      blocks: blocks.map((b) => ({ selector: b.selector, line: offsetToLineCol(f.text, b.openBrace).line })),
      tokens,
    });
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
export function planThemeSet({ files, file, selector, token, value, occurrence = 0 }) {
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
  // 必须用 /g + 计数定位：同一选择器里同名 token 可以出现多次，
  // 不带 /g 的 exec 只会命中第一处，第二处就成了「界面上看得见、改不动」的幽灵值。
  const re = new RegExp(`([ \\t]*)--${escapeRe(token)}\\s*:\\s*([^;]+);`, 'g');
  const want = Math.max(0, Number(occurrence) || 0);
  let seen = -1;
  let m = null;
  let hit = null;
  while ((m = re.exec(body))) {
    seen += 1;
    if (seen === want) {
      hit = m;
      break;
    }
  }
  if (!hit) {
    throw Object.assign(
      new Error(`选择器 ${selector} 下没有第 ${want + 1} 个 token --${token}`),
      { code: 'ENOTARGET' },
    );
  }

  const rawValue = hit[2];
  const valueOffsetInBody = hit.index + hit[0].indexOf(rawValue);
  const start = block.bodyStart + valueOffsetInBody;
  const end = start + rawValue.trimEnd().length;
  const before = source.text.slice(start, end);

  // 关键：写回时**沿用目标 token 原本的色空间**。
  // 取色器只能给 HEX，若直接写进 `oklch(...)` 的 token，同一张表里就会混两种色空间 ——
  // 后续任何基于色空间的计算（对比度、主题推导）都会失效。
  const after = formatLikeTarget(String(value).trim(), rawValue);
  if (before === after) return { files: [], impacts: [], noop: true };

  const nextText = applyEdits(source.text, [{ start, end, newText: after }]);
  return {
    files: [{ file: target, edits: [{ file: target, start, end, newText: after }], nextText }],
    impacts: [
      {
        nodeId: `theme.${selector}.${token}`,
        file: target,
        before,
        after,
        label: `${selector} → --${token}${want > 0 ? `（第 ${want + 1} 处）` : ''}`,
      },
    ],
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
