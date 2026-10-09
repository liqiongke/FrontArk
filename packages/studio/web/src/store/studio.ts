import { create } from 'zustand';
import * as api from '@/lib/api';
import type { Analysis, EditPlan, EditorInfo, Op, PageCandidate, PreviewInfo, Project, SemanticNode, ThemeParse } from '@/types';

export type NoticeLevel = 'info' | 'success' | 'warn' | 'error';

export interface Notice {
  id: number;
  level: NoticeLevel;
  message: string;
}

export type CenterMode = 'preview' | 'structure';
export type InspectorTab = 'structure' | 'property' | 'data' | 'theme' | 'source';

interface StudioState {
  // 连接
  health: api.Health | null;
  serverError: string | null;

  // 项目
  projects: api.ProjectListPayload['projects'];
  projectId: string | null;
  project: Project | null;

  // 页面
  pages: PageCandidate[];
  route: string;
  analysis: Analysis | null;
  loading: boolean;
  selectedNodeId: string | null;

  // 编辑
  plan: EditPlan | null;
  autoApply: boolean;

  // 预览
  preview: PreviewInfo | null;
  previewTick: number;
  iframe: HTMLIFrameElement | null;
  centerMode: CenterMode;

  // 主题 / 源码 / 其它
  inspectorTab: InspectorTab;
  theme: ThemeParse | null;
  themeDraft: Record<string, string>;
  editors: EditorInfo[];
  editorId: string;
  customEditor: string;
  history: { id: string; route: string; title: string; at: string; files: number }[];

  notices: Notice[];

  // ── actions ──
  notice(level: NoticeLevel, message: string): void;
  dismiss(id: number): void;

  bootstrap(): Promise<void>;
  loadProjects(): Promise<void>;
  addProject(rootPath: string, name?: string): Promise<void>;
  removeProject(id: string): Promise<void>;
  openProject(id: string): Promise<void>;

  loadPages(): Promise<void>;
  openRoute(route: string): Promise<void>;
  refreshAnalysis(): Promise<void>;
  selectNode(id: string | null): void;

  submit(op: Op, title: string): Promise<'planned' | 'applied' | 'noop' | 'failed'>;
  applyPlan(planId: string): Promise<void>;
  discardPlan(): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  loadHistory(): Promise<void>;

  loadTheme(): Promise<void>;
  draftTheme(key: string, value: string): void;
  clearThemeDraft(): void;
  saveThemeToken(token: { file: string; selector: string; token: string; value: string }): Promise<void>;

  loadEditors(scan?: boolean): Promise<void>;
  loadPreview(): Promise<void>;
  reloadPreview(): void;
  setIframe(el: HTMLIFrameElement | null): void;
  postToPreview(message: Record<string, unknown>): void;
  setCenterMode(mode: CenterMode): void;
  setInspectorTab(tab: InspectorTab): void;
}

let noticeSeq = 0;

