/**
 * 项目探测：把一个目录变成可编辑的 ProjectProfile。
 *
 * 只做**静态**识别 —— 不 import 业务模块、不启动应用、不请求接口。
 */
import fs from 'node:fs';
import path from 'node:path';
import { stripJsonc, toPosix } from './fsutil.mjs';

/** 从 start 开始向上查找满足谓词的目录。 */
function findUp(start, predicate, limit = 12) {
  let dir = path.resolve(start);
  for (let i = 0; i < limit; i += 1) {
    if (predicate(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readJsoncFile(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function pickTsconfig(rootPath) {
  const candidates = [
    'tsconfig.app.json',
    'tsconfig.json',
    'tsconfig.web.json',
    'tsconfig.base.json',
  ];
  for (const name of candidates) {
    const file = path.join(rootPath, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** 收集 tsconfig（含 extends 链）里的 paths 别名 → 绝对路径。 */
function collectAliases(rootPath) {
  const aliases = {};
  const visited = new Set();

  const walk = (file, depth) => {
    if (!file || depth > 5 || visited.has(file)) return;
    visited.add(file);
    const json = readJsoncFile(file);
    if (!json) return;
    if (json.extends) {
      const target = json.extends.startsWith('.')
        ? path.resolve(path.dirname(file), json.extends)
        : null;
      if (target) {
        for (const cand of [target, `${target}.json`]) {
          if (fs.existsSync(cand)) {
            walk(cand, depth + 1);
            break;
          }
        }
      }
    }
    const paths = json.compilerOptions?.paths;
    const baseUrl = json.compilerOptions?.baseUrl;
    const baseDir = baseUrl ? path.resolve(path.dirname(file), baseUrl) : path.dirname(file);
    if (paths) {
      for (const [key, targets] of Object.entries(paths)) {
        const first = Array.isArray(targets) ? targets[0] : targets;
        if (typeof first !== 'string') continue;
        const alias = key.replace(/\/\*$/, '');
        aliases[alias] = toPosix(path.resolve(baseDir, first.replace(/\/\*$/, '')));
      }
    }
  };

  walk(pickTsconfig(rootPath), 0);
  return aliases;
}

/**
 * 按 Vite 的覆盖顺序合并 .env 家族的全部键：
 *   .env < .env.local < .env.[mode] < .env.[mode].local
 * 只做「单行 KEY=VALUE」的静态解析，不解释变量展开（那需要求值，本项目不做）。
 */
function readEnv(rootPath, mode = 'dev') {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
  const out = {};
  const sources = {};
  for (const name of files) {
    const file = path.join(rootPath, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '').trim();
      out[m[1]] = value;
      sources[m[1]] = name;
    }
  }
  return { env: out, envSources: sources };
}

/** 从 vite.config 静态识别 dev server 端口（只认字面量，不做求值）。 */
function readDevPort(rootPath) {
  const candidates = ['vite.config.ts', 'vite.config.js', 'vite.config.mts'];
  for (const name of candidates) {
    const file = path.join(rootPath, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(/port\s*:\s*(?:isDesktop\s*\?\s*\d+\s*:\s*)?Number\([^)]*\)\s*\|\|\s*(\d+)/);
    if (m) return Number(m[1]);
    const m2 = text.match(/port\s*:\s*(\d{3,5})/);
    if (m2) return Number(m2[1]);
  }
  return null;
}

/**
 * 探测项目。
 * @param {{ rootPath: string, overrides?: any }} params
 */
export function probeProject({ rootPath, overrides = {} }) {
  const abs = path.resolve(rootPath);
  const notes = [];
  const warnings = [];

  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    const err = new Error(`目录不存在：${abs}`);
    err.code = 'ENOTDIR';
    throw err;
  }

  const pkgFile = path.join(abs, 'package.json');
  const pkg = readJsoncFile(pkgFile);
  if (!pkg) {
    const err = new Error(`目标目录没有可解析的 package.json：${abs}`);
    err.code = 'ENOPKG';
    throw err;
  }

  const workspaceRoot =
    findUp(abs, (dir) => fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) ??
    findUp(abs, (dir) => {
      const p = readJsoncFile(path.join(dir, 'package.json'));
      return Boolean(p?.workspaces);
    }) ??
    abs;
  if (workspaceRoot === abs) warnings.push('未在上层找到 monorepo 根（pnpm-workspace.yaml / workspaces）。');

  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const hasFramework = Object.keys(allDeps).includes('@jl/framework');

  const aliases = { ...collectAliases(abs), ...(overrides.aliases ?? {}) };

  // @jl/framework 的源码位置：优先别名，其次 workspace 里的 packages/framework/src
  let frameworkSrc =
    aliases['@jl/framework'] ?? overrides.frameworkAliasTo ?? null;
  if (!frameworkSrc || !fs.existsSync(frameworkSrc)) {
    const guess = path.join(workspaceRoot, 'packages', 'framework', 'src');
    if (fs.existsSync(guess)) frameworkSrc = toPosix(guess);
  }

  const pagesDir = path.resolve(abs, overrides.pagesDir ?? 'src', );
  const pagesDirFinal = fs.existsSync(path.join(pagesDir, 'pages'))
    ? path.join(pagesDir, 'pages')
    : fs.existsSync(path.join(abs, 'src', 'pages'))
      ? path.join(abs, 'src', 'pages')
      : pagesDir;

  const { env, envSources } = readEnv(abs, overrides.mode ?? 'dev');
  const mockBaseUrl = overrides.mockBaseUrl ?? env.VITE_BASE_URL ?? null;
  // 端口优先级：显式覆盖 > .env 里的 VITE_SERVER_PORT > vite.config 里的字面量。
  //
  // 之所以把 .env 排在 vite.config 前面：dev 脚本是 `vite --mode dev`，真正的端口
  // 来自 .env.dev 的 VITE_SERVER_PORT；vite.config 里那个 `|| 3000` 只是兜底，
  // 直接读它会把端口认成 3000（那是 .env.production 的口径）。
  const envPort = Number(env.VITE_SERVER_PORT);
  const devPort =
    overrides.devServer?.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : readDevPort(abs));

  let kind = 'unknown';
  if (hasFramework && fs.existsSync(pagesDirFinal)) kind = 'frontark';
  else if (fs.existsSync(pagesDirFinal)) kind = 'react';

  if (!hasFramework) {
    warnings.push('目标项目未声明 @jl/framework 依赖；结构编辑能力将被禁用（仅只读浏览）。');
  }
  if (!fs.existsSync(pagesDirFinal)) {
    warnings.push(`未找到页面目录：${toPosix(pagesDirFinal)}`);
  }

  // 主题文件：框架 token + 项目自身的样式入口
  const themeFiles = [];
  if (frameworkSrc) {
    const themeCss = path.join(path.dirname(frameworkSrc), 'src', 'ui', 'styles', 'theme.css');
    if (fs.existsSync(themeCss)) themeFiles.push(toPosix(themeCss));
    // frameworkSrc 本身可能已经指向 .../packages/framework/src
    const themeCss2 = path.join(frameworkSrc, 'ui', 'styles', 'theme.css');
    if (fs.existsSync(themeCss2) && !themeFiles.includes(toPosix(themeCss2))) {
      themeFiles.push(toPosix(themeCss2));
    }
  }
  const appCss = path.join(abs, 'src', 'index.css');
  if (fs.existsSync(appCss)) themeFiles.push(toPosix(appCss));
  for (const extra of overrides.themeFiles ?? []) themeFiles.push(toPosix(extra));

  notes.push(`页面目录：${toPosix(pagesDirFinal)}`);

  return {
    id: overrides.id ?? slug(abs),
    name: overrides.name ?? pkg.name ?? path.basename(abs),
    packageName: pkg.name ?? null,
    rootPath: toPosix(abs),
    workspaceRoot: toPosix(workspaceRoot),
    kind,
    hasFramework,
    source: {
      pagesDir: toPosix(pagesDirFinal),
      aliases,
      frameworkSrc,
      devPort,
      mockBaseUrl,
      // 预览宿主会把这份 env 注入到目标页面的 import.meta.env 访问点
      env,
      envSources,
    },
    themeFiles: [...new Set(themeFiles)],
    notes,
    warnings,
  };
}

function slug(p) {
  const parts = toPosix(p).split('/').filter(Boolean);
  return parts.slice(-2).join('-').toLowerCase().replace(/[^\w-]+/g, '-');
}
