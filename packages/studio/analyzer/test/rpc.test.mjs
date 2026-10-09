/**
 * Analyzer 单元测试（`node --test`）。
 *
 * 与 smoke.mjs 的分工：
 *   - smoke.mjs 跑真实工程（apps/demo），是端到端联调；
 *   - 本文件用**内联 fixture**，不依赖任何外部目录，所以能在 CI / 干净机器上跑。
 *
 * 重点覆盖那些「一旦错了就悄悄改坏源码」的路径：
 * 无损写回、引号风格、重复属性、对象展开降级、主题色空间。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contrastRatio, formatLikeTarget, parseColor, rgbToOklch, toHex } from '../src/color.mjs';
import { detectQuote, reindent, stringLiteral } from '../src/fsutil.mjs';
import { parseTheme, planThemeSet, validateTheme } from '../src/theme.mjs';
import { analyzePage } from '../src/analyze.mjs';
import { planEdit } from '../src/edit.mjs';

const PROJECT = {
  id: 'fixture',
  name: 'fixture',
  rootPath: '/proj',
  workspaceRoot: '/proj',
  source: { frameworkSrc: '' },
};

/** 一个最小但形态齐全的页面四件套。 */
function pageFiles(viewBody, dataBody = "class Data extends DataBase {\n  main = {\n    id: 'table' as const,\n    url: '/x',\n  } satisfies DataProps;\n}\n") {
  return [
    {
      file: '/proj/src/pages/p/index.tsx',
      text: "import { ViewRoot } from '@jl/framework';\nimport Data from './data';\nimport Handler from './handler';\nimport VType from './view';\nconst P = () => <ViewRoot ViewClass={VType} DataClass={Data} HandlerClass={Handler} />;\nexport default P;\n",
    },
    { file: '/proj/src/pages/p/view.tsx', text: viewBody },
    { file: '/proj/src/pages/p/data.tsx', text: dataBody },
    {
      file: '/proj/src/pages/p/handler.ts',
      text: "import { HandlerBase } from '@jl/framework';\nclass Handler extends HandlerBase {\n  onPick = () => {\n    this.getSelectedKeys('table1');\n  };\n}\nexport default Handler;\n",
    },
  ];
}

const VIEW_PLAIN = `import { Ctrl, DataBase, VType, VProps, ViewBase, type DataProps } from '@jl/framework';
class View extends ViewBase<any, any> {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    dataId: this.data.main.id,
    renderMode: 'record',
    items: [
      // 第一列
      { title: '产品名称', field: 'name' },
      { title: '价格', field: 'price', width: 120 },
    ],
  };
  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    gutter: 12,
    items: [this.table1.id],
  };
  getRootId = () => this.layout.id;
}
export default View;
`;

// ── 无损写回 ────────────────────────────────────────────────────────

test('标量编辑：只改目标区间，行数不变', () => {
  const files = pageFiles(VIEW_PLAIN);
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files,
    op: { kind: 'set', target: 'view.table1.items[1].title', value: '单价' },
  });
  assert.equal(res.files.length, 1);
  const next = res.files[0].nextText;
  assert.ok(next.includes("title: '单价'"));
  assert.ok(next.includes("// 第一列"), '注释必须保留');
  assert.equal(next.split('\n').length, VIEW_PLAIN.split('\n').length, '行数不变');
  assert.equal(res.files[0].edits.length, 1, '只产生一处区间替换');
});

