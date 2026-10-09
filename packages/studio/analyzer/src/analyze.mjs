/**
 * 页面语义分析：TS AST → 可视化中台使用的语义节点树。
 *
 * 设计要点（对应设计文档 §5.2）：
 * - 节点 id 采用**可重导出的地址**（view.table1.items[2].title），
 *   因为 sidecar 是无状态的，每次编辑都要从当前文本重新推导同一个地址；
 * - 每个节点的 anchor 记录**值表达式的字符区间**，编辑就是替换这个区间；
 * - 任何无法静态确定语义的形态一律降级 sourceOnly，绝不猜测。
 */
import ts from 'typescript';
import path from 'node:path';
import { offsetToLineCol, sha1, toPosix } from './fsutil.mjs';
import {
  CALL_REF_OBJECTS,
  CTRL_LABELS,
  Editable,
  ENUM_OBJECTS,
  Kind,
  VIEW_TYPE_LABELS,
} from './model.mjs';

const MAX_DEPTH = 24;

/** 建 SourceFile（带 parent，便于 JSDoc 与语言服务辅助）。 */
export function parseSource(file, text) {
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

/** 剥离包裹表达式，返回真正承载值的节点。 */
function unwrap(node) {
  let n = node;
  while (
    n &&
    (ts.isAsExpression(n) ||
      ts.isSatisfiesExpression?.(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isTypeAssertionExpression?.(n))
  ) {
    n = n.expression;
  }
  return n;
}

/** 取节点前置的最后一个 /** *\/ 注释，并解析其中的 @name。 */
function leadingDoc(sf, node) {
  const text = sf.text;
  let end = node.getFullStart();
  const chunk = text.slice(end, node.getStart(sf));
  const m = chunk.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!m) return { description: '', name: '' };
  const body = m[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean);
  let name = '';
  const rest = [];
  for (const line of body) {
    const t = line.match(/^@name\s+(.+)$/);
    if (t) {
      name = t[1].trim();
      continue;
    }
    if (line.startsWith('@')) continue;
    rest.push(line);
  }
  return { description: rest.join(' '), name };
}

/**
 * 对象字面量里按属性名找赋值 —— 返回**最后一个**匹配。
 *
 * `{ id: 'a', id: 'b' }` 在 JS 里 b 生效，取第一个会得到错误的语义；
 * 之后的引用检查、重命名的 declaredId 会全部跟着错。
 */
function findProp(obj, name) {
  let found = null;
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === name) found = p;
  }
  return found;
}

/** 属性是否可能被**它后面**的对象展开覆盖（`{ id: 'x', ...base }`）。 */
function isShadowedBySpread(obj, prop) {
  const list = obj.properties;
  const idx = list.indexOf(prop);
  if (idx < 0) return false;
  for (let i = idx + 1; i < list.length; i += 1) {
    if (ts.isSpreadAssignment(list[i])) return true;
  }
  return false;
}

/** 最后一个展开赋值的位置（-1 表示没有展开）。 */
function lastSpreadIndex(obj) {
  let last = -1;
  obj.properties.forEach((p, i) => {
    if (ts.isSpreadAssignment(p)) last = i;
  });
  return last;
}

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

