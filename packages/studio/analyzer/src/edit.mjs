/**
 * 编辑计划生成：把「结构化意图」翻译成「最小字符区间替换」。
 *
 * 硬约束（设计文档 §5.4.2）：永不整体 print 文件；只替换目标区间；
 * 引号、缩进、换行、BOM、注释、`as const` / `satisfies` 全部原样保留。
 */
import ts from 'typescript';
import {
  applyEdits,
  detectEol,
  detectIndentUnit,
  indentAt,
  offsetToLineCol,
  reindent,
  stringLiteral,
  toPosix,
} from './fsutil.mjs';
import { analyzePage, parseSource, propName } from './analyze.mjs';
import { Editable } from './model.mjs';

class PlanError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code ?? 'EPLAN';
  }
}

/** 找目标类声明（与 analyze.mjs 同口径）。 */
function findClassDecl(sf, bases) {
  let fallback = null;
  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    if (!fallback) fallback = stmt;
    for (const clause of stmt.heritageClauses ?? []) {
      for (const type of clause.types) {
        if (bases.includes(type.expression.getText(sf))) return stmt;
      }
    }
  }
  return fallback;
}

/** 表达式文本是否可以作为 ref 写回。 */
function validateRef(ref, kind) {
  const text = String(ref ?? '').trim();
  if (!text) throw new PlanError('引用表达式为空', 'EBADREF');
  if (kind === 'enum') {
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(text)) {
      throw new PlanError(`枚举引用格式非法：${text}`, 'EBADREF');
    }
    return text;
  }
  if (kind === 'member') {
    if (!/^this(\.[A-Za-z_$][\w$]*)+$/.test(text)) {
      throw new PlanError(`成员引用格式非法：${text}`, 'EBADREF');
    }
    return text;
  }
  if (kind === 'handler') {
    if (!/^this\.handler\.[A-Za-z_$][\w$]*$/.test(text)) {
      throw new PlanError(`处理器引用格式非法：${text}`, 'EBADREF');
    }
    return text;
  }
  if (kind === 'active') {
    if (!/^DataBase\.active\(this\.[A-Za-z_$][\w$]*\.id\)$/.test(text)) {
      throw new PlanError(`焦点行绑定格式非法：${text}`, 'EBADREF');
    }
    return text;
  }
  // 通用表达式：仅允许安全的标识符/成员链/调用链
  if (!/^[\w$.]+(\([\w$.\s,']*\))?(\.[\w$]+)*$/.test(text)) {
    throw new PlanError(`表达式含不允许的字符：${text}`, 'EBADREF');
  }
  return text;
}

function findNode(analysis, id) {
  const node = analysis.nodes.find((n) => n.id === id);
  if (!node) throw new PlanError(`找不到目标节点：${id}`, 'ENOTARGET');
  return node;
}

function fileOf(files, abs) {
  const target = toPosix(abs);
  const found = files.find((f) => toPosix(f.file) === target);
  if (!found) throw new PlanError(`文件不在本次快照内：${abs}`, 'ENOFILE');
  return found;
}

/** 对象字面量里两个属性之间的「连接区间」计算（插入/删除共用）。 */
function arrayElementRange(text, arrayNode, elements, index) {
  const el = elements[index];
  return { el, start: el.getStart(), end: el.getEnd() };
}

/**
 * 生成编辑计划。
 * @param {{ project:any, route:string, files:{file:string,text:string}[], op:any, labels?:any, enums?:any }} params
 */
export function planEdit(params) {
  const { project, route, files, op, labels = {}, enums = {} } = params;
  if (!op || typeof op.kind !== 'string') throw new PlanError('缺少 op.kind', 'EBADOP');

  const analysis = analyzePage({ project, route, files, labels, enums });

  switch (op.kind) {
    case 'set':
      return planSetLiteral(analysis, files, op);
    case 'set-ref':
      return planSetRef(analysis, files, op);
    case 'insert-array-item':
      return planInsertArrayItem(analysis, files, op);
    case 'delete-array-item':
      return planDeleteArrayItem(analysis, files, op);
    case 'move-array-item':
      return planMoveArrayItem(analysis, files, op);
    case 'delete-prop':
      return planDeleteProp(analysis, files, op);
    case 'insert-prop':
      return planInsertProp(analysis, files, op);
    case 'delete-member':
      return planDeleteMember(analysis, files, op);
    case 'insert-member':
      return planInsertMember(analysis, files, op);
    case 'rename-member':
      return planRenameMember(analysis, files, project, op);
    default:
      throw new PlanError(`不支持的编辑动作：${op.kind}`, 'EBADOP');
  }
}

function wrap(result, files) {
  // 逐个文件先做一次「内存应用 + 重新 parse」自检，保证结果仍是合法 TS
  for (const group of result.files) {
    const source = fileOf(files, group.file);
    const next = applyEdits(source.text, group.edits);
    const sf = parseSource(group.file, next);
    const diags = sf.parseDiagnostics ?? [];
    if (diags.length > 0) {
      const first = diags[0];
      const pos = offsetToLineCol(next, first.start ?? 0);
      throw new PlanError(
        `修改后语法校验未通过（${group.file}:${pos.line}）：${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`,
        'ESYNTAX',
      );
    }
    group.nextText = next;
  }
  return result;
}

function groupEdits(edits) {
  const map = new Map();
  for (const e of edits) {
    if (!map.has(e.file)) map.set(e.file, { file: e.file, edits: [] });
    map.get(e.file).edits.push(e);
  }
  return [...map.values()];
}

// ── set：标量字面量 ────────────────────────────────────────────────
function planSetLiteral(analysis, files, op) {
  const node = findNode(analysis, op.target);
  if (node.editability !== Editable.LITERAL) {
    throw new PlanError(`节点「${op.target}」不是可直接修改的字面量（当前为 ${node.editability}）`, 'ENOTWRITABLE');
  }
  const source = fileOf(files, node.anchor.file);
  const before = source.text.slice(node.anchor.start, node.anchor.end);
  const after = serializeScalar(op.value, node, source.text, node.anchor.start);
  if (before === after) return { files: [], impacts: [], noop: true };

  return wrap(
    {
      files: groupEdits([
        { file: node.anchor.file, start: node.anchor.start, end: node.anchor.end, newText: after },
      ]),
      impacts: [{ nodeId: node.id, file: node.anchor.file, before, after }],
    },
    files,
  );
}

function serializeScalar(value, node, text, near) {
  if (node.valueType === 'string') return stringLiteral(value, text, near);
  if (node.valueType === 'number') {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new PlanError(`不是合法数字：${value}`, 'EBADVALUE');
    return String(num);
  }
  if (node.valueType === 'boolean') return value ? 'true' : 'false';
  if (node.valueType === 'null') return 'null';
  if (typeof value === 'string') return stringLiteral(value, text, near);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  throw new PlanError(`无法序列化的值类型：${typeof value}`, 'EBADVALUE');
}

// ── set-ref：枚举 / 成员 / 处理器 / 焦点行绑定 ──────────────────────
function planSetRef(analysis, files, op) {
  const node = findNode(analysis, op.target);
  const allowed = [Editable.ENUM_REF, Editable.MEMBER_REF, Editable.HANDLER_REF, Editable.CALL_REF];
  if (!allowed.includes(node.editability)) {
    throw new PlanError(`节点「${op.target}」不支持引用型修改（当前为 ${node.editability}）`, 'ENOTWRITABLE');
  }
  const source = fileOf(files, node.anchor.file);
  const before = source.text.slice(node.anchor.start, node.anchor.end);

  let kind = op.refKind ?? 'generic';
  if (node.editability === Editable.ENUM_REF) kind = 'enum';
  else if (node.editability === Editable.HANDLER_REF) kind = 'handler';
  else if (node.editability === Editable.CALL_REF) kind = 'active';

  const after = validateRef(op.ref, kind);
  if (before === after) return { files: [], impacts: [], noop: true };

  return wrap(
    {
      files: groupEdits([
        { file: node.anchor.file, start: node.anchor.start, end: node.anchor.end, newText: after },
      ]),
      impacts: [{ nodeId: node.id, file: node.anchor.file, before, after }],
    },
    files,
  );
}

// ── 数组：插入 ─────────────────────────────────────────────────────
function planInsertArrayItem(analysis, files, op) {
  const node = findNode(analysis, op.target);
  if (node.editability !== Editable.ARRAY) {
    throw new PlanError(`节点「${op.target}」不是数组`, 'ENOTARRAY');
  }
  const source = fileOf(files, node.anchor.file);
  const text = source.text;
  const sf = parseSource(node.anchor.file, text);
  const arrayExpr = findNodeAt(sf, node.anchor.start, node.anchor.end);
  if (!arrayExpr || !ts.isArrayLiteralExpression(arrayExpr)) {
    throw new PlanError('内部分析不一致：目标区间不是数组字面量', 'EINTERNAL');
  }
  if (arrayExpr.elements.some((e) => ts.isSpreadElement(e))) {
    throw new PlanError('数组内含展开表达式，无法安全插入', 'EDYNAMIC');
  }

  const eol = detectEol(text);
  const unit = detectIndentUnit(text);
  const parentIndent = indentAt(text, node.anchor.start);
  const body = reindent(String(op.text ?? '').trim(), '');

  let itemIndent;
  if (arrayExpr.elements.length > 0) {
    itemIndent = indentAt(text, arrayExpr.elements[0].getStart()) || parentIndent + unit;
  } else {
    itemIndent = parentIndent + unit;
  }

  // 校验插入文本本身是合法表达式
  const probe = parseSource('probe.tsx', `const __x = (${body});`);
  if ((probe.parseDiagnostics ?? []).length > 0) {
    throw new PlanError('待插入的内容不是合法表达式', 'EBADVALUE');
  }
  const itemText = body.split('\n').join(eol ? `${eol}${''}` : '\n');

  if (arrayExpr.elements.length === 0) {
    const after = `[${eol}${itemIndent}${itemText}${eol}${parentIndent}]`;
    return wrap(
      {
        files: groupEdits([
          { file: node.anchor.file, start: node.anchor.start, end: node.anchor.end, newText: after },
        ]),
        impacts: [{ nodeId: node.id, file: node.anchor.file, before: '[]', after }],
      },
      files,
    );
  }

  const last = arrayExpr.elements[arrayExpr.elements.length - 1];
  const close = text.lastIndexOf(']', node.anchor.end - 1);
  const tail = text.slice(last.getEnd(), close);
  const commaIdx = tail.indexOf(',');

  let insertAt;
  let newText;
  if (commaIdx >= 0) {
    insertAt = last.getEnd() + commaIdx + 1;
    newText = `${eol}${itemIndent}${itemText},`;
  } else {
    insertAt = last.getEnd();
    newText = `,${eol}${itemIndent}${itemText}`;
  }

  return wrap(
    {
      files: groupEdits([{ file: node.anchor.file, start: insertAt, end: insertAt, newText }]),
      impacts: [{ nodeId: node.id, file: node.anchor.file, before: '(追加元素)', after: newText }],
    },
    files,
  );
}

/** 在 AST 里按字符区间找回节点。 */
function findNodeAt(sf, start, end) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (node.getStart() === start && node.getEnd() === end) {
      found = node;
      return;
    }
    if (node.getStart() <= start && node.getEnd() >= end) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// ── 数组：删除 ─────────────────────────────────────────────────────
function planDeleteArrayItem(analysis, files, op) {
  const node = findNode(analysis, op.target);
  if (node.editability !== Editable.ARRAY) throw new PlanError('目标不是数组', 'ENOTARRAY');
  const index = Number(op.index);
  const source = fileOf(files, node.anchor.file);
  const text = source.text;
  const sf = parseSource(node.anchor.file, text);
  const arrayExpr = findNodeAt(sf, node.anchor.start, node.anchor.end);
  if (!arrayExpr || !ts.isArrayLiteralExpression(arrayExpr)) {
    throw new PlanError('内部分析不一致：目标区间不是数组字面量', 'EINTERNAL');
  }
  const elements = arrayExpr.elements;
  if (index < 0 || index >= elements.length) throw new PlanError(`数组下标越界：${index}`, 'EBADINDEX');

  const el = elements[index];
  let start;
  let end;
  if (index < elements.length - 1) {
    const next = elements[index + 1];
    start = el.getStart();
    end = next.getStart();
  } else if (index > 0) {
    const prev = elements[index - 1];
    start = prev.getEnd();
    end = el.getEnd();
  } else {
    start = arrayExpr.getStart();
    end = arrayExpr.getEnd();
  }

  if (elements.length === 1) {
    return wrap(
      {
        files: groupEdits([
          { file: node.anchor.file, start: arrayExpr.getStart(), end: arrayExpr.getEnd(), newText: '[]' },
        ]),
        impacts: [{ nodeId: node.id, file: node.anchor.file, before: text.slice(start, end), after: '[]' }],
      },
      files,
    );
  }

  const before = text.slice(start, end);
  return wrap(
    {
      files: groupEdits([{ file: node.anchor.file, start, end, newText: '' }]),
      impacts: [{ nodeId: node.id, file: node.anchor.file, before, after: '' }],
    },
    files,
  );
}

// ── 数组：重排 / 跨位置移动 ────────────────────────────────────────
function planMoveArrayItem(analysis, files, op) {
  const node = findNode(analysis, op.target);
  if (node.editability !== Editable.ARRAY) throw new PlanError('目标不是数组', 'ENOTARRAY');
  const source = fileOf(files, node.anchor.file);
  const text = source.text;
  const sf = parseSource(node.anchor.file, text);
  const arrayExpr = findNodeAt(sf, node.anchor.start, node.anchor.end);
  if (!arrayExpr || !ts.isArrayLiteralExpression(arrayExpr)) {
    throw new PlanError('内部分析不一致：目标区间不是数组字面量', 'EINTERNAL');
  }
  const elements = [...arrayExpr.elements];
  const from = Number(op.from);
  const to = Number(op.to);
  if (from < 0 || from >= elements.length) throw new PlanError(`源下标越界：${from}`, 'EBADINDEX');
  if (to < 0 || to >= elements.length) throw new PlanError(`目标下标越界：${to}`, 'EBADINDEX');
  if (from === to) return { files: [], impacts: [], noop: true };

  const blocks = elements.map((el, i) => {
    const prevEnd = i === 0 ? arrayExpr.getStart() + 1 : elements[i - 1].getEnd();
    const comments = extractComments(text.slice(prevEnd, el.getStart()));
    return { comments, text: el.getText() };
  });

  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);

  const eol = detectEol(text);
  const parentIndent = indentAt(text, node.anchor.start);
  const unit = detectIndentUnit(text);
  const itemIndent = elements.length > 0 ? indentAt(text, elements[0].getStart()) || parentIndent + unit : parentIndent + unit;

  const rendered = blocks
    .map((b) => {
      const body = reindent(b.text, itemIndent);
      const head = b.comments.map((c) => `${itemIndent}${c}`).join(eol);
      return head ? `${head}${eol}${body}` : body;
    })
    .join(`,${eol}`);

  const after = `[${eol}${rendered},${eol}${parentIndent}]`;
  return wrap(
    {
      files: groupEdits([
        { file: node.anchor.file, start: arrayExpr.getStart(), end: arrayExpr.getEnd(), newText: after },
      ]),
      impacts: [
        {
          nodeId: node.id,
          file: node.anchor.file,
          before: text.slice(arrayExpr.getStart(), arrayExpr.getEnd()),
          after,
          note: '数组重排会重新渲染该数组；元素上的注释已尽力保留。',
        },
      ],
    },
    files,
  );
}

function extractComments(chunk) {
  const out = [];
  const re = /^\s*(\/\/.*|\/\*[\s\S]*?\*\/)\s*$/gm;
  let m = chunk.match(re);
  if (m) out.push(...m.map((s) => s.trim()));
  return out;
}

// ── 对象属性：删除 / 插入 ──────────────────────────────────────────
function planDeleteProp(analysis, files, op) {
  const node = findNode(analysis, op.target);
  const parentId = node.parentId;
  if (!parentId) throw new PlanError('目标没有父容器', 'ENOTARGET');
  const parent = findNode(analysis, parentId);
  if (parent.editability !== Editable.OBJECT) throw new PlanError('父容器不是对象字面量', 'ENOTOBJ');

  const source = fileOf(files, parent.anchor.file);
  const text = source.text;
  const sf = parseSource(parent.anchor.file, text);
  const objExpr = findNodeAt(sf, parent.anchor.start, parent.anchor.end);
  if (!objExpr || !ts.isObjectLiteralExpression(objExpr)) throw new PlanError('内部不一致：父容器不是对象', 'EINTERNAL');

  const props = objExpr.properties;
  const idx = props.findIndex((p) => p.getStart() === node.anchor.start);
  if (idx < 0) throw new PlanError('在父对象里找不到该属性', 'ENOTARGET');

  let start;
  let end;
  if (idx < props.length - 1) {
    start = props[idx].getStart();
    end = props[idx + 1].getStart();
  } else if (idx > 0) {
    start = props[idx - 1].getEnd();
    end = props[idx].getEnd();
  } else {
    start = objExpr.getStart() + 1;
    end = objExpr.getEnd() - 1;
  }

  const before = text.slice(start, end);
  return wrap(
    {
      files: groupEdits([{ file: parent.anchor.file, start, end, newText: '' }]),
      impacts: [{ nodeId: node.id, file: parent.anchor.file, before, after: '' }],
    },
    files,
  );
}

function planInsertProp(analysis, files, op) {
  const parent = findNode(analysis, op.target);
  if (parent.editability !== Editable.OBJECT) throw new PlanError('目标不是对象字面量', 'ENOTOBJ');
  const key = String(op.key ?? '').trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(key)) throw new PlanError(`属性名非法：${key}`, 'EBADVALUE');

  const source = fileOf(files, parent.anchor.file);
  const text = source.text;
  const sf = parseSource(parent.anchor.file, text);
  const objExpr = findNodeAt(sf, parent.anchor.start, parent.anchor.end);
  if (!objExpr || !ts.isObjectLiteralExpression(objExpr)) throw new PlanError('内部不一致：目标不是对象', 'EINTERNAL');
  if (objExpr.properties.some((p) => propName(p.name) === key)) {
    throw new PlanError(`属性 ${key} 已存在`, 'EEXISTS');
  }

  const eol = detectEol(text);
  const unit = detectIndentUnit(text);
  const parentIndent = indentAt(text, parent.anchor.start);
  const body = reindent(String(op.text ?? 'null').trim(), '');
  const propIndent =
    objExpr.properties.length > 0
      ? indentAt(text, objExpr.properties[0].getStart()) || parentIndent + unit
      : parentIndent + unit;

  if (objExpr.properties.length === 0) {
    const after = `{${eol}${propIndent}${key}: ${body},${eol}${parentIndent}}`;
    return wrap(
      {
        files: groupEdits([
          { file: parent.anchor.file, start: objExpr.getStart(), end: objExpr.getEnd(), newText: after },
        ]),
        impacts: [{ nodeId: parent.id, file: parent.anchor.file, before: '{}', after }],
      },
      files,
    );
  }

  const last = objExpr.properties[objExpr.properties.length - 1];
  const close = text.lastIndexOf('}', parent.anchor.end - 1);
  const tail = text.slice(last.getEnd(), close);
  const commaIdx = tail.indexOf(',');
  const newText =
    commaIdx >= 0
      ? `${eol}${propIndent}${key}: ${body},`
      : `,${eol}${propIndent}${key}: ${body}`;
  const insertAt = commaIdx >= 0 ? last.getEnd() + commaIdx + 1 : last.getEnd();

  return wrap(
    {
      files: groupEdits([{ file: parent.anchor.file, start: insertAt, end: insertAt, newText }]),
      impacts: [{ nodeId: parent.id, file: parent.anchor.file, before: '(新增属性)', after: newText }],
    },
    files,
  );
}