test('引号风格：沿用被替换字面量自己的引号，而不是附近多数派', () => {
  // 文件里绝大多数是单引号，但目标字段本身用双引号
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    items: [{ title: "双引号标题", field: 'a' }, { title: 'x', field: 'b' }],
  };
  getRootId = () => 't';
}
export default View;
`;
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files: pageFiles(view),
    op: { kind: 'set', target: 'view.t.items[0].title', value: '新标题' },
  });
  assert.ok(res.files[0].nextText.includes('title: "新标题"'), '应保留双引号');
});

test('detectQuote / stringLiteral 的基本行为', () => {
  assert.equal(detectQuote('const a = 1;', -1, "'x'"), "'", '有原字面量时以它为准');
  assert.equal(detectQuote('const a = 1;', -1, '"x"'), '"');
  assert.equal(detectQuote("a: 'x', b: 'y'"), "'", '没有原字面量时退回多数派');
  assert.equal(stringLiteral('带\'引号', 'x', -1, "'old'"), "'带\\'引号'");
});

test('reindent 接受 EOL 参数（CRLF 文件不混入 LF）', () => {
  const out = reindent('    a: 1,\n    b: 2,', '  ', '\r\n');
  assert.equal(out, '  a: 1,\r\n  b: 2,');
});

// ── 数组操作 ────────────────────────────────────────────────────────

test('删除数组项：连同注释一起移除，不留空行', () => {
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files: pageFiles(VIEW_PLAIN),
    op: { kind: 'delete-array-item', target: 'view.table1.items', index: 1 },
  });
  const next = res.files[0].nextText;
  assert.ok(!next.includes('price'), '被删的列应消失');
  assert.ok(next.includes('// 第一列'), '未删列的注释保留');
  assert.ok(!/\n\s*\n\s*\]/.test(next), '不留空行');
  assert.ok(next.split('\n').length < VIEW_PLAIN.split('\n').length);
});

test('数组重排：只搬运、不重排整段（不新增尾逗号）', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    items: [{ title: 'A', field: 'a' }, { title: 'B', field: 'b' }],
  };
  getRootId = () => 't';
}
export default View;
`;
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files: pageFiles(view),
    op: { kind: 'move-array-item', target: 'view.t.items', from: 0, to: 1 },
  });
  const next = res.files[0].nextText;
  const itemsLine = next.split('\n').find((l) => l.includes('items: ['));
  assert.ok(itemsLine, '数组仍在一行内');
  assert.ok(itemsLine.includes("{ title: 'B', field: 'b' }") && itemsLine.includes("{ title: 'A', field: 'a' }"));
  assert.ok(itemsLine.indexOf("'B'") < itemsLine.indexOf("'A'"), 'B 应排到 A 前面');
  assert.ok(!itemsLine.includes(',]'), '不引入尾逗号');
});

test('多行数组重排：保持缩进与元素内容不变', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    items: [
      { title: 'A', field: 'a' },
      { title: 'B', field: 'b' },
      { title: 'C', field: 'c' },
    ],
  };
  getRootId = () => 't';
}
export default View;
`;
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files: pageFiles(view),
    op: { kind: 'move-array-item', target: 'view.t.items', from: 2, to: 0 },
  });
  const next = res.files[0].nextText;
  const idxA = next.indexOf("title: 'A'");
  const idxB = next.indexOf("title: 'B'");
  const idxC = next.indexOf("title: 'C'");
  assert.ok(idxC < idxA && idxA < idxB, 'C 应到最前');
  assert.equal(next.split('\n').length, view.split('\n').length, '行数不变');
});

// ── 语义安全性 ──────────────────────────────────────────────────────

test('重复属性名：取最后一个（JS 语义），且两个节点的 id 不同', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 'first',
    id: 'second',
    type: VType.Table,
    items: [],
  };
  getRootId = () => 't';
}
export default View;
`;
  const analysis = analyzePage({ project: PROJECT, route: '/p', files: pageFiles(view), labels: {}, enums: {} });
  const viewNode = analysis.nodes.find((n) => n.id === 'view.t');
  assert.equal(viewNode.declaredId, 'second', '应取最后一个 id');
  const ids = analysis.nodes.filter((n) => n.parentId === 'view.t').map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, '同名属性的节点 id 不能撞车');
});

test('对象展开：被展开覆盖的属性降级为只读，之前的属性保持可编辑', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
const base = { type: VType.Table };
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 'shadowed',
    ...base,
    items: [],
  };
  getRootId = () => 't';
}
export default View;
`;
  const analysis = analyzePage({ project: PROJECT, route: '/p', files: pageFiles(view), labels: {}, enums: {} });
  const idNode = analysis.nodes.find((n) => n.id === 'view.t.id');
  assert.equal(idNode.editability, 'sourceOnly', '展开之后被覆盖的 id 必须只读');
  assert.equal(analysis.page.viewMembers.t.id, null, '运行时 id 无法静态确定，不应给出值');

  const beforeView = `import { VType, VProps, ViewBase } from '@jl/framework';
const base = { x: 1 };
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    ...base,
    id: 'safe',
    type: VType.Table,
    items: [],
  };
  getRootId = () => 't';
}
export default View;
`;
  const a2 = analyzePage({ project: PROJECT, route: '/p', files: pageFiles(beforeView), labels: {}, enums: {} });
  assert.equal(a2.nodes.find((n) => n.id === 'view.t.id').editability, 'literal', '展开之前的属性不受影响');
});

test('对象展开的容器：拒绝新增属性', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
const base = { x: 1 };
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    ...base,
    id: 't1',
    items: [],
  };
  getRootId = () => 't';
}
export default View;
`;
  assert.throws(
    () =>
      planEdit({
        project: PROJECT,
        route: '/p',
        files: pageFiles(view),
        op: { kind: 'insert-prop', target: 'view.t', key: 'zzz', text: '1' },
      }),
    /展开/,
  );
});