/** 根标识符：VType / this / CATEGORY_OPTIONS … */
function rootIdent(node) {
  let n = node;
  while (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
    n = n.expression;
  }
  if (ts.isIdentifier(n)) return n.text;
  if (n.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  return null;
}

/** 把 `this.a.b.c` 拆成 ['a','b','c']；不是 this 链则返回 null。 */
function thisChain(node) {
  if (!ts.isPropertyAccessExpression(node)) return null;
  const names = [];
  let n = node;
  while (ts.isPropertyAccessExpression(n)) {
    names.unshift(n.name.text);
    n = n.expression;
  }
  return n.kind === ts.SyntaxKind.ThisKeyword ? names : null;
}

/** 分类：决定前端用什么控件、以及能不能写。 */
function classify(sf, node) {
  const n = unwrap(node);
  if (!n) return { editability: Editable.SOURCE_ONLY };

  switch (n.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return { editability: Editable.LITERAL, valueType: 'string', value: n.text };
    case ts.SyntaxKind.NumericLiteral:
      return { editability: Editable.LITERAL, valueType: 'number', value: Number(n.text) };
    case ts.SyntaxKind.TrueKeyword:
      return { editability: Editable.LITERAL, valueType: 'boolean', value: true };
    case ts.SyntaxKind.FalseKeyword:
      return { editability: Editable.LITERAL, valueType: 'boolean', value: false };
    case ts.SyntaxKind.NullKeyword:
      return { editability: Editable.LITERAL, valueType: 'null', value: null };
    case ts.SyntaxKind.PrefixUnaryExpression: {
      const op = n.operator;
      if (
        (op === ts.SyntaxKind.MinusToken || op === ts.SyntaxKind.PlusToken) &&
        ts.isNumericLiteral(n.operand)
      ) {
        const v = Number(n.operand.text) * (op === ts.SyntaxKind.MinusToken ? -1 : 1);
        return { editability: Editable.LITERAL, valueType: 'number', value: v };
      }
      return { editability: Editable.EXPR, expr: n.getText(sf) };
    }
    // 对象/数组里出现展开时**不整体降级**：
    //   - 展开是「该容器的某个属性可能被覆盖」这一件事，不是「整个容器不可读」；
    //   - 逐属性的影响在 walkValue 里按 JS 的求值顺序判定（展开之后的同名属性才受影响）；
    //   - 结构性改动（新增属性 / 插入数组项 / 重排）在 edit.mjs 里单独拒绝。
    // 早期实现直接在 classify 里标 dynamic，整棵子树变成只读 ——
    // 用户连"改一个不受影响的属性"都做不到。
    case ts.SyntaxKind.ObjectLiteralExpression:
      return { editability: Editable.OBJECT, hasSpread: hasSpread(n) };
    case ts.SyntaxKind.ArrayLiteralExpression:
      return { editability: Editable.ARRAY, hasSpread: n.elements.some((e) => ts.isSpreadElement(e)) };
    case ts.SyntaxKind.PropertyAccessExpression: {
      const root = rootIdent(n);
      if (root && ENUM_OBJECTS[root]) {
        return { editability: Editable.ENUM_REF, enumObject: root, enumMember: n.name.text };
      }
      const chain = thisChain(n);
      if (chain) {
        if (chain[0] === 'handler' && chain.length === 2) {
          return { editability: Editable.HANDLER_REF, handlerMethod: chain[1], expr: n.getText(sf) };
        }
        if (chain[0] === 'data' && chain.length === 3 && chain[2] === 'id') {
          return {
            editability: Editable.MEMBER_REF,
            ref: { kind: 'data', member: chain[1] },
            expr: n.getText(sf),
          };
        }
        if (chain.length === 2 && chain[1] === 'id') {
          return {
            editability: Editable.MEMBER_REF,
            ref: { kind: 'view', member: chain[0] },
            expr: n.getText(sf),
          };
        }
        return { editability: Editable.MEMBER_REF, expr: n.getText(sf), thisChain: chain };
      }
      return { editability: Editable.EXPR, expr: n.getText(sf) };
    }
    case ts.SyntaxKind.CallExpression: {
      const callee = n.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const root = rootIdent(callee);
        const meta = root ? CALL_REF_OBJECTS[root] : null;
        if (meta && callee.name.text === meta.member) {
          // DataBase.active(this.table1.id) → 焦点行绑定
          const arg = n.arguments[0];
          const target = arg && ts.isPropertyAccessExpression(arg) ? thisChain(arg) : null;
          return {
            editability: Editable.CALL_REF,
            expr: n.getText(sf),
            ref: {
              kind: 'active',
              member: target && target.length === 2 ? target[0] : null,
              viewIdExpr: arg ? arg.getText(sf) : null,
            },
          };
        }
      }
      return { editability: Editable.EXPR, expr: n.getText(sf) };
    }
    case ts.SyntaxKind.Identifier:
      return { editability: Editable.MODULE_REF, expr: n.text, moduleRef: n.text };
    case ts.SyntaxKind.ArrowFunction:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.TemplateExpression:
    case ts.SyntaxKind.ConditionalExpression:
    case ts.SyntaxKind.BinaryExpression:
    case ts.SyntaxKind.NewExpression:
    case ts.SyntaxKind.ElementAccessExpression:
    case ts.SyntaxKind.JsxElement:
    case ts.SyntaxKind.JsxSelfClosingElement:
      return { editability: Editable.EXPR, expr: n.getText(sf) };
    default:
      return { editability: Editable.SOURCE_ONLY, expr: safeText(sf, n) };
  }
}

function safeText(sf, node) {
  try {
    const text = node.getText(sf);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return '';
  }
}

function hasSpread(obj) {
  return obj.properties.some((p) => ts.isSpreadAssignment(p));
}

function anchorOf(file, text, node) {
  const start = node.getStart();
  const end = node.getEnd();
  const begin = offsetToLineCol(text, start);
  const finish = offsetToLineCol(text, end);
  return {
    file,
    start,
    end,
    line: begin.line,
    column: begin.column,
    endLine: finish.line,
    endColumn: finish.column,
    // 该区间文本的指纹：apply 前用它能判断「漂移的是不是一个具体节点」，
    // 比只看整文件哈希给出的提示精确得多。
    hash: sha1(text.slice(start, end)),
  };
}

/**
 * 递归遍历表达式，产出节点。
 * @param {object} ctx 分析上下文
 */