// ── 类成员：删除 / 插入 ────────────────────────────────────────────
function classFileOf(analysis, memberKind) {
  const file = analysis.page?.componentFiles?.[memberKind];
  if (!file) throw new PlanError(`页面没有可编辑的 ${memberKind} 文件`, 'ENOFILE');
  return file;
}

function planDeleteMember(analysis, files, op) {
  const file = classFileOf(analysis, op.memberKind);
  const source = fileOf(files, file);
  const sf = parseSource(file, source.text);
  const cls = findClassDecl(sf, [op.memberKind === 'view' ? 'ViewBase' : 'DataBase']);
  const member = cls?.members.find(
    (m) => ts.isPropertyDeclaration(m) && propName(m.name) === op.member,
  );
  if (!member) throw new PlanError(`找不到成员 ${op.member}`, 'ENOTARGET');

  // 引用阻断：被别处引用时不允许直接删
  const refs = (analysis.refs ?? []).filter(
    (r) => r.kind === (op.memberKind === 'view' ? 'view' : 'data') && r.member === op.member,
  );
  if (refs.length > 0 && !op.force) {
    throw new PlanError(
      `成员 ${op.member} 仍被 ${refs.length} 处引用，请先解除引用或使用强制删除。`,
      'EREFERENCED',
    );
  }

  const start = member.getFullStart();
  const end = member.getEnd();
  const before = source.text.slice(start, end);
  return wrap(
    {
      files: groupEdits([{ file, start, end, newText: '' }]),
      impacts: [{ nodeId: `member:${op.member}`, file, before, after: '' }],
    },
    files,
  );
}

