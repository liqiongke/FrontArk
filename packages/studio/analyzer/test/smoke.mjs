/**
 * 冒烟脚本：不依赖 Go 服务，直接验证分析器与编辑计划。
 *
 *   node packages/studio/analyzer/test/smoke.mjs [目标项目路径] [路由]
 *
 * 只做只读分析 + 内存中的编辑计划（**不落盘**），用于开发期快速回归。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeProject } from '../src/probe.mjs';
import { listPages, collectPageFiles } from '../src/pages.mjs';
import { analyzePage } from '../src/analyze.mjs';
import { planEdit } from '../src/edit.mjs';
import { extractEnums } from '../src/enums.mjs';
import { parseTheme } from '../src/theme.mjs';
import { applyEdits } from '../src/fsutil.mjs';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '../../../../apps/demo');

const rootPath = process.argv[2] ?? defaultRoot;
const route = process.argv[3] ?? '/base/table';

let failed = 0;
function check(label, ok, extra = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failed += 1;
  console.log(`[${mark}] ${label}${extra ? ` — ${extra}` : ''}`);
}

console.log(`\n=== 探测项目 ===\n${rootPath}`);
const profile = probeProject({ rootPath });
const pages = listPages({ pagesDir: profile.source.pagesDir, frameworkSrc: profile.source.frameworkSrc });
console.log(`项目：${profile.name}（${profile.kind}）`);
console.log(`页面目录：${profile.source.pagesDir}`);
console.log(`框架源码：${profile.source.frameworkSrc}`);
console.log(`别名：${JSON.stringify(profile.source.aliases, null, 2)}`);
check('识别为 frontark 工程', profile.kind === 'frontark');
check('发现页面候选', pages.length > 0, `${pages.length} 个`);

const target = pages.find((p) => p.route === route);
check(`找到路由 ${route}`, Boolean(target), target?.entry ?? '');

const files = collectPageFiles(path.dirname(target.entry));
console.log(`页面文件：${files.map((f) => path.basename(f.file)).join(', ')}`);
check('四件套齐备', files.length >= 4, `${files.length} 个`);

const { enums } = extractEnums({ frameworkSrc: profile.source.frameworkSrc });
check('提取到 ViewType 枚举', Boolean(enums.ViewType), `${enums.ViewType?.members.length ?? 0} 个成员`);
console.log(
  `  ViewType → ${enums.ViewType?.members.map((m) => `${m.name}(${m.label})`).join(' / ')}`,
);

const analysis = analyzePage({ project: profile, route, files, enums, labels: {} });
check('页面识别级别为 L1', analysis.page?.level === 'L1', analysis.page?.level);
console.log(`视图成员：${Object.keys(analysis.page?.viewMembers ?? {}).join(', ')}`);
console.log(`数据成员：${Object.keys(analysis.page?.dataMembers ?? {}).join(', ')}`);
console.log(`rootId：${analysis.page?.rootId}`);
console.log(`节点总数：${analysis.nodes.length}`);
console.log(`引用总数：${analysis.refs?.length ?? 0}`);
console.log(`问题：\n${analysis.issues.map((i) => `  [${i.level}] ${i.code} ${i.message}`).join('\n') || '  （无）'}`);

const sampleIds = analysis.nodes
  .filter((n) => n.editability !== 'object' && n.editability !== 'array')
  .slice(0, 14)
  .map((n) => `${n.id} = ${JSON.stringify(n.value ?? n.expr)} <${n.editability}> @${path.basename(n.anchor?.file ?? '')}:${n.anchor?.line}`);
console.log(`\n节点样例：\n${sampleIds.map((s) => `  ${s}`).join('\n')}`);

// ── 编辑计划（内存） ──────────────────────────────────────────────
console.log('\n=== 编辑计划（不落盘）===');

const titleNode = analysis.nodes.find(
  (n) => n.id === 'view.table1.items[1].title' && n.editability === 'literal',
);
check('找到「产品名称」列标题节点', Boolean(titleNode), titleNode?.id ?? '');
if (titleNode) {
  const plan = planEdit({
    project: profile,
    route,
    files,
    op: { kind: 'set', target: titleNode.id, value: '产品名称X' },
  });
  const file = plan.files[0];
  const next = applyEdits(files.find((f) => f.file === file.file).text, file.edits);
  const changedLines = next.split('\n').length - files.find((f) => f.file === file.file).text.split('\n').length;
  check('生成单文件单点编辑', plan.files.length === 1 && plan.files[0].edits.length === 1);
  check('行数不变（无损写回）', changedLines === 0, `Δ${changedLines}`);
  const diff = file.edits[0];
  console.log(`  before: ${diff.newText === undefined ? '' : ''}${JSON.stringify(plan.impacts[0].before)}`);
  console.log(`  after : ${JSON.stringify(plan.impacts[0].after)}`);
}

// 枚举引用改写
const renderMode = analysis.nodes.find((n) => n.id === 'view.table1.renderMode');
if (renderMode) {
  const plan = planEdit({
    project: profile,
    route,
    files,
    op: { kind: 'set-ref', target: renderMode.id, ref: 'RenderMode.Record' },
  });
  check('枚举引用改写成功', plan.files.length === 1, plan.impacts?.[0]?.after ?? plan.error?.message ?? '');
}

// 插入列
const itemsArray = analysis.nodes.find((n) => n.id === 'view.table1.items');
if (itemsArray) {
  const plan = planEdit({
    project: profile,
    route,
    files,
    op: {
      kind: 'insert-array-item',
      target: itemsArray.id,
      text: "{ title: '备注', field: 'remark' }",
    },
  });
  const file = plan.files[0];
  if (file) {
    const source = files.find((f) => f.file === file.file).text;
    const next = applyEdits(source, file.edits);
    check('插入后仍是合法 TS', plan.files.length === 1);
    const added = next.split('\n').length - source.split('\n').length;
    check('插入新增 1 行', added === 1, `Δ${added}`);
  } else {
    check('插入列', false, plan.error?.message ?? '无编辑');
  }
}

// 删除列
if (itemsArray) {
  const plan = planEdit({
    project: profile,
    route,
    files,
    op: { kind: 'delete-array-item', target: itemsArray.id, index: 9 },
  });
  const file = plan.files[0];
  if (file) {
    const source = files.find((f) => f.file === file.file).text;
    const next = applyEdits(source, file.edits);
    check('删除列后行数减 1', source.split('\n').length - next.split('\n').length === 1);
  } else {
    check('删除列', false, plan.error?.message ?? '无编辑');
  }
}

// 语义重命名
const rename = planEdit({
  project: profile,
  route,
  files,
  op: { kind: 'rename-member', memberKind: 'view', from: 'table1', to: 'mainTable' },
});
if (rename.files) {
  const total = rename.files.reduce((sum, f) => sum + f.edits.length, 0);
  check('重命名生成多处编辑', total > 0, `${total} 处，涉及 ${rename.files.length} 个文件`);
  console.log(`  影响：\n${rename.impacts.map((i) => `    ${i.label ?? ''} ${JSON.stringify(i.before)} → ${JSON.stringify(i.after)}`).join('\n')}`);
  if (rename.uncovered?.length) {
    console.log(`  未覆盖标识符 ${rename.uncovered.length} 处（需人工复核）`);
  }
  const renamed = new Map();
  for (const f of rename.files) {
    const source = files.find((x) => x.file === f.file).text;
    renamed.set(f.file, applyEdits(source, f.edits));
  }
  const viewNext = renamed.get(path.join(target.dir, 'view.tsx').replace(/\\/g, '/')) ?? '';
  const handlerNext = renamed.get(path.join(target.dir, 'handler.ts').replace(/\\/g, '/')) ?? '';
  check('重命名后出现 this.mainTable.id', viewNext.includes('this.mainTable.id'));
  check('未产生 this.table1.mainTable 这类破坏', !viewNext.includes('this.table1.mainTable'));
  check('重命名后不再残留 table1 标识符', !/[\w.]table1\b/.test(viewNext));
  check('handler 里的字符串引用同步更新', handlerNext.includes("getSelectedKeys('mainTable')"));
  check('@Active 路径同步更新', handlerNext.includes("'@Active:mainTable'"));
} else {
  check('语义重命名', false, rename.error?.message ?? '');
}

// 主题
const themeFiles = profile.themeFiles
  .filter((f) => fs.existsSync(f))
  .map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
const theme = parseTheme({ files: themeFiles });
const rootTokens = theme.files[0]?.tokens.filter((t) => t.selector === ':root').length ?? 0;
check('解析主题 token', rootTokens > 10, `:root 下 ${rootTokens} 个`);

console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}\n`);
process.exit(failed === 0 ? 0 : 1);