function walkValue(ctx, node, { id, parentId, name, kind, label, containerKey, index, degraded, depth = 0 }) {
  const sf = ctx.sf;
  const inner = unwrap(node);

  // 深度守卫：早期 MAX_DEPTH 定义了却从不使用，遇到深层嵌套会直接把栈打爆。
  if (depth > MAX_DEPTH) {
    ctx.nodes.push(truncatedNode(ctx, { id, parentId, name, kind, label, containerKey, index }));
    return null;
  }

  const info = classify(sf, inner);
  const doc = node.parent && ts.isPropertyAssignment(node.parent)
    ? leadingDoc(sf, node.parent)
    : { description: '', name: '' };

  const dynamic = Boolean(info.dynamic) || degraded;
  const editability = dynamic && info.editability !== Editable.SOURCE_ONLY ? Editable.SOURCE_ONLY : info.editability;

  const anchorSource = inner ?? node;
  const nodeOut = {
    id,
    parentId,
    kind,
    name,
    label: label ?? doc.name ?? name,
    description: doc.description || '',
    editability,
    valueType: info.valueType ?? null,
    value: info.value !== undefined ? info.value : null,
    // expr 有两个用途：只读展示（截断）与引用类控件的「当前值」。
    // 引用类（memberRef / handlerRef / callRef）必须原样回传，
    // 否则前端拿不到当前表达式，会把下拉框的第一项误显示成当前值。
    expr:
      info.editability === Editable.EXPR || info.editability === Editable.MODULE_REF
        ? safeText(sf, anchorSource)
        : (info.expr ?? null),
    enumObject: info.enumObject ?? null,
    enumMember: info.enumMember ?? null,
    handlerMethod: info.handlerMethod ?? null,
    moduleRef: info.moduleRef ?? null,
    ref: info.ref ?? null,
    file: ctx.file,
    anchor: anchorOf(ctx.file, ctx.text, anchorSource),
    containerKey: containerKey ?? null,
    index: index ?? null,
    degraded,
    // 该容器含 `...` 展开：属性可读，但结构性改动（新增属性/重排）会被拒绝。
    hasSpread: Boolean(info.hasSpread),
    children: [],
  };

  ctx.nodes.push(nodeOut);

  // 递归：对象属性 / 数组项
  if (inner && ts.isObjectLiteralExpression(inner)) {
    const spreadAt = lastSpreadIndex(inner);
    const seenKeys = new Map();
    for (let i = 0; i < inner.properties.length; i += 1) {
      const prop = inner.properties[i];
      if (ts.isPropertyAssignment(prop)) {
        const key = propName(prop.name);
        if (key == null) continue;

        // 同名属性重复时（JS 语义是后者生效），id 撞车会让父子关系错乱、可能改错字段。
        // 用 #N 后缀区分，但**不改锚点**，所以编辑仍然落在正确的那一处。
        const occ = seenKeys.get(key) ?? 0;
        seenKeys.set(key, occ + 1);
        const childId = occ === 0 ? `${id}.${key}` : `${id}.${key}#${occ}`;

        // 属性后面还有展开 → 该属性可能被覆盖，语义不确定，只读。
        const shadowed = spreadAt > i;
        walkValue(ctx, prop.initializer, {
          id: childId,
          parentId: id,
          name: key,
          kind: Kind.PROP,
          label: childLabelFor(ctx, key, prop),
          // 容器语义往下传：数组项里的嵌套对象也能知道自己属于哪个 items
          containerKey: containerKey ?? null,
          degraded: shadowed,
          depth: depth + 1,
        });
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        ctx.nodes.push(shorthandNode(ctx, prop, id));
      }
    }
  } else if (inner && ts.isArrayLiteralExpression(inner)) {
    inner.elements.forEach((el, i) => {
      if (ts.isSpreadElement(el)) return;
      walkValue(ctx, el, {
        id: `${id}[${i}]`,
        parentId: id,
        name: `[${i}]`,
        kind: Kind.ARRAY_ITEM,
        label: itemLabel(ctx, el, i, containerKey),
        // 数组自身的字段名就是「容器语义」，例如 items / searchItems / toolList
        containerKey: name,
        index: i,
        degraded,
        depth: depth + 1,
      });
    });
  }

  return nodeOut;
}

/** 超过深度上限时用一个"截断"节点占位，保证结构树不出现断链。 */
function truncatedNode(ctx, meta) {
  return {
    id: meta.id,
    parentId: meta.parentId,
    kind: meta.kind,
    name: meta.name,
    label: `${meta.label ?? meta.name}（嵌套过深，已截断）`,
    description: `超过 ${MAX_DEPTH} 层嵌套，不再展开，也无法结构化编辑。`,
    editability: Editable.SOURCE_ONLY,
    valueType: null,
    value: null,
    expr: null,
    enumObject: null,
    enumMember: null,
    handlerMethod: null,
    moduleRef: null,
    ref: null,
    file: ctx.file,
    anchor: null,
    containerKey: meta.containerKey ?? null,
    index: meta.index ?? null,
    degraded: true,
    // 与普通节点保持同形：前端按同一套字段读取，缺字段会让"是否有对象展开"
    // 这类判断在截断节点上失真。
    hasSpread: false,
    children: [],
  };
}

function childLabelFor(ctx, key, prop) {
  const doc = leadingDoc(ctx.sf, prop);
  if (doc.name) return doc.name;
  return ctx.labels[key] ?? key;
}

/** 数组项的展示名：优先 title/text/field/label 字面量。 */
function itemLabel(ctx, el, index, containerKey) {
  const inner = unwrap(el);
  if (inner && ts.isObjectLiteralExpression(inner)) {
    for (const key of ['title', 'label', 'text', 'name', 'field', 'key']) {
      const p = findProp(inner, key);
      if (p) {
        const lit = unwrap(p.initializer);
        if (lit && (ts.isStringLiteral(lit) || ts.isNumericLiteral(lit))) return `${lit.text}`;
      }
    }
  }
  if (inner && (ts.isStringLiteral(inner) || ts.isNumericLiteral(inner))) return `${inner.text}`;
  return `#${index + 1}`;
}

