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

/** 列出全部页面候选。 */
export function listPages({ pagesDir, frameworkSrc }) {
  if (!pagesDir || !fs.existsSync(pagesDir)) return [];
  const files = [];
  walk(pagesDir, files);
  return files
    .map((file) => ({
      route: routeOf(pagesDir, file),
      dir: toPosix(path.dirname(file)),
      entry: toPosix(file),
      isFrameworkProject: Boolean(frameworkSrc),
    }))
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
