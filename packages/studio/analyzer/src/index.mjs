#!/usr/bin/env node
/**
 * FrontArk Studio —— 静态分析 sidecar 入口。
 *
 * 协议：JSON-RPC 2.0 over stdio（NDJSON）。stdout 只走协议，日志走 stderr。
 * 职责：TS AST 解析、语义模型、无损编辑计划、枚举/标签元数据、主题 token。
 * 权限：**不写任何文件**；源码内容由 Go 侧读好后传入。
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { log, startRpcServer } from './rpc.mjs';
import { probeProject } from './probe.mjs';
import { listPages, collectPageFiles, findDeclarationFile } from './pages.mjs';
import { analyzePage } from './analyze.mjs';
import { planEdit, PlanError } from './edit.mjs';
import { extractEnums, extractHandlerBaseMethods } from './enums.mjs';
import { parseTheme, planThemeSet, validateTheme } from './theme.mjs';
import { candidatesFor, pageTemplates, viewTemplate, dataTemplate } from './templates.mjs';
import { toPosix } from './fsutil.mjs';

const require = createRequire(import.meta.url);
const VERSION = '0.1.0';

/** 读取共享标签表（框架字段名 → 中文）。 */
function loadLabels() {
  try {
    const file = new URL('../../shared/labels.json', import.meta.url);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('$')) continue;
      out[k] = v;
    }
    return out;
  } catch (err) {
    log(`读取 labels.json 失败，使用空表：${err.message}`);
    return {};
  }
}

const LABELS = loadLabels();
let tsVersion = 'unknown';
try {
  tsVersion = require('typescript').version;
} catch {
  /* ignore */
}

function withEnums(params) {
  const frameworkSrc = params.frameworkSrc;
  const { enums, missing } = extractEnums({ frameworkSrc });
  return { enums, missing, labels: LABELS };
}

const handlers = {
  /** 项目探测（这里会读目标目录，属于受控的只读枚举）。 */
  'project.probe': (params) => {
    const profile = probeProject(params);
    const pages = listPages({ pagesDir: profile.source.pagesDir, frameworkSrc: profile.source.frameworkSrc });
    const { enums, missing } = extractEnums({ frameworkSrc: profile.source.frameworkSrc });
    return { profile, pages, enums, enumMissing: missing, labels: LABELS, tsVersion };
  },

  'pages.list': (params) => {
    const pages = listPages({ pagesDir: params.pagesDir, frameworkSrc: params.frameworkSrc });
    return { pages };
  },

  /** 页面完整语义模型。files 由 Go 读好后传入，保证分析基于当前磁盘内容。 */
  'page.analyze': (params) => {
    const files = params.files ?? [];
    const meta = withEnums(params);
    const result = analyzePage({
      project: params.project,
      route: params.route,
      files,
      labels: LABELS,
      enums: meta.enums,
      // 传框架基类方法：ST006 才能区分"来自基类的合法调用"与"方法名写错了"
      baseHandlerMethods: extractHandlerBaseMethods({ frameworkSrc: params.frameworkSrc }),
    });
    return { ...result, labels: LABELS, enums: meta.enums };
  },

  /** 生成编辑计划（返回字符区间，不落盘）。 */
  'edit.plan': (params) => {
    const files = params.files ?? [];
    const meta = withEnums(params);
    try {
      const plan = planEdit({
        project: params.project,
        route: params.route,
        files,
        op: params.op,
        labels: LABELS,
        enums: meta.enums,
      });
      return plan;
    } catch (err) {
      if (err instanceof PlanError) {
        return { error: { message: err.message, code: err.code } };
      }
      throw err;
    }
  },

  /** 主题 token 的解析与改写。 */
  'theme.parse': (params) => {
    const files = params.files ?? [];
    const parsed = parseTheme({ files });
    const { issues, checks } = validateTheme({ files: parsed.files });
    return { ...parsed, issues, checks };
  },

  'theme.plan': (params) => {
    try {
      return planThemeSet({
        files: params.files ?? [],
        file: params.file,
        selector: params.selector,
        token: params.token,
        value: params.value,
        occurrence: Number(params.occurrence ?? 0),
      });
    } catch (err) {
      return { error: { message: err.message, code: err.code ?? 'EPLAN' } };
    }
  },

  /** 元数据：枚举 + 标签（前端属性面板的下拉来源）。 */
  'meta.enums': (params) => withEnums(params),

  /** 可插入项清单（「+ 添加」菜单的数据来源）。 */
  'templates.list': (params) => {
    const key = params.containerKey ?? '';
    return { candidates: candidatesFor(key, Number(params.index ?? 0)) };
  },

  /** 新成员/新页面的代码模板。 */
  'templates.member': (params) => {
    if (params.memberKind === 'data') {
      return { text: dataTemplate({ memberName: params.memberName, id: params.id }) };
    }
    return { text: viewTemplate({ memberName: params.memberName, id: params.id }) };
  },

  'templates.page': (params) =>
    pageTemplates({ className: params.className ?? 'NewPage', relativeImport: params.relativeImport ?? '/demo/base/new' }),

  /** 归集页面目录内的源码文件（供 Go 读取后再回传）。 */
  'pages.files': (params) => {
    const files = collectPageFiles(params.pageDir);
    return { files: files.map((f) => toPosix(f.file)) };
  },

  'pages.findDeclaration': (params) => {
    const files = params.files ?? [];
    return { file: findDeclarationFile(files, params.base)?.file ?? null };
  },
};

startRpcServer(handlers, {
  name: '@jl/studio-analyzer',
  version: VERSION,
  onShutdown: () => log('收到 shutdown，退出'),
});