function shorthandNode(ctx, prop, parentId) {
  const name = prop.name.text;
  return {
    id: `${parentId}.${name}`,
    parentId,
    kind: Kind.PROP,
    name,
    label: ctx.labels[name] ?? name,
    description: '',
    editability: Editable.MODULE_REF,
    valueType: null,
    value: null,
    expr: name,
    enumObject: null,
    enumMember: null,
    handlerMethod: null,
    moduleRef: name,
    ref: null,
    file: ctx.file,
    anchor: anchorOf(ctx.file, ctx.text, prop.name),
    containerKey: null,
    index: null,
    degraded: false,
    children: [],
  };
}

/** 找页面装配：ViewRoot 的三个 class 属性。 */
function findAssembly(ctx) {
  let result = null;
  const visit = (node) => {
    if (result) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(ctx.sf);
      if (tag === 'ViewRoot') {
        const attrs = {};
        for (const attr of opening.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name) {
            const key = attr.name.getText(ctx.sf);
            const init = attr.initializer;
            if (init && ts.isJsxExpression(init) && init.expression) {
              attrs[key] = init.expression.getText(ctx.sf);
            } else if (init && ts.isStringLiteral(init)) {
              attrs[key] = init.text;
            }
          }
        }
        result = { tag, attrs };
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ctx.sf);
  return result;
}

/** 收集 import：本地名 → 模块说明符。 */
function collectImports(sf) {
  const map = {};
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) map[clause.name.text] = spec;
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) map[el.name.text] = spec;
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      map[clause.namedBindings.name.text] = spec;
    }
  }
  return map;
}

/** 找目标类声明：优先继承 ViewBase/DataBase/HandlerBase 的那个。 */
function findTargetClass(sf, baseNames) {
  let fallback = null;
  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    if (!fallback) fallback = stmt;
    const heritage = stmt.heritageClauses ?? [];
    for (const clause of heritage) {
      for (const type of clause.types) {
        const name = type.expression.getText(sf);
        if (baseNames.includes(name)) return stmt;
      }
    }
  }
  return fallback;
}

function isClassLike(node) {
  return ts.isClassDeclaration(node);
}

/**
 * 主入口。
 * @param {{ project: any, route: string, files: {file:string,text:string}[], labels: Record<string,string>, enums: Record<string, any> }} params
 */
/**
 * 判断页面入口是不是一个「转发壳」（L3）：源码本身不装配任何东西。
 *
 * 只认两种**确定**的形态，其余一律按 L2 处理：
 *   - 重导出：`export { default } from './x'` / `export * from './x'`，
 *     真正的内容在另一个文件，本文件零信息量；
 *   - 动态装配：`import(...)` / `React.lazy(...)`，渲染什么要运行时才知道。
 *
 * 刻意**不**判「export default 指向标识符」——apps/demo 的页面正是
 * `const P = () => <ViewRoot .../>; export default P;` 这种写法，
 * 那样会把正常页面误降成只读。
 */