export const useStudio = create<StudioState>()((set, get) => ({
  health: null,
  serverError: null,
  projects: [],
  projectId: null,
  project: null,
  pages: [],
  route: '',
  analysis: null,
  loading: false,
  selectedNodeId: null,
  plan: null,
  autoApply: localStorage.getItem('studio.autoApply') === '1',
  preview: null,
  previewTick: 0,
  iframe: null,
  centerMode: 'preview',
  inspectorTab: 'property',
  theme: null,
  themeDraft: {},
  editors: [],
  editorId: localStorage.getItem('studio.editor') ?? 'code',
  customEditor: localStorage.getItem('studio.editorCommand') ?? '',
  history: [],
  notices: [],

  notice(level, message) {
    noticeSeq += 1;
    const id = noticeSeq;
    set((s) => ({ notices: [...s.notices, { id, level, message }] }));
    window.setTimeout(() => get().dismiss(id), level === 'error' ? 9000 : 4500);
  },

  dismiss(id) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
  },

  async bootstrap() {
    try {
      const health = await api.fetchHealth();
      set({ health: health.data, serverError: null });
    } catch (err) {
      set({ serverError: (err as Error).message });
      return;
    }
    try {
      await get().loadProjects();
      await get().loadEditors();
      const { projects, projectId } = get();
      const initial = projectId ?? projects[0]?.id ?? null;
      if (initial) await get().openProject(initial);
    } catch (err) {
      get().notice('error', (err as Error).message);
    }
  },

  async loadProjects() {
    const res = await api.fetchProjects();
    set({ projects: res.data.projects });
  },

  async addProject(rootPath, name) {
    const res = await api.createProject(rootPath, name);
    get().notice(res.data.reused ? 'info' : 'success', res.data.reused ? '该目录已注册，已切换到该项目' : `已注册项目 ${res.data.project.name}`);
    await get().loadProjects();
    await get().openProject(res.data.project.id);
  },

  async removeProject(id) {
    await api.deleteProject(id);
    await get().loadProjects();
    if (get().projectId === id) {
      set({ projectId: null, project: null, analysis: null, pages: [], theme: null, route: '' });
      const next = get().projects[0]?.id;
      if (next) await get().openProject(next);
    }
  },

  async openProject(id) {
    set({ projectId: id, loading: true, analysis: null, selectedNodeId: null, plan: null, theme: null });
    try {
      const res = await api.fetchProject(id);
      set({ project: res.data.project });
      await Promise.all([get().loadPages(), get().loadTheme(), get().loadPreview(), get().loadHistory()]);
      const { pages, route } = get();
      const first = pages.find((p) => p.route === '/base/table')?.route ?? pages[0]?.route;
      const target = route && pages.some((p) => p.route === route) ? route : first;
      if (target) await get().openRoute(target);
      else set({ loading: false });
    } catch (err) {
      set({ loading: false });
      get().notice('error', (err as Error).message);
    }
  },

  async loadPages() {
    const id = get().projectId;
    if (!id) return;
    const res = await api.fetchPages(id);
    set({ pages: res.data.pages });
  },

  async openRoute(route) {
    set({ route, selectedNodeId: null, loading: true, inspectorTab: 'property' });
    await get().refreshAnalysis();
    get().reloadPreview();
  },

  async refreshAnalysis() {
    const { projectId, route } = get();
    if (!projectId || !route) {
      set({ loading: false });
      return;
    }
    try {
      const res = await api.fetchAnalysis(projectId, route);
      set({ analysis: res.data, loading: false });
    } catch (err) {
      set({ loading: false });
      get().notice('error', `解析失败：${(err as Error).message}`);
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id });
    if (id) get().postToPreview({ type: 'fa-highlight', nodeId: id });
  },

  async submit(op, title) {
    const { projectId, route, autoApply } = get();
    if (!projectId) return 'failed';
    try {
      const res = await api.planEdit({ projectId, route, op, title });
      if (res.noop) {
        get().notice('info', res.message ?? '新值与当前值一致，无需修改');
        return 'noop';
      }
      if (!res.ok) {
        get().notice('error', res.message ?? '无法完成该修改');
        return 'failed';
      }
      const plan = res.data;
      if (!plan.files || plan.files.length === 0) {
        get().notice('info', '没有需要修改的内容');
        return 'noop';
      }
      // 低风险改动（单文件、单点）在开启「改完即存」时直接落盘，其余走确认
      if (autoApply && plan.files.length === 1 && (plan.impacts?.length ?? 0) <= 1) {
        await get().applyPlan(plan.id);
        return 'applied';
      }
      set({ plan });
      return 'planned';
    } catch (err) {
      get().notice('error', (err as Error).message);
      return 'failed';
    }
  },

  async applyPlan(planId) {
    const { projectId } = get();
    if (!projectId) return;
    try {
      const res = await api.applyEdit(projectId, planId);
      set({ plan: null });
      get().notice('success', res.data.message);
      await get().refreshAnalysis();
      await get().loadHistory();
      get().reloadPreview();
    } catch (err) {
      set({ plan: null });
      get().notice('error', (err as Error).message);
      // 落盘失败（多为文件被外部改动）时刷新一次，让界面回到真实磁盘状态
      await get().refreshAnalysis();
    }
  },

  discardPlan() {
    set({ plan: null });
  },

  async undo() {
    const { projectId } = get();
    if (!projectId) return;
    try {
      const res = await api.undoEdit(projectId);
      get().notice('success', res.data.message);
      await get().refreshAnalysis();
      await get().loadHistory();
      get().reloadPreview();
    } catch (err) {
      get().notice('error', (err as Error).message);
    }
  },

  async redo() {
    const { projectId } = get();
    if (!projectId) return;
    try {
      const res = await api.redoEdit(projectId);
      get().notice('success', res.data.message);
      await get().refreshAnalysis();
      await get().loadHistory();
      get().reloadPreview();
    } catch (err) {
      get().notice('error', (err as Error).message);
    }
  },

  async loadHistory() {
    const id = get().projectId;
    if (!id) return;
    try {
      const res = await api.fetchHistory(id);
      set({ history: res.data.history });
    } catch {
      /* 历史不是关键路径，失败静默 */
    }
  },

  async loadTheme() {
    const id = get().projectId;
    if (!id) return;
    try {
      const res = await api.fetchTheme(id);
      set({ theme: res.data, themeDraft: {} });
    } catch (err) {
      get().notice('warn', `主题解析失败：${(err as Error).message}`);
    }
  },

  draftTheme(key, value) {
    const draft = { ...get().themeDraft, [key]: value };
    set({ themeDraft: draft });
    // 即时预览：把草稿变量推给预览 iframe（不落盘）
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      const token = k.split('|')[1];
      if (token) vars[`--${token}`] = v;
    }
    get().postToPreview({ type: 'fa-theme', vars });
  },

  clearThemeDraft() {
    set({ themeDraft: {} });
    get().postToPreview({ type: 'fa-theme', vars: {} });
  },

  async saveThemeToken(token) {
    const { projectId, route } = get();
    if (!projectId) return;
    try {
      const res = await api.planEdit({
        projectId,
        route,
        source: 'theme',
        file: token.file,
        selector: token.selector,
        token: token.token,
        value: token.value,
        title: `主题 ${token.selector} → --${token.token}`,
      });
      if (!res.ok) {
        get().notice('error', res.message ?? '主题保存失败');
        return;
      }
      if (res.noop) {
        get().notice('info', '该 token 的值未变化');
        return;
      }
      await get().applyPlan(res.data.id);
      get().clearThemeDraft();
      await get().loadTheme();
    } catch (err) {
      get().notice('error', (err as Error).message);
    }
  },

  async loadEditors(scan = false) {
    try {
      const res = await api.fetchEditors(scan);
      set({ editors: res.data.editors });
      const current = get().editorId;
      if (res.data.editors.length > 0 && !res.data.editors.some((e) => e.id === current)) {
        set({ editorId: res.data.editors[0].id });
      }
    } catch (err) {
      get().notice('warn', `编辑器探测失败：${(err as Error).message}`);
    }
  },

  async loadPreview() {
    const id = get().projectId;
    if (!id) return;
    try {
      const res = await api.fetchPreview(id);
      set({ preview: res.data });
    } catch {
      /* 预览不可用不阻塞其它能力 */
    }
  },

  reloadPreview() {
    set((s) => ({ previewTick: s.previewTick + 1 }));
  },

  setIframe(el) {
    set({ iframe: el });
  },

  postToPreview(message) {
    get().iframe?.contentWindow?.postMessage(message, '*');
  },

  setCenterMode(mode) {
    set({ centerMode: mode });
  },

  setInspectorTab(tab) {
    set({ inspectorTab: tab });
  },
}));

/** 依据节点 id 在分析结果里取节点。 */
export function nodeById(analysis: Analysis | null, id: string | null): SemanticNode | null {
  if (!analysis || !id) return null;
  return analysis.nodes.find((n) => n.id === id) ?? null;
}

/** 节点的祖先链（从根到自身）。 */
export function ancestorsOf(analysis: Analysis | null, id: string | null): SemanticNode[] {
  if (!analysis || !id) return [];
  const byId = new Map(analysis.nodes.map((n) => [n.id, n]));
  const chain: SemanticNode[] = [];
  let cur = byId.get(id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}
