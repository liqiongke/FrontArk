/**
 * 从框架源码提取运行时枚举（VType / Ctrl / RenderMode / SummaryType / PathKey）。
 *
 * 这里不去读 `.d.ts`（框架当前没有构建产物），而是直接解析框架 src 下的 interface.ts。
 * 枚举成员上的 `@name` JSDoc 直接作为中文标签使用 —— 框架已经写好了，不再维护第二份映射表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSource } from './analyze.mjs';
import ts from 'typescript';
import { toPosix } from './fsutil.mjs';

const SOURCES = [
  { files: ['comp/view/interface.ts'], enums: ['ViewType'] },
  { files: ['comp/control/interface.ts'], enums: ['Ctrl'] },
  { files: ['comp/view/table/interface.ts'], enums: ['RenderMode', 'SummaryType'] },
  { files: ['stores/store/interface.ts'], enums: ['PathKey'] },
];

const ENUM_LABELS = {
  ViewType: '视图类型',
  Ctrl: '控件类型',
  RenderMode: '渲染模式',
  SummaryType: '统计方式',
  PathKey: '取值路径键',
};

/** JSDoc 里的 @name。 */
function jsdocName(sf, node) {
  const chunk = sf.text.slice(node.getFullStart(), node.getStart(sf));
  const m = chunk.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!m) return null;
  const t = m[1].match(/@name\s+(.+)/);
  return t ? t[1].trim() : null;
}

function jsdocText(sf, node) {
  const chunk = sf.text.slice(node.getFullStart(), node.getStart(sf));
  const m = chunk.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!m) return null;
  const body = m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'));
  return body.join(' ') || null;
}

/**
 * @param {{ frameworkSrc: string }} params
 */
export function extractEnums({ frameworkSrc }) {
  const out = {};
  if (!frameworkSrc || !fs.existsSync(frameworkSrc)) return { enums: out, missing: SOURCES.flatMap((s) => s.files) };

  const missing = [];
  for (const entry of SOURCES) {
    for (const rel of entry.files) {
      const file = path.join(frameworkSrc, rel);
      if (!fs.existsSync(file)) {
        missing.push(toPosix(file));
        continue;
      }
      const text = fs.readFileSync(file, 'utf8');
      const sf = parseSource(toPosix(file), text);
      const visit = (node) => {
        if (ts.isEnumDeclaration(node)) {
          const name = node.name.text;
          if (!entry.enums.includes(name)) return;
          const members = [];
          for (const m of node.members) {
            const memberName = m.name.getText(sf);
            let value = null;
            if (m.initializer && ts.isStringLiteral(m.initializer)) value = m.initializer.text;
            else if (m.initializer && ts.isNumericLiteral(m.initializer)) value = Number(m.initializer.text);
            members.push({
              name: memberName,
              value,
              label: jsdocName(sf, m) ?? memberName,
              description: jsdocText(sf, m) ?? '',
            });
          }
          out[name] = { name, label: ENUM_LABELS[name] ?? name, file: toPosix(file), members };
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return { enums: out, missing };
}