test('语法错误：整份文件降级只读并给出 ST102', () => {
  const broken = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 't1',
    items: [{ title: 'a', field: 'a' }
  };
}
export default View;
`;
  const analysis = analyzePage({ project: PROJECT, route: '/p', files: pageFiles(broken), labels: {}, enums: {} });
  assert.ok((analysis.page.syntaxIssues ?? []).length > 0, '应报出语法错误');
  assert.ok(analysis.issues.some((i) => i.code === 'ST102'));
  const writable = analysis.nodes.filter(
    (n) => n.file.endsWith('view.tsx') && n.editability !== 'sourceOnly',
  );
  assert.equal(writable.length, 0, '语法错误的文件里不应再有可写节点');
});

test('Handler 基类方法只告警、不报错（ST006 不再假阳性）', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  t: VProps.Table = {
    id: 't1',
    type: VType.Table,
    dataId: this.data.main.id,
    items: [{ title: 'a', field: 'a', ctrl: { type: 'TEXT' }, onX: this.handler.onFromBase }],
  };
  getRootId = () => 't';
}
export default View;
`;
  const analysis = analyzePage({ project: PROJECT, route: '/p', files: pageFiles(view), labels: {}, enums: {} });
  const st006 = analysis.issues.filter((i) => i.code === 'ST006');
  assert.ok(st006.every((i) => i.level === 'warning'), 'ST006 必须是 warning');
});

