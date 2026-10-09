/**
 * 文本级工具：全部围绕「无损写回」服务。
 *
 * 核心原则（对应设计文档 §5.4.2）：只替换目标字符区间，其余字节一个不动。
 * 为此这里不做任何格式化，只做「探测既有风格 → 生成与风格一致的新文本」。
 */
import { createHash } from 'node:crypto';

/** sha1，用于锚点漂移检测与快照标识。 */
export function sha1(text) {
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

/** 探测换行风格。 */
export function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * 探测引号风格：统计全文单双引号出现次数，取多者为默认；
 * 传入 near 时优先看目标位置附近的上下文（同一对象内部的风格更可信）。
 */
export function detectQuote(text, near = -1) {
  const scope = near >= 0 ? text.slice(Math.max(0, near - 400), near + 400) : text;
  let single = 0;
  let double = 0;
  for (let i = 0; i < scope.length; i += 1) {
    const ch = scope[i];
    if (ch !== "'" && ch !== '"') continue;
    // 跳过被转义的引号
    let back = 0;
    let j = i - 1;
    while (j >= 0 && scope[j] === '\\') {
      back += 1;
      j -= 1;
    }
    if (back % 2 === 1) continue;
    if (ch === "'") single += 1;
    else double += 1;
  }
  return double > single ? '"' : "'";
}

/** 把值序列化成符合目标文件风格的字符串字面量。 */
export function stringLiteral(value, text, near) {
  const quote = detectQuote(text, near);
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(`\\${quote}`, 'g'), `\\${quote}`)
    .replace(/\r?\n/g, '\\n');
  return `${quote}${escaped}${quote}`;
}

/** 把属性名序列化成符合风格的 key（合法标识符不加引号）。 */
export function propertyKey(name, text, near) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : stringLiteral(name, text, near);
}

/** 偏移 → 1-based 行列（供前端跳转）。 */
export function offsetToLineCol(text, offset) {
  let line = 1;
  let lineStart = 0;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: limit - lineStart + 1 };
}

/** 取包含 offset 的整行内容。 */
export function lineAt(text, offset) {
  const start = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const end = text.indexOf('\n', offset);
  return text.slice(start, end === -1 ? text.length : end);
}

/** 取某行行首的空白（探测缩进风格）。 */
export function indentAt(text, offset) {
  const line = lineAt(text, offset);
  const m = line.match(/^[\t ]*/);
  return m ? m[0] : '';
}

/** 探测缩进单位：优先 tab，其次从文件里出现的最小缩进增量推断，兜底 2 空格。 */
export function detectIndentUnit(text) {
  const lines = text.split(/\r?\n/);
  let tabIndented = 0;
  const spaces = [];
  for (const line of lines) {
    const m = line.match(/^([\t ]+)\S/);
    if (!m) continue;
    const lead = m[1];
    if (lead.startsWith('\t')) {
      tabIndented += 1;
      continue;
    }
    spaces.push(lead.length);
  }
  if (tabIndented > spaces.length) return '\t';
  if (spaces.length === 0) return '  ';
  const counts = {};
  for (const n of spaces) {
    for (const candidate of [2, 4]) {
      if (n % candidate === 0) counts[candidate] = (counts[candidate] ?? 0) + 1;
    }
  }
  return (counts[4] ?? 0) > (counts[2] ?? 0) ? '    ' : '  ';
}

/**
 * 应用一批编辑（同一文件的字符区间替换）。
 * edits: [{ start, end, newText }]
 * 校验：区间必须落在文件内、互不重叠；返回新文本。
 */
export function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let lastStart = Number.POSITIVE_INFINITY;
  for (const edit of sorted) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end)) {
      throw new Error('编辑区间必须是整数偏移');
    }
    if (edit.start < 0 || edit.end > text.length || edit.start > edit.end) {
      throw new Error(`编辑区间越界：[${edit.start}, ${edit.end}]（文件长度 ${text.length}）`);
    }
    if (edit.end > lastStart) {
      throw new Error(`编辑区间重叠：[${edit.start}, ${edit.end}]`);
    }
    lastStart = edit.start;
  }
  let out = text;
  for (const edit of sorted) {
    out = out.slice(0, edit.start) + edit.newText + out.slice(edit.end);
  }
  return out;
}

/** 去掉 JSONC 注释与尾逗号，得到可 JSON.parse 的文本（不动原文件）。 */
export function stripJsonc(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += ch;
  }
  // 去掉尾逗号
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** 把多行文本按给定缩进基准重新缩进（跳过空行）。 */
export function reindent(block, baseIndent) {
  const lines = block.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return block;
  let min = Infinity;
  for (const line of nonEmpty) {
    const m = line.match(/^[\t ]*/);
    min = Math.min(min, m ? m[0].length : 0);
  }
  return lines
    .map((line) => (line.trim() ? baseIndent + line.slice(min) : line))
    .join('\n');
}

/** 相对路径统一成正斜杠。 */
export function toPosix(p) {
  return p.replace(/\\/g, '/');
}
