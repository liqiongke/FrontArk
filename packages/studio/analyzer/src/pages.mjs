/**
 * 页面发现与文件归集。
 *
 * 路由口径与 `apps/demo/vite.config.ts` 的 vite-plugin-pages 配置一致：
 *   dirs = src/pages，extensions = tsx/jsx/ts/js，
 *   exclude = data.* / view.* / handler.*
 */
import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from './fsutil.mjs';

const PAGE_EXTS = ['.tsx', '.jsx', '.ts', '.js'];
const DECLARATION_BASENAMES = ['data', 'view', 'handler'];

/** 递归收集页面入口文件（index.*）。 */
function walk(dir, out, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out, depth + 1);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!PAGE_EXTS.includes(ext)) continue;
    if (path.basename(entry.name, ext) !== 'index') continue;
    out.push(full);
  }
}

/** 页面目录 → 路由路径（与 vite-plugin-pages 的 index 约定一致）。 */
export function routeOf(pagesDir, file) {
  const rel = toPosix(path.relative(pagesDir, file));
  const noIndex = rel.replace(/\/index\.(tsx|jsx|ts|js)$/, '').replace(/^index\.(tsx|jsx|ts|js)$/, '');
  if (!noIndex) return '/';
  return `/${noIndex}`.replace(/\[\.\.\.all\]/g, '[...all]');
}

/**
 * 页面别名的注释约定。
 *
 * 在页面入口文件（index.tsx）里写一行，例如：
 *   // @studio-name 系统表格页面
 *
 * 左栏「页面」列表就用它代替路由显示（路由退到 hover tooltip），没写则回退显示路由。
 * 标记刻意用 ASCII：好 grep、好被脚本处理，也不会和 analyze.mjs 里成员级的
 * JSDoc `@name`（视图/数据成员命名）混淆。
 */
const STUDIO_NAME_RE = /^[ \t]*(?:\/\/+|\/\*+|\*)[ \t]*@studio-name[ \t]+(.+)$/m;

/** 从入口文件文本里取出页面别名；未声明返回 null。 */
export function pageNameOf(text) {
  const m = String(text).match(STUDIO_NAME_RE);
  if (!m) return null;
  // 兼容块注释写法：`/* @studio-name xxx */` 收尾会带一个 */
  const name = m[1].replace(/\*\/\s*$/, '').trim();
  return name || null;
}

/**
 * 页面入口的**廉价**元信息：只读一次文本，不做完整 AST。
 *
 * 存在的意义是让左栏在"点开之前"就能区分哪些页面可编辑 —— 完整判定要解析
 * 三个类 + 递归 AST，不可能为 100 个页面都跑一遍（设计 §5.2.3「按需解析」）。
 *
 * 判据刻意保守：只用来提示。真正的级别以 page.analyze 的结果为准。
 */
function readEntryMeta(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { level: 'L2', name: null };
  }
  const name = pageNameOf(text);
  if (/ViewRoot/.test(text)) return { level: 'L1', name };
  // 转发壳 / 动态装配：渲染什么要运行时才知道
  if (/\bexport\s*(\*|\{[^}]*\})\s*from\b/.test(text)) return { level: 'L3', name };
  if (/\bimport\s*\(/.test(text) || /\b(?:React\.)?lazy\s*\(/.test(text)) return { level: 'L3', name };
  return { level: 'L2', name };
}

/** 列出全部页面候选。 */
export function listPages({ pagesDir, frameworkSrc }) {
  if (!pagesDir || !fs.existsSync(pagesDir)) return [];
  const files = [];
  walk(pagesDir, files);
  return files
    .map((file) => {
      const { level, name } = readEntryMeta(file);
      return {
        route: routeOf(pagesDir, file),
        dir: toPosix(path.dirname(file)),
        entry: toPosix(file),
        level,
        // 页面别名（可选）：入口文件里的 `// @studio-name 系统表格页面`。
        name,
        isFrameworkProject: Boolean(frameworkSrc),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * 归集一个页面目录下的全部源码文件（供 AST 分析使用）。
 * 只取目录内一层，页面四件套都在同一层。
 */
export function collectPageFiles(pageDir) {
  let entries;
  try {
    entries = fs.readdirSync(pageDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && PAGE_EXTS.includes(path.extname(e.name)))
    .map((e) => ({
      file: toPosix(path.join(pageDir, e.name)),
      text: fs.readFileSync(path.join(pageDir, e.name), 'utf8'),
    }));
}

/** 在页面文件集合里按「相对 import 说明符」定位文件。 */
export function resolveLocal(spec, fromFile, files) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...PAGE_EXTS.map((ext) => `${base}${ext}`),
    ...PAGE_EXTS.map((ext) => path.join(base, `index${ext}`)),
  ].map(toPosix);
  return files.find((f) => candidates.includes(f.file)) ?? null;
}

/** 按 basename 找声明文件（data / view / handler）。 */
export function findDeclarationFile(files, base) {
  return (
    files.find((f) => {
      const name = path.basename(f.file, path.extname(f.file));
      return name === base;
    }) ?? null
  );
}

export { DECLARATION_BASENAMES, PAGE_EXTS };