test('未覆盖清单：同名标识符无法归因时被列出来（供前端强制确认）', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
const table1 = 'local-variable-not-a-member';
class View extends ViewBase<any, any> {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    items: [],
  };
  getRootId = () => 't';
}
export default View;
`;
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files: pageFiles(view),
    op: { kind: 'rename-member', memberKind: 'view', from: 'table1', to: 'gridTable' },
  });
  assert.ok(res.uncovered && res.uncovered.length > 0, '局部的同名标识符必须进未覆盖清单');
  assert.ok(res.uncovered.every((u) => u.file && u.line > 0 && u.column > 0));
  // 已归因的那些照常生成编辑
  assert.ok(res.files.length > 0);
  assert.ok(res.files[0].nextText.includes('gridTable: VProps.Table'));
});

test('未覆盖清单：全部可归因时为空（正常页面不该被拦）', () => {
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files: pageFiles(VIEW_PLAIN),
    op: { kind: 'rename-member', memberKind: 'view', from: 'table1', to: 'gridTable' },
  });
  assert.equal((res.uncovered ?? []).length, 0, '完整覆盖时不应有未覆盖项');
});

// ── 主题 ────────────────────────────────────────────────────────────

test('颜色：OKLCH ⇄ HEX 往返，且写回沿用目标色空间', () => {
  const black = parseColor('oklch(0.145 0 0)');
  assert.ok(black);
  assert.equal(toHex(black), '#0a0a0a');

  // 从 hex 出发转成 OKLCH，再转回来应还原
  const gray = parseColor('#0a0a0a');
  const back = rgbToOklch(gray);
  assert.ok(Math.abs(back.L - 0.145) < 0.01, `OKLCH 往返误差应很小（实际 ${back.L}）`);
  assert.equal(toHex(parseColor(`oklch(${back.L} ${back.C} ${back.H})`)), '#0a0a0a');

  const formatted = formatLikeTarget('#1b3a57', 'oklch(0.145 0 0)');
  assert.ok(formatted.startsWith('oklch('), 'oklch token 收到 HEX 必须转回 oklch');
  assert.equal(formatLikeTarget('oklch(0.5 0.1 200)', '#ffffff'), '#00747a', 'hex token 收到 oklch 应转成 hex');
  assert.equal(formatLikeTarget('var(--x)', 'oklch(0.145 0 0)'), 'var(--x)', '无法求值的值原样返回');
});

test('对比度：黑白为 21:1', () => {
  assert.equal(contrastRatio(parseColor('#000'), parseColor('#fff')), 21);
  assert.equal(contrastRatio(parseColor('nope'), parseColor('#fff')), null);
});

const THEME_CSS = `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.98 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --accent: nope;
  --ring: oklch(0.7 0 0);
  --ring: oklch(0.8 0 0);
}
`;

test('主题解析：同名 token 的 occurrence 正确，且能精确改第 2 处', () => {
  const parsed = parseTheme({ files: [{ file: 'a.css', text: THEME_CSS }] });
  const rings = parsed.files[0].tokens.filter((t) => t.token === 'ring');
  assert.equal(rings.length, 2, '两处都要出现在列表里');
  assert.deepEqual(rings.map((r) => r.occurrence), [0, 1]);
  assert.ok(rings.every((r) => r.duplicate));

  const plan = planThemeSet({
    files: [{ file: 'a.css', text: THEME_CSS }],
    file: 'a.css',
    selector: ':root',
    token: 'ring',
    value: '#123456',
    occurrence: 1,
  });
  assert.equal(plan.files[0].edits.length, 1);
  assert.ok(plan.files[0].nextText.includes('--ring: oklch(0.7 0 0)'), '第 1 处不动');
  assert.ok(!plan.files[0].nextText.includes('--ring: oklch(0.8 0 0)'), '第 2 处被改写');
});

test('主题校验：各类问题用各自独立的诊断码', () => {
  const parsed = parseTheme({ files: [{ file: 'a.css', text: THEME_CSS }] });
  const { issues, checks } = validateTheme({ files: parsed.files });
  // 码必须分开：面板要按类别过滤/豁免，全塞进一个 ST008 就分不出来了
  assert.ok(issues.some((i) => i.code === 'ST008' && i.level === 'error' && /accent/.test(i.message)), '非法颜色 → ST008');
  assert.ok(issues.some((i) => i.code === 'ST013' && /重复声明/.test(i.message)), '重复声明 → ST013');
  assert.ok(issues.some((i) => i.code === 'ST015' && /对比度/.test(i.message)), '对比度不足 → ST015');
  const fgBg = checks.find((c) => c.fg === 'foreground' && c.bg === 'background');
  assert.ok(fgBg && fgBg.ratio < 1.5 && fgBg.level === 'fail', '近白底上的近白字应判定为不合格');
});

test('主题校验：缺少必需 token 报 ST014', () => {
  const parsed = parseTheme({ files: [{ file: 'a.css', text: ':root {\n  --background: #fff;\n}\n' }] });
  const { issues } = validateTheme({ files: parsed.files });
  assert.ok(issues.some((i) => i.code === 'ST014' && /缺少必需的 token --foreground/.test(i.message)));
});

test('主题校验：深色模式沿用 :root 里未覆盖的 token 做对比度', () => {
  // `.dark` 只覆盖 --background、--foreground 仍来自 :root —— 这是最常见的写法。
  // 早期实现只在当前选择器块内配对，会把整条检查跳过，深色对比度成了永远的盲区。
  const css = `:root {
  --background: #ffffff;
  --foreground: #111111;
}
.dark {
  --background: #fefefe;
}
`;
  const parsed = parseTheme({ files: [{ file: 'dark.css', text: css }] });
  const { checks, issues } = validateTheme({ files: parsed.files });
  const dark = checks.find((c) => c.selector === '.dark' && c.fg === 'foreground' && c.bg === 'background');
  assert.ok(dark, '.dark 的 foreground/background 必须被检查（foreground 继承自 :root）');
  assert.equal(dark.bgValue, '#fefefe', '背景取 .dark 自己的声明');
  assert.equal(dark.fgValue, '#111111', '前景回退到 :root 的值');
  assert.ok(dark.level === 'pass', '黑字浅底应达标');
  assert.ok(!issues.some((i) => i.code === 'ST015' && /\.dark/.test(i.message)), '达标的不该误报');
});

// ── 撤销安全：Switch 的扩展名/目录校验 ──────────────────────────────

test('编辑计划会带基线 SHA 与锚点 hash', () => {
  const files = pageFiles(VIEW_PLAIN);
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files,
    op: { kind: 'set', target: 'view.table1.items[0].title', value: 'X' },
  });
  assert.ok(res.files[0].nextText);
  assert.ok(res.impacts[0].before.includes('产品名称'));

  const analysis = analyzePage({ project: PROJECT, route: '/p', files, labels: {}, enums: {} });
  const node = analysis.nodes.find((n) => n.id === 'view.table1.items[0].title');
  assert.ok(node.anchor.hash && node.anchor.hash.length === 40, '锚点必须带 sha1');
});

// ── 漂移校验：用户看到的节点 vs 当前源码 ─────────────────────────────

test('识别分级：正常装配的页面是 L1，转发壳是 L3、普通 React 页面是 L2', () => {
  const l1 = analyzePage({ project: PROJECT, route: '/p', files: pageFiles(VIEW_PLAIN), labels: {}, enums: {} });
  assert.equal(l1.page.level, 'L1');

  // 重导出：真正的内容在另一个文件里
  const shell = pageFiles(VIEW_PLAIN);
  shell[0] = { file: shell[0].file, text: "export { default } from './impl';\n" };
  const l3 = analyzePage({ project: PROJECT, route: '/p', files: shell, labels: {}, enums: {} });
  assert.equal(l3.page.level, 'L3', '转发壳必须降到 L3');
  assert.ok(l3.issues.some((i) => i.code === 'ST103'));

  // 普通 React 页面：有默认导出，但不是框架装配
  const plain = pageFiles(VIEW_PLAIN);
  plain[0] = {
    file: plain[0].file,
    text: "import { useState } from 'react';\nconst P = () => {\n  const [n] = useState(0);\n  return <div>{n}</div>;\n};\nexport default P;\n",
  };
  const l2 = analyzePage({ project: PROJECT, route: '/p', files: plain, labels: {}, enums: {} });
  assert.equal(l2.page.level, 'L2', '只是没用 ViewRoot 的普通页面应留在 L2');
});

test('ST006：查得到框架基类时，基类方法不报错、写错的方法名才报 error', () => {
  const view = `import { VType, VProps, ViewBase } from '@jl/framework';
