/** 与 Go 服务 / analyzer 的数据契约。 */

export type Editability =
  | 'literal'
  | 'object'
  | 'array'
  | 'enumRef'
  | 'memberRef'
  | 'callRef'
  | 'handlerRef'
  | 'moduleRef'
  | 'expr'
  | 'sourceOnly';

export interface Anchor {
  file: string;
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  /** 该区间文本的 sha1：apply 时用于判断「漂移的是不是这一处」。 */
  hash?: string;
}

export interface SemanticNode {
  id: string;
  parentId: string | null;
  kind: 'page' | 'view' | 'data' | 'handler' | 'prop' | 'arrayItem';
  name: string;
  label: string;
  description?: string;
  editability: Editability;
  valueType?: string | null;
  value?: unknown;
  expr?: string | null;
  enumObject?: string | null;
  enumMember?: string | null;
  handlerMethod?: string | null;
  moduleRef?: string | null;
  ref?: { kind: string; member?: string | null; viewIdExpr?: string | null } | null;
  file?: string;
  anchor?: Anchor | null;
  containerKey?: string | null;
  index?: number | null;
  degraded?: boolean;
  /** 容器含 `...` 展开：属性可读，但新增/重排这类结构性改动会被拒绝。 */
  hasSpread?: boolean;
  children: string[];
  viewType?: string | null;
  declaredId?: string | null;
  memberName?: string | null;
}

export interface Issue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  target?: string;
  file?: string;
  line?: number | null;
}

export interface PageInfo {
  route: string;
  /**
   * 识别级别：
   *   L1 框架页面（可编辑）／L2 普通 React 页面（只读浏览）／
   *   L3 入口是转发壳（重导出、动态装配）：连渲染什么都无法静态确定。
   */
  level: 'L1' | 'L2' | 'L3';
  entry: string;
  entryRel: string;
  files: { file: string; rel: string }[];
  componentFiles: Record<string, string>;
  componentFilesRel: Record<string, string>;
  viewMembers: Record<string, { memberName: string; id: string | null; viewType: string | null; isRoot: boolean; layoutItems: string[] | null }>;
  dataMembers: Record<string, { memberName: string; id: string | null }>;
  handlerMethods: string[];
  rootId: string | null;
  /** 组件文件自身的语法错误（有值 → 该文件节点已降级只读）。 */
  syntaxIssues?: { file: string; line: number; column: number; message: string }[];
}

export interface EnumMember {
  name: string;
  value: string | number | null;
  label: string;
  description?: string;
}

export interface EnumDef {
  name: string;
  label: string;
  file: string;
  members: EnumMember[];
}

export interface Analysis {
  page: PageInfo | null;
  nodes: SemanticNode[];
  issues: Issue[];
  refs: { from: string; kind: string; member: string | null; file?: string; anchor?: Anchor }[];
  enums: Record<string, EnumDef>;
  labels: Record<string, string>;
  fileSHAs: Record<string, string>;
}

export interface PageCandidate {
  route: string;
  dir: string;
  entry: string;
  /**
   * 页面别名（可选）：在页面入口文件里用一行注释声明，例如
   *   // @studio-name 系统表格页面
   * 有别名时左栏「页面」列表用它代替路由显示，路由退到 hover tooltip；
   * 没写则直接显示路由。解析见 analyzer/src/pages.mjs 的 pageNameOf。
   */
  name?: string | null;
  /**
   * 廉价分级（只读入口文本推断），用于左栏在点开前就能区分可编辑与只读；
   * 精确级别以 page.analyze 返回的 page.level 为准。
   */
  level?: 'L1' | 'L2' | 'L3';
}

export interface ProjectSource {
  pagesDir: string;
  aliases: Record<string, string>;
  frameworkSrc: string;
  devPort?: number | null;
  mockBaseUrl?: string | null;
  env?: Record<string, string>;
  envSources?: Record<string, string>;
}

export interface Project {
  id: string;
  name: string;
  packageName?: string | null;
  rootPath: string;
  workspaceRoot: string;
  kind: string;
  hasFramework: boolean;
  source: ProjectSource;
  themeFiles: string[];
  notes: string[];
  warnings: string[];
  createdAt: string;
}

export interface EditorInfo {
  id: string;
  label: string;
  command: string;
  args: string[];
  detected: boolean;
  path?: string;
}

export interface PlanEdit {
  file: string;
  start: number;
  end: number;
  newText: string;
}

export interface PlanFile {
  file: string;
  edits: PlanEdit[];
  nextText?: string;
  sha?: string;
}

export interface EditPlan {
  id: string;
  projectId: string;
  route: string;
  title: string;
  files: PlanFile[];
  impacts: { file: string; before: string; after: string; label?: string; nodeId?: string; note?: string }[];
  uncovered?: { file: string; line: number; column: number }[];
}

export interface EditRecord {
  id: string;
  route: string;
  title: string;
  at: string;
  files: { path: string; before: string; after: string }[];
  impacts?: { file: string; before: string; after: string; label?: string }[];
}

export interface ThemeToken {
  file: string;
  selector: string;
  token: string;
  value: string;
  group: string;
  /** 同一选择器内同名 token 的第几处声明（0 起）。 */
  occurrence?: number;
  /** 该 token 在选择器内重复声明。 */
  duplicate?: boolean;
}

export interface ThemeFile {
  file: string;
  blocks: { selector: string; line: number }[];
  tokens: ThemeToken[];
}

/** 一组前景/背景的对比度检查结果。 */
export interface ThemeContrastCheck {
  selector: string;
  file: string;
  fg: string;
  bg: string;
  fgValue: string;
  bgValue: string;
  ratio: number;
  level: 'pass' | 'large-only' | 'fail';
}

export interface ThemeParse {
  files: ThemeFile[];
  groups: { id: string; label: string; tokens: string[] }[];
  relPaths: Record<string, string>;
  failed: string[];
  issues?: Issue[];
  checks?: ThemeContrastCheck[];
}

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
  mockBase: string | null;
  apiBase: string;
  framework: string;
  env: Record<string, string>;
  maskedEnvKeys?: string[];
  hint: string;
}

export interface StudioSettings {
  editorCommand: string;
  customEditorHelp: string;
  previewPort: number;
  studioPort: number;
}

/** 统一的成功信封。 */
export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  message?: string;
  code?: string;
}

/**
 * 提交编辑意图时附带的锚点哈希。
 *
 * 服务端用它判断「用户当时看到的那个节点」是否还是当前源码里的同一个节点：
 * 文件被外部改过时同一个 nodeId 可能已指向别的位置，照旧执行会**静默改错地方**。
 * 由 store 自动从选中节点填充，各调用点不需要关心。
 */
export interface OpDriftGuard {
  anchorHash?: string;
}

export type Op = (
  | { kind: 'set'; target: string; value: unknown }
  | { kind: 'set-ref'; target: string; ref: string }
  | { kind: 'insert-array-item'; target: string; text: string }
  | { kind: 'delete-array-item'; target: string; index: number }
  | { kind: 'move-array-item'; target: string; from: number; to: number }
  | { kind: 'delete-prop'; target: string }
  | { kind: 'insert-prop'; target: string; key: string; text: string }
  | { kind: 'delete-member'; memberKind: 'view' | 'data'; member: string; force?: boolean }
  | { kind: 'insert-member'; memberKind: 'view' | 'data'; text: string; memberName: string }
  | { kind: 'rename-member'; memberKind: 'view' | 'data'; from: string; to: string; syncId?: boolean }
) &
  OpDriftGuard;
