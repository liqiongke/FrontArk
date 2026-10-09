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
}

export interface PageInfo {
  route: string;
  level: 'L1' | 'L2';
  entry: string;
  entryRel: string;
  files: { file: string; rel: string }[];
  componentFiles: Record<string, string>;
  componentFilesRel: Record<string, string>;
  viewMembers: Record<string, { memberName: string; id: string | null; viewType: string | null; isRoot: boolean; layoutItems: string[] | null }>;
  dataMembers: Record<string, { memberName: string; id: string | null }>;
  handlerMethods: string[];
  rootId: string | null;
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
}

export interface ThemeFile {
  file: string;
  blocks: { selector: string; line: number }[];
  tokens: ThemeToken[];
}

export interface ThemeParse {
  files: ThemeFile[];
  groups: { id: string; label: string; tokens: string[] }[];
  relPaths: Record<string, string>;
  failed: string[];
}

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
  mockBase: string | null;
  apiBase: string;
  framework: string;
  env: Record<string, string>;
  hint: string;
}

/** 统一的成功信封。 */
export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  message?: string;
  code?: string;
}

export type Op =
  | { kind: 'set'; target: string; value: unknown }
  | { kind: 'set-ref'; target: string; ref: string }
  | { kind: 'insert-array-item'; target: string; text: string }
  | { kind: 'delete-array-item'; target: string; index: number }
  | { kind: 'move-array-item'; target: string; from: number; to: number }
  | { kind: 'delete-prop'; target: string }
  | { kind: 'insert-prop'; target: string; key: string; text: string }
  | { kind: 'delete-member'; memberKind: 'view' | 'data'; member: string; force?: boolean }
  | { kind: 'insert-member'; memberKind: 'view' | 'data'; text: string; memberName: string }
  | { kind: 'rename-member'; memberKind: 'view' | 'data'; from: string; to: string; syncId?: boolean };