class View extends ViewBase<any, any> {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    items: [],
    onClick: this.handler.getData,
    onOther: this.handler.onTypo,
  };
  getRootId = () => 'table1';
}
export default View;
`;
  const files = pageFiles(view);
  // 本类里只有 onBase：getData 来自基类，onTypo 谁都没有
  files[3] = {
    file: files[3].file,
    text: "import { HandlerBase } from '@jl/framework';\nclass Handler extends HandlerBase {\n  onBase = () => {};\n}\nexport default Handler;\n",
  };

  const withoutBase = analyzePage({ project: PROJECT, route: '/p', files, labels: {}, enums: {} });
  const s6a = withoutBase.issues.filter((i) => i.code === 'ST006');
  assert.ok(s6a.length > 0);
  assert.ok(s6a.every((i) => i.level === 'warning'), '拿不到基类清单时只能 warning（宁可漏报不可误报）');

  const withBase = analyzePage({
    project: PROJECT,
    route: '/p',
    files,
    labels: {},
    enums: {},
    baseHandlerMethods: new Set(['getData', 'setData', 'post']),
  });
  const s6b = withBase.issues.filter((i) => i.code === 'ST006');
  assert.equal(s6b.length, 1, '只有 onTypo 该被报出来（getData 在基类上）');
  assert.equal(s6b[0].level, 'error', '确认为不存在的方法时才升级为 error');
  assert.ok(/onTypo/.test(s6b[0].message));
});

test('漂移校验：anchorHash 与当前源码一致时正常放行', () => {
  const files = pageFiles(VIEW_PLAIN);
  const analysis = analyzePage({ project: PROJECT, route: '/p', files, labels: {}, enums: {} });
  const hash = analysis.nodes.find((n) => n.id === 'view.table1.items[0].title').anchor.hash;

  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files,
    op: { kind: 'set', target: 'view.table1.items[0].title', value: 'X', anchorHash: hash },
  });
  assert.ok(res.files[0].nextText.includes("title: 'X'"));
});

test('漂移校验：提交前文件被外部改过 → 拒绝并给出 EANCHOR', () => {
  const files = pageFiles(VIEW_PLAIN);
  const analysis = analyzePage({ project: PROJECT, route: '/p', files, labels: {}, enums: {} });
  const staleHash = analysis.nodes.find((n) => n.id === 'view.table1.items[0].title').anchor.hash;

  // 模拟：用户加载完分析结果之后、提交之前，外部编辑器把这一列的文字改掉了。
  // nodeId 仍然是同一个（items[0].title），所以没有这道校验就会"改到看起来对的位置"。
  const changed = pageFiles(VIEW_PLAIN.replace("title: '产品名称'", "title: '商品名称'"));

  let thrown = null;
  try {
    planEdit({
      project: PROJECT,
      route: '/p',
      files: changed,
      op: { kind: 'set', target: 'view.table1.items[0].title', value: 'X', anchorHash: staleHash },
    });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, '锚点漂移必须拒绝生成计划');
  assert.equal(thrown.code, 'EANCHOR');
  assert.ok(/已被外部修改/.test(thrown.message));
});

test('漂移校验：不带 anchorHash 时不阻断（结构性操作 / 老客户端）', () => {
  const files = pageFiles(VIEW_PLAIN);
  const res = planEdit({
    project: PROJECT,
    route: '/p',
    files,
    op: { kind: 'set', target: 'view.table1.items[0].title', value: 'X' },
  });
  assert.ok(res.files[0].nextText.includes("title: 'X'"));
});