function detectForwardingShell(sf, text) {
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) return '重导出（export ... from）';
  }
  if (/\bimport\s*\(/.test(text)) return '动态 import';
  if (/\b(?:React\.)?lazy\s*\(/.test(text)) return 'React.lazy';
  return null;
}

export function analyzePage({ project, route, files, labels = {}, enums = {}, baseHandlerMethods = null }) {
  const fileMap = new Map(files.map((f) => [toPosix(f.file), f]));
  const issues = [];
  const warnings = [];

  const entry =
    files.find((f) => toPosix(f.file).endsWith('index.tsx')) ??
    files.find((f) => toPosix(f.file).endsWith('index.ts')) ??
    files[0];
  if (!entry) {
    return { page: null, nodes: [], issues: [{ level: 'error', code: 'ST000', message: '页面目录下没有任何源码文件' }], enums };
  }

  const entryPath = toPosix(entry.file);
  const entrySf = parseSource(entryPath, entry.text);
  const imports = collectImports(entrySf);
  const assembly = findAssembly({ sf: entrySf, text: entry.text });

  if (!assembly) {
    const shell = detectForwardingShell(entrySf, entry.text);
    if (shell) {
      // L3：连"这个入口渲染什么"都无法静态确定，只给导航与源码打开。
      return {
        page: {
          route,
          level: 'L3',
          entry: entryPath,
          entryRel: rel(project, entryPath),
          files: files.map((f) => ({ file: toPosix(f.file), rel: rel(project, toPosix(f.file)) })),
          componentFiles: {},
          className: null,
        },
        nodes: [],
        issues: [
          {
            level: 'info',
            code: 'ST103',
            message: `页面入口是${shell}，静态无法确定结构（只提供源码导航与打开）。`,
            file: entryPath,
          },
        ],
        enums,
      };
    }

    // L2：普通 React 页面（或 index 用了别名导入的 ViewRoot）
    return {
      page: {
        route,
        level: 'L2',
        entry: entryPath,
        entryRel: rel(project, entryPath),
        files: files.map((f) => ({ file: toPosix(f.file), rel: rel(project, toPosix(f.file)) })),
        componentFiles: {},
        className: null,
      },
      nodes: [],
      issues: [
        {
          level: 'info',
          code: 'ST100',
          message: '未在该页面入口识别到 ViewRoot 装配，按普通 React 页面处理（只读浏览 + 源码跳转）。',
        },
      ],
      enums,
    };
  }

  // 由 import 说明符解析出 data/view/handler 三个文件
  const componentFiles = {};
  for (const [key, base] of [
    ['view', null],
    ['data', null],
    ['handler', null],
  ]) {
    void base;
    const localName = assembly.attrs[key === 'view' ? 'ViewClass' : key === 'data' ? 'DataClass' : 'HandlerClass'];
    if (!localName) continue;
    const spec = imports[localName];
    if (!spec) {
      warnings.push(`装配里的 ${localName} 无法解析到模块来源。`);
      continue;
    }
    const resolved = resolveSpec(spec, entryPath, files);
    if (resolved) componentFiles[key] = resolved;
    else warnings.push(`${localName} 的模块「${spec}」不在页面目录内，已跳过。`);
  }

  if (!componentFiles.view) {
    issues.push({
      level: 'error',
      code: 'ST101',
      message: '未能解析出 ViewClass 对应的视图文件（页面结构无法编辑）。',
    });
  }

  const nodes = [];
  const baseCtx = { project, route, labels, nodes };

  // ── 视图 ──
  const viewMembers = {};
  const viewInfo = {};
  if (componentFiles.view) {
    const text = fileMap.get(componentFiles.view).text;
    const sf = parseSource(componentFiles.view, text);
    const cls = findTargetClass(sf, ['ViewBase']);
    const ctx = { ...baseCtx, sf, text, file: componentFiles.view };

    if (cls) {
      for (const member of cls.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const memberName = propName(member.name);
        if (!memberName || !member.initializer) continue;
        const init = unwrap(member.initializer);
        if (!init || !ts.isObjectLiteralExpression(init)) continue;

        const typeProp = findProp(init, 'type');
        const idProp = findProp(init, 'id');
        // 属性被后面的展开覆盖时，静态读到的字面量并不是运行时的值 ——
        // 拿它去做重复检查、重命名的 declaredId 只会把错误放大。
        const shadowed = (prop) => (prop ? isShadowedBySpread(init, prop) : false);
        const idShadowed = shadowed(idProp);
        const typeShadowed = shadowed(typeProp);
        if (idShadowed || typeShadowed) {
          warnings.push(
            `视图「${memberName}」的 ${idShadowed ? 'id' : 'type'} 之后还有对象展开，运行时值无法静态确定，已按只读处理。`,
          );
        }

        const viewType = typeShadowed ? null : (enumMemberOf(typeProp?.initializer) ?? null);
        const idLit = idProp && !idShadowed ? literalText(unwrap(idProp.initializer)) : null;

        viewMembers[memberName] = { memberName, id: idLit, viewType, decl: member };
        viewInfo[memberName] = { id: idLit, type: viewType };

        const node = walkValue(ctx, member.initializer, {
          id: `view.${memberName}`,
          parentId: 'page',
          name: memberName,
          kind: Kind.VIEW,
          label: viewLabel(labels, memberName, viewType, idLit),
          degraded: false,
        });
        node.viewType = viewType;
        node.declaredId = idLit;
        node.memberName = memberName;
        node.doc = leadingDoc(sf, member);
      }

      // 结构图：layout items / getRootId / viewId 引用
      buildStructure(ctx, cls, viewMembers, nodes, issues, warnings);
    }
  }

  // ── 数据 ──
  const dataMembers = {};
  if (componentFiles.data) {
    const text = fileMap.get(componentFiles.data).text;
    const sf = parseSource(componentFiles.data, text);
    const cls = findTargetClass(sf, ['DataBase']);
    const ctx = { ...baseCtx, sf, text, file: componentFiles.data };
    if (cls) {
      for (const member of cls.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const memberName = propName(member.name);
        if (!memberName || !member.initializer) continue;
        const init = unwrap(member.initializer);
        if (!init || !ts.isObjectLiteralExpression(init)) continue;
        const idProp = findProp(init, 'id');
        const idShadowed = idProp ? isShadowedBySpread(init, idProp) : false;
        if (idShadowed) {
          warnings.push(`数据节点「${memberName}」的 id 之后还有对象展开，运行时值无法静态确定，已按只读处理。`);
        }
        const idLit = idProp && !idShadowed ? literalText(unwrap(idProp.initializer)) : null;
        dataMembers[memberName] = { memberName, id: idLit };
        const node = walkValue(ctx, member.initializer, {
          id: `data.${memberName}`,
          parentId: 'page',
          name: memberName,
          kind: Kind.DATA,
          label: `数据「${idLit ?? memberName}」`,
          degraded: false,
        });
        node.declaredId = idLit;
        node.memberName = memberName;
      }
    }
  }

  // ── 处理器 ──
  const handlerMethods = [];
  if (componentFiles.handler) {
    const text = fileMap.get(componentFiles.handler).text;
    const sf = parseSource(componentFiles.handler, text);
    const cls = findTargetClass(sf, ['HandlerBase']);
    if (cls) {
      const ctx = { ...baseCtx, sf, text, file: componentFiles.handler };
      const containerLabel = '处理器方法';
      nodes.push({
        id: 'handler',
        parentId: 'page',
        kind: Kind.HANDLER,
        name: 'handler',
        label: containerLabel,
        description: '',
        editability: Editable.SOURCE_ONLY,
        valueType: null,
        value: null,
        expr: null,
        enumObject: null,
        enumMember: null,
        handlerMethod: null,
        moduleRef: null,
        ref: null,
        file: componentFiles.handler,
        anchor: null,
        containerKey: null,
        index: null,
        degraded: true,
        children: [],
      });
      for (const member of cls.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const memberName = propName(member.name);
        if (!memberName || !member.initializer) continue;
        const init = unwrap(member.initializer);
        if (!init || (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init))) continue;
        handlerMethods.push(memberName);
        nodes.push({
          id: `handler.${memberName}`,
          parentId: 'handler',
          kind: Kind.HANDLER,
          name: memberName,
          label: memberName,
          description: leadingDoc(sf, member).description,
          editability: Editable.EXPR,
          valueType: null,
          value: null,
          // expr 的语义是"只读展示文本"（前端会按源码片段渲染它）。
          // 早期这里塞的是字符偏移，于是界面上显示的是一个数字 —— 既没用又误导。
          // 这里给方法声明的前若干字符，够看清签名与开头逻辑，又不会把大文件搬一遍。
          expr: text.slice(member.getStart(sf), Math.min(member.getEnd(), member.getStart(sf) + 400)),
          enumObject: null,
          enumMember: null,
          handlerMethod: memberName,
          moduleRef: null,
          ref: null,
          file: componentFiles.handler,
          anchor: {
            file: componentFiles.handler,
            ...anchorRange(text, member),
            line: offsetToLineCol(text, member.getStart(sf)).line,
            column: offsetToLineCol(text, member.getStart(sf)).column,
            endLine: offsetToLineCol(text, member.getEnd()).line,
            endColumn: offsetToLineCol(text, member.getEnd()).column,
          },
          containerKey: null,
          index: null,
          degraded: false,
          children: [],
        });
      }
    }
  }

  // 根节点
  const pageNode = {
    id: 'page',
    parentId: null,
    kind: Kind.PAGE,
    name: route,
    label: `页面 ${route}`,
    description: '',
    editability: Editable.SOURCE_ONLY,
    file: entryPath,
    anchor: null,
    children: [],
    degraded: false,
  };

  // ── 语法错误降级 ──
  //
  // 文件本来就有语法错误时（正在手改的中间态、半成品代码），静态分析出的结构可能
  // 与真实不符。此时给出一条明确诊断，并把该文件产出的节点整体降为只读 ——
  // "能看清但改不了"远好过"基于错误理解去改源码"。
  const syntaxIssues = [];
  for (const [key, file] of Object.entries(componentFiles)) {
    const entry = fileMap.get(file);
    if (!entry) continue;
    const diags = parseSource(file, entry.text).parseDiagnostics ?? [];
    if (diags.length === 0) continue;
    const first = diags[0];
    const pos = offsetToLineCol(entry.text, first.start ?? 0);
    const detail = ts.flattenDiagnosticMessageText(first.messageText, ' ');
    syntaxIssues.push({ file: toPosix(file), line: pos.line, column: pos.column, message: detail });
    issues.push({
      level: 'error',
      code: 'ST102',
      message: `${key}.${file.split('.').pop()} 存在语法错误（第 ${pos.line} 行：${detail}），该文件的节点已降级为只读。`,
      target: `page`,
    });
  }
  const brokenFiles = new Set(syntaxIssues.map((s) => s.file));
  if (brokenFiles.size > 0) {
    for (const n of nodes) {
      if (n.file && brokenFiles.has(toPosix(n.file))) {
        n.editability = Editable.SOURCE_ONLY;
        n.degraded = true;
      }
    }
  }

  const allNodes = [pageNode, ...nodes.filter((n) => n.kind !== Kind.PAGE)];
  linkChildren(allNodes);

  const structure = buildRefIndex(allNodes, viewMembers, dataMembers, handlerMethods, componentFiles, files, project);

  collectIssues({
    route,
    nodes: allNodes,
    structure,
    viewMembers,
    dataMembers,
    handlerMethods,
    fileMap,
    issues,
    baseHandlerMethods,
  });

  return {
    page: {
      route,
      level: 'L1',
      syntaxIssues,
      entry: entryPath,
      entryRel: rel(project, entryPath),
      files: files.map((f) => ({ file: toPosix(f.file), rel: rel(project, toPosix(f.file)) })),
      componentFiles,
      componentFilesRel: Object.fromEntries(
        Object.entries(componentFiles).map(([k, v]) => [k, rel(project, v)]),
      ),
      // 只回传可序列化的投影：内部视图成员表里挂着 ts.Node（decl），
      // 直接外抛会因 SourceFile ↔ parent 环导致 JSON.stringify 崩溃。
      viewMembers: projectViewMembers(viewMembers),
      dataMembers,
      handlerMethods,
      rootId: structure.rootId,
    },
    nodes: allNodes,
    issues: [...issues, ...warnings.map((w) => ({ level: 'warning', code: 'ST900', message: w }))],
    refs: structure.refs,
    enums,
    labels,
  };
}