function planInsertMember(analysis, files, op) {
  const file = classFileOf(analysis, op.memberKind);
  const source = fileOf(files, file);
  const text = source.text;
  const sf = parseSource(file, text);
  const cls = findClassDecl(sf, [op.memberKind === 'view' ? 'ViewBase' : 'DataBase']);
  if (!cls) throw new PlanError('找不到视图/数据类声明', 'ENOTARGET');

  const eol = detectEol(text);
  const unit = detectIndentUnit(text);
  const classIndent = indentAt(text, cls.getStart());
  const memberIndent = `${classIndent}${unit}`;

  let insertAt;
  if (cls.members.length > 0) {
    insertAt = cls.members[cls.members.length - 1].getEnd();
  } else {
    insertAt = cls.getStart() + 1;
  }
  const body = reindent(String(op.text ?? '').trim(), memberIndent);
  const newText = `${eol}${eol}${body}`;

  return wrap(
    {
      files: groupEdits([{ file, start: insertAt, end: insertAt, newText }]),
      impacts: [{ nodeId: `member:${op.memberName ?? 'new'}`, file, before: '(新增成员)', after: newText }],
    },
    files,
  );
}

// ── 语义重命名 ─────────────────────────────────────────────────────
function planRenameMember(analysis, files, project, op) {
  const kind = op.memberKind ?? 'view';
  const from = String(op.from ?? '').trim();
  const to = String(op.to ?? '').trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(to)) throw new PlanError(`新名称非法：${to}`, 'EBADVALUE');
  if (!from || from === to) throw new PlanError('缺少有效的重命名参数', 'EBADVALUE');

  const primary = classFileOf(analysis, kind);
  const declaredId =
    kind === 'view'
      ? analysis.page?.viewMembers?.[from]?.id ?? from
      : analysis.page?.dataMembers?.[from]?.id ?? from;
  const syncId = op.syncId !== false;

  const edits = [];
  const impacts = [];
  const covered = new Set();

  for (const file of files) {
    const abs = toPosix(file.file);
    const inPrimary = abs === toPosix(primary);
    const sf = parseSource(abs, file.text);

    const visit = (node) => {
      // 1) 类字段名
      if (inPrimary && ts.isPropertyDeclaration(node) && propName(node.name) === from) {
        const start = node.name.getStart();
        const end = node.name.getEnd();
        pushEdit(edits, impacts, covered, abs, file.text, start, end, to, '成员声明');
      }
      // 2) this.<from> 访问：只认「直接挂在 this 上」的那一层，
      //    否则 this.table1.id 会被误改成 this.table1.新名字（访问器名不是成员名）
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === from &&
        node.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        const start = node.name.getStart();
        const end = node.name.getEnd();
        pushEdit(edits, impacts, covered, abs, file.text, start, end, to, `引用 this.${from}`);
      }
      // 3) 字符串常量（id 值 / viewId / handler 参数 / @Active:）
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const value = node.text;
        if (syncId && value === declaredId) {
          const quote = file.text[node.getStart()];
          pushEdit(
            edits,
            impacts,
            covered,
            abs,
            file.text,
            node.getStart(),
            node.getEnd(),
            `${quote}${to}${quote}`,
            'ID 字面量',
          );
        } else if (!syncId && value === from) {
          const quote = file.text[node.getStart()];
          pushEdit(edits, impacts, covered, abs, file.text, node.getStart(), node.getEnd(), `${quote}${to}${quote}`, '字符串引用');
        } else if (value.startsWith('@Active:') && value.slice('@Active:'.length) === declaredId) {
          const quote = file.text[node.getStart()];
          pushEdit(
            edits,
            impacts,
            covered,
            abs,
            file.text,
            node.getStart(),
            node.getEnd(),
            `${quote}@Active:${to}${quote}`,
            '焦点行路径',
          );
        }
      }
      // 4) 类型层引用：Data['mainTable']['id']
      if (ts.isElementAccessExpression(node) && node.argumentExpression) {
        const arg = node.argumentExpression;
        if (ts.isStringLiteral(arg) && (arg.text === from || (syncId && arg.text === declaredId))) {
          const quote = file.text[arg.getStart()];
          pushEdit(edits, impacts, covered, abs, file.text, arg.getStart(), arg.getEnd(), `${quote}${to}${quote}`, '类型层引用');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // 未被静态识别的同名标识符（用于前端提示「未覆盖清单」）
  const uncovered = [];
  for (const file of files) {
    const sf = parseSource(toPosix(file.file), file.text);
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === from) {
        const start = node.getStart();
        if (!covered.has(`${toPosix(file.file)}:${start}`)) {
          const pos = offsetToLineCol(file.text, start);
          uncovered.push({ file: toPosix(file.file), line: pos.line, column: pos.column });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  if (edits.length === 0) throw new PlanError(`没有找到 ${from} 的任何可改引用`, 'ENOTARGET');

  return wrap({ files: groupEdits(edits), impacts, uncovered, declaredId }, files);
}

function pushEdit(edits, impacts, covered, file, text, start, end, newText, label) {
  const before = text.slice(start, end);
  if (before === newText) return;
  covered.add(`${file}:${start}`);
  edits.push({ file, start, end, newText });
  impacts.push({ file, before, after: newText, label });
}

export { PlanError };
