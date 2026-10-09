/** Studio 后端 HTTP 客户端（统一走 Vite 代理的相对路径 /api）。 */
import type {
  Analysis,
  ApiEnvelope,
  EditorInfo,
  EditPlan,
  EditRecord,
  Op,
  PageCandidate,
  PreviewInfo,
  Project,
  StudioSettings,
  ThemeParse,
} from '@/types';

/**
 * 带错误码的请求异常。
 * `code` 用于区分「并发冲突（stale-plan，可刷新重试）」与「请求本身有问题」。
 */
export class StudioError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.status = status;
  }
}

/** 局域网模式下服务端要求 Token；EventSource 不能带 header，所以两边都要能取到。 */
export const getToken = () => sessionStorage.getItem('studio.token') ?? '';
export const setToken = (t: string) => {
  if (t) sessionStorage.setItem('studio.token', t);
  else sessionStorage.removeItem('studio.token');
};

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let payload: { message?: string; code?: string } & Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`响应不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new StudioError(payload.message ?? `请求失败（HTTP ${res.status}）`, payload.code ?? '', res.status);
  }
  return payload as T;
}

const get = <T>(path: string) => request<T>(path, { method: 'GET' });
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });

// ── 健康 ─────────────────────────────────────────────────────────
export interface Health {
  ok: boolean;
  repoRoot: string;
  configDir: string;
  uptime: string;
  projects: number;
  analyzer: { entry: string; restarts: number; error: string };
  authNeeded: boolean;
}

export const fetchHealth = () => get<ApiEnvelope<Health>>('/health');

// ── 项目 ─────────────────────────────────────────────────────────
export interface ProjectListPayload {
  projects: (Pick<Project, 'id' | 'name' | 'packageName' | 'rootPath' | 'kind' | 'hasFramework' | 'warnings'> & {
    pagesDir: string;
  })[];
}

export const fetchProjects = () => get<ApiEnvelope<ProjectListPayload>>('/projects');

export const fetchProject = (id: string) => get<ApiEnvelope<{ project: Project }>>(`/projects/${id}`);

export const createProject = (rootPath: string, name?: string) =>
  post<ApiEnvelope<{ project: Project; reused?: boolean; pages?: PageCandidate[]; message?: string }>>(
    '/projects',
    { rootPath, name },
  );

export const deleteProject = (id: string) => request<ApiEnvelope<{ message: string }>>(`/projects/${id}`, { method: 'DELETE' });

export const reprobeProject = (id: string) =>
  post<ApiEnvelope<{ project: Project; pages: PageCandidate[] }>>(`/projects/${id}/probe`);

export const updateProject = (id: string, body: { name?: string; overrides?: Record<string, unknown> }) =>
  request<ApiEnvelope<{ project: Project }>>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const fetchPages = (id: string) =>
  get<ApiEnvelope<{ pages: PageCandidate[] }>>(`/projects/${id}/pages`);

// ── 分析 ─────────────────────────────────────────────────────────
export const fetchAnalysis = (id: string, route: string) =>
  get<ApiEnvelope<Analysis>>(
    `/projects/${id}/pages/analyze?route=${encodeURIComponent(route)}`,
  );

export const fetchMeta = (id: string) =>
  get<ApiEnvelope<{ enums: Analysis['enums']; labels: Record<string, string> }>>(`/projects/${id}/meta`);

export const fetchRefs = (id: string) =>
  get<ApiEnvelope<{ index: Record<string, unknown[]>; pages: string[] }>>(`/projects/${id}/refs`);

// ── 源码 ─────────────────────────────────────────────────────────
export interface SourcePayload {
  file: string;
  rel: string;
  text: string;
  lines: number;
  sha: string;
}

export const fetchSource = (projectId: string, file: string) =>
  get<ApiEnvelope<SourcePayload>>(
    `/source?projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(file)}`,
  );

// ── 编辑 ─────────────────────────────────────────────────────────
/** 编辑计划的响应：成功是信封；被未覆盖引用拦住时是 ok:false + code。 */
export type PlanEditResponse = ApiEnvelope<EditPlan> & {
  noop?: boolean;
  uncovered?: { file: string; line: number; column: number }[];
};

export const planEdit = (body: {
  projectId: string;
  route: string;
  source?: 'page' | 'theme';
  op?: Op;
  file?: string;
  selector?: string;
  token?: string;
  value?: string;
  occurrence?: number;
  acknowledgeUncovered?: boolean;
  title?: string;
}) => post<PlanEditResponse>('/edit/plan', body);

export const applyEdit = (projectId: string, planId: string) =>
  post<ApiEnvelope<{ record: EditRecord; message: string }>>('/edit/apply', { projectId, planId });

export const undoEdit = (projectId: string) =>
  post<ApiEnvelope<{ record: EditRecord; message: string }>>('/edit/undo', { projectId });

export const redoEdit = (projectId: string) =>
  post<ApiEnvelope<{ record: EditRecord; message: string }>>('/edit/redo', { projectId });

export const fetchHistory = (id: string) =>
  get<
    ApiEnvelope<{
      history: {
        id: string;
        route: string;
        title: string;
        at: string;
        files: number;
        /** 这条记录改了哪几处（before/after 片段），历史详情的展示来源。 */
        impacts?: { file: string; before: string; after: string; label?: string }[];
      }[];
    }>
  >(`/projects/${id}/history`);

// ── 主题 ─────────────────────────────────────────────────────────
export const fetchTheme = (id: string) => get<ApiEnvelope<ThemeParse>>(`/projects/${id}/theme`);

// ── 模板 ─────────────────────────────────────────────────────────
export const fetchTemplates = (projectId: string, containerKey: string, index = 0) =>
  get<ApiEnvelope<{ candidates: { id: string; label: string; text: string }[] }>>(
    `/templates?projectId=${encodeURIComponent(projectId)}&containerKey=${encodeURIComponent(containerKey)}&index=${index}`,
  );

export const fetchMemberTemplate = (projectId: string, memberKind: 'view' | 'data', memberName: string, id: string) =>
  get<ApiEnvelope<{ text: string }>>(
    `/templates?projectId=${encodeURIComponent(projectId)}&memberKind=${memberKind}&memberName=${encodeURIComponent(memberName)}&id=${encodeURIComponent(id)}`,
  );

// ── 编辑器 ───────────────────────────────────────────────────────
export const fetchEditors = (scan = false) =>
  get<ApiEnvelope<{ editors: EditorInfo[] }>>(`/editors${scan ? '?scan=1' : ''}`);

/**
 * 唤起外部编辑器。
 *
 * 注意这里**不传命令**：命令只能来自服务端白名单（或服务端配置的自定义模板），
 * 否则这个接口就等于「让请求方在这台机器上执行任意命令」。
 */
export const openInEditor = (body: {
  projectId: string;
  file: string;
  line?: number;
  column?: number;
  editor?: string;
}) => post<ApiEnvelope<{ message: string; command: string }>>('/open', body);

// ── 本机设置（仅回环地址可写）────────────────────────────────────
export const fetchSettings = () => get<ApiEnvelope<StudioSettings>>('/settings');
export const saveSettings = (body: { editorCommand: string }) =>
  put<ApiEnvelope<{ editorCommand: string; message: string }>>('/settings', body);

// ── 预览 ─────────────────────────────────────────────────────────
export const fetchPreview = (id: string) => get<ApiEnvelope<PreviewInfo>>(`/projects/${id}/preview`);

// ── 事件流 ───────────────────────────────────────────────────────
export interface StudioEvent {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * 订阅服务端事件。
 *
 * `EventSource` 这个浏览器 API 不支持自定义请求头，所以 Token 只能走 query ——
 * 这也正是服务端对 /api/events 额外放行 `?token=` 的原因。
 * 事件名与服务端实际广播的保持一致，避免"前端等一个永远不会来的事件"。
 */
export function subscribeEvents(onEvent: (event: StudioEvent) => void): () => void {
  const token = getToken();
  const source = new EventSource(`/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  const types = ['files-changed', 'projects-changed'];
  const handlers: [string, (e: MessageEvent) => void][] = types.map((type) => [
    type,
    (e: MessageEvent) => {
      try {
        onEvent({ type, payload: JSON.parse(e.data) as Record<string, unknown> });
      } catch {
        onEvent({ type, payload: {} });
      }
    },
  ]);
  for (const [type, handler] of handlers) source.addEventListener(type, handler as EventListener);
  return () => {
    for (const [type, handler] of handlers) source.removeEventListener(type, handler as EventListener);
    source.close();
  };
}