function anchorRange(text, node) {
  return { start: node.getStart(), end: node.getEnd() };
}

/** 把内部视图成员表投影成可 JSON 序列化的形状（剔除 ts.Node 引用）。 */
function projectViewMembers(viewMembers) {
  const out = {};
  for (const [name, info] of Object.entries(viewMembers)) {
    out[name] = {
      memberName: info.memberName,
      id: info.id ?? null,
      viewType: info.viewType ?? null,
      isRoot: Boolean(info.isRoot),
      layoutItems: info.layoutItems ?? null,
    };
  }
  return out;
}

function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  return null;
}

export function enumMemberOf(node) {
  if (!node) return null;
  const n = unwrap(node);
  if (ts.isPropertyAccessExpression(n)) return `${rootIdent(n)}.${n.name.text}`;
  if (ts.isStringLiteral(n)) return n.text;
  return null;
}

function viewLabel(labels, memberName, viewType, idLit) {
  const typeLabel = viewType ? VIEW_TYPE_LABELS[viewType.replace(/^VType\./, '')] ?? viewType : '视图';
  return `${typeLabel}「${idLit ?? memberName}」`;
}

/** 解析模块说明符到页面内的文件。 */
function resolveSpec(spec, fromFile, files) {
  const dir = path.posix.dirname(toPosix(fromFile));
  const exts = ['.tsx', '.ts', '.jsx', '.js'];
  if (spec.startsWith('.')) {
    const base = path.posix.normalize(path.posix.join(dir, spec));
    const candidates = [base, ...exts.map((e) => base + e), ...exts.map((e) => `${base}/index${e}`)];
    return files.find((f) => candidates.includes(toPosix(f.file)))?.file ?? null;
  }
  return null;
}

function linkChildren(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    n.children = [];
  }
  for (const n of nodes) {
    if (!n.parentId) continue;
    const parent = byId.get(n.parentId);
    if (parent) parent.children.push(n.id);
  }
}

/** 解析结构：layout.items / getRootId / viewId / dataId。 */
function buildStructure(ctx, cls, viewMembers, nodes, issues, warnings) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // layout 等容器的 items 引用
  for (const [memberName, info] of Object.entries(viewMembers)) {
    const itemsNode = nodeById.get(`view.${memberName}.items`);
    if (!itemsNode) continue;
    const arr = itemsNode.children
      .map((id) => nodeById.get(id))
      .filter((n) => n && n.kind === Kind.ARRAY_ITEM);
    const refs = [];
    for (const item of arr) {
      const target = resolveRefMember(item, viewMembers);
      if (target) refs.push(target);
      item.refTarget = target ?? null;
    }
    info.layoutItems = refs;
  }

  // getRootId
  const rootMember = ts.isPropertyDeclaration;
  void rootMember;
  for (const member of cls.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (propName(member.name) !== 'getRootId' || !member.initializer) continue;
    const init = unwrap(member.initializer);
    let chain = null;
    const visit = (n) => {
      if (chain) return;
      if (ts.isPropertyAccessExpression(n)) {
        const c = thisChain(n);
        if (c && c.length === 2 && c[1] === 'id') {
          chain = c[0];
          return;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(init);
    if (chain && viewMembers[chain]) viewMembers[chain].isRoot = true;
  }
}

/** 数组项若是 this.X.id 形式，解析出它指向的视图成员。 */
function resolveRefMember(itemNode, viewMembers) {
  if (itemNode.ref && itemNode.ref.kind === 'view') return itemNode.ref.member;
  if (itemNode.editability === Editable.MEMBER_REF && itemNode.expr) {
    const m = String(itemNode.expr).match(/^this\.([\w$]+)\.id$/);
    if (m && viewMembers[m[1]]) return m[1];
  }
  return null;
}

/** 引用索引：供反向查询、重命名影响面、以及 delete 前的引用阻断。 */
function buildRefIndex(nodes, viewMembers, dataMembers, handlerMethods, componentFiles, files, project) {
  const refs = [];
  for (const n of nodes) {
    if (n.ref) {
      refs.push({ from: n.id, kind: n.ref.kind, member: n.ref.member, file: n.file, anchor: n.anchor });
    } else if (n.editability === Editable.ENUM_REF) {
      refs.push({ from: n.id, kind: 'enum', member: n.enumObject, file: n.file, anchor: n.anchor });
    } else if (n.editability === Editable.HANDLER_REF) {
      refs.push({ from: n.id, kind: 'handler', member: n.handlerMethod, file: n.file, anchor: n.anchor });
    } else if (n.editability === Editable.MODULE_REF && n.moduleRef) {
      refs.push({ from: n.id, kind: 'module', member: n.moduleRef, file: n.file, anchor: n.anchor });
    }
  }

  // handler 里的字符串常量（如 getSelectedKeys('table1')）
  if (componentFiles.handler) {
    const target = files.find((f) => toPosix(f.file) === componentFiles.handler);
    if (target) {
      const sf = parseSource(componentFiles.handler, target.text);
      const visit = (node) => {
        if (ts.isStringLiteral(node)) {
          refs.push({
            from: `handler-string:${node.getStart()}`,
            kind: 'string',
            member: node.text,
            file: componentFiles.handler,
            anchor: anchorOf(componentFiles.handler, target.text, node),
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }

  const rootId = Object.keys(viewMembers).find((k) => viewMembers[k].isRoot) ?? null;
  return { refs, rootId, viewMembers, dataMembers, handlerMethods };
}

function collectIssues({
  route,
  nodes,
  structure,
  viewMembers,
  dataMembers,
  handlerMethods,
  fileMap,
  issues,
  baseHandlerMethods = null,
}) {
  void route;
  void fileMap;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ST001 视图 id 重复 / 缺失
  const seen = new Map();
  for (const [member, info] of Object.entries(viewMembers)) {
    const node = nodeById.get(`view.${member}`);
    if (!info.id) {
      issues.push({
        level: 'error',
        code: 'ST001',
        message: `视图「${member}」缺少 id 字段。`,
        target: `view.${member}`,
      });
      continue;
    }
    if (seen.has(info.id)) {
      issues.push({
        level: 'error',
        code: 'ST001',
        message: `视图 id 重复：「${info.id}」同时出现在 ${seen.get(info.id)} 与 ${member}。`,
        target: `view.${member}`,
      });
    } else {
      seen.set(info.id, member);
    }
    void node;
  }

  // ST002 layout items 引用不存在
  for (const [member, info] of Object.entries(viewMembers)) {
    if (!Array.isArray(info.layoutItems)) continue;
    for (const target of info.layoutItems) {
      if (!viewMembers[target]) {
        issues.push({
          level: 'error',
          code: 'ST002',
          message: `布局「${member}」引用了不存在的视图成员 ${target}。`,
          target: `view.${member}.items`,
        });
      }
    }
  }

  // ST005 dataId 悬空
  for (const [member, info] of Object.entries(viewMembers)) {
    const node = nodeById.get(`view.${member}.dataId`);
    if (node?.ref?.kind === 'data' && !dataMembers[node.ref.member]) {
      issues.push({
        level: 'error',
        code: 'ST005',
        message: `视图「${member}」的 dataId 指向不存在的数据节点 ${node.ref.member}。`,
        target: node.id,
      });
    }
  }

  // ST006 handler 引用不在本类、也不在框架基类里。
  //
  // 必须同时查基类：HandlerBase / HandlerViewBase 上定义了大量通用方法
  // （getData / setData / post …），它们不会出现在页面自己的 handler.ts 里。
  // 只查本类会给每个正常页面报假错 —— 早期实现因此把级别降成了 warning，
  // 那等于把"真的写错了方法名"也一起放过去了。
  for (const n of nodes) {
    if (n.editability === Editable.HANDLER_REF && n.handlerMethod) {
      const inBase = baseHandlerMethods ? baseHandlerMethods.has(n.handlerMethod) : false;
      if (handlerMethods.includes(n.handlerMethod) || inBase) continue;
      issues.push({
        // 拿到基类清单才敢报 error；拿不到（编辑链路没传框架路径）保持 warning，
        // 宁可不报也不能误伤正常页面。
        level: baseHandlerMethods ? 'error' : 'warning',
        code: 'ST006',
        message: baseHandlerMethods
          ? `this.handler.${n.handlerMethod} 既不在本类中声明，也不在框架基类（HandlerBase / HandlerViewBase）上。`
          : `this.handler.${n.handlerMethod} 未在本类中声明；若它来自基类（HandlerBase / HandlerViewBase）可忽略。`,
        target: n.id,
      });
    }
  }

  // ST007 getRootId 缺失
  if (Object.keys(viewMembers).length > 0 && !structure.rootId) {
    issues.push({
      level: 'warning',
      code: 'ST007',
      message: '未在视图类里识别到 getRootId() 的返回目标，页面在预览中可能不渲染。',
    });
  }

  // ST004 @Active 引用类别
  for (const n of nodes) {
    if (n.editability === Editable.CALL_REF && n.ref?.kind === 'active' && n.ref.member) {
      if (dataMembers[n.ref.member] && !viewMembers[n.ref.member]) {
        issues.push({
          level: 'error',
          code: 'ST004',
          message: `DataBase.active() 的参数指向了数据节点 ${n.ref.member}，这里必须是视图 id。`,
          target: n.id,
        });
      }
    }
  }

  // ST003 Tab / Modal / Drawer 的 viewId 悬空。
  // 这三类布局靠 viewId 字符串挂载子视图，写错时页面静默少一块，很难肉眼发现。
  const viewIds = new Set(Object.values(viewMembers).map((v) => v.id).filter(Boolean));
  for (const n of nodes) {
    if (n.name !== 'viewId' || typeof n.value !== 'string' || !n.value.trim()) continue;
    const parentMember = n.id.startsWith('view.') ? n.id.split('.')[1] : '';
    const parentType = viewMembers[parentMember]?.viewType ?? '';
    const isLayout = /Layout(Tab|Modal|Drawer)/.test(parentType);
    if (!isLayout) continue;
    if (!viewIds.has(n.value)) {
      issues.push({
        level: 'error',
        code: 'ST003',
        message: `${parentType.replace('VType.', '')}「${parentMember}」的 viewId 指向不存在的视图 id「${n.value}」。`,
        target: n.id,
      });
    }
  }
}

function rel(project, abs) {
  const root = toPosix(project.rootPath);
  const p = toPosix(abs);
  return p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p;
}

export { Editable, Kind, CTRL_LABELS, VIEW_TYPE_LABELS, leadingDoc, unwrap, findProp, propName, thisChain };
