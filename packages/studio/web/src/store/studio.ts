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

export interface UncoveredRef {
  file: string;
  line: number;
  column: number;
}

/** 等待用户确认「有无法静态确认的引用，仍要继续」的挂起状态。 */
export interface UncoveredState {
  op: Op;
  title: string;
  message: string;
  items: UncoveredRef[];
}

export interface SubmitOptions {
  acknowledgeUncovered?: boolean;
  /** 跳过确认直接落盘（用户已经显式点过「保存」，不需要再看一遍 diff）。 */
  forceApply?: boolean;
}

/**
 * 一条已暂存但未落盘的改动。
 *
 * 属性面板上改一个值**不该立刻写磁盘**：改完一列宽度就落一次盘，既没有回头路，
 * 也会把 git diff 打成一堆碎片。所以值类改动先进这里，由用户统一「保存」。
 * 结构性改动（增删节点、重命名）风险更高，仍然走「生成计划 → 看 diff → 确认」。
 */
export interface StagedOp {
  /** 稳定键（同目标同操作只保留最后一次），用于去重与"未保存"标记。 */
  key: string;
  op: Op;
  title: string;
  /** 展示用短标签，例如「价格 · 标题」。 */
  label: string;
}

/**
 * 危险动作前的确认请求。
 *
 * 存在的意义：像「在本机唤起外部编辑器」这类动作会在**运行服务的机器**上启动进程，
 * 属于请求方能触发的副作用，必须由人显式点头——后端只保证"命令来自白名单"，
 * 管不了"这一次是不是用户真想开"。
 *
 * skipKey 提供后允许勾选"以后不再询问"，结果记在 localStorage。
 */
export interface ConfirmRequest {
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
  skipKey?: string;
}

export interface ConfirmState extends ConfirmRequest {
  resolve: (ok: boolean) => void;
  skip: boolean;
}

let analysisSeq = 0;

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
  uncovered: UncoveredState | null;
  /** 值类改动草稿：等用户点「保存」再统一落盘。 */
  staged: StagedOp[];

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
  editorCommandSaved: boolean;
  history: { id: string; route: string; title: string; at: string; files: number }[];

  notices: Notice[];

  /** 挂起中的确认请求（null 表示没有）。 */
  confirm: ConfirmState | null;

  /**
   * 一次性源码定位请求。
   *
   * 问题面板里的诊断（缺 token、语法错误、重复 id）不一定对应某个语义节点，
   * 但它们都知道自己在哪个文件哪一行 —— 用它把源码面板指过去。
   */
  sourceFocus: { file: string; line: number } | null;

  // ── actions ──
  notice(level: NoticeLevel, message: string): void;
  dismiss(id: number): void;

  /** 弹确认框，resolve 为用户的答复。 */
  askConfirm(req: ConfirmRequest): Promise<boolean>;
  setConfirmSkip(skip: boolean): void;
  answerConfirm(ok: boolean): void;
  /** 带确认地在外部编辑器中打开文件（危险动作统一入口）。 */
  openExternally(target: { file: string; line?: number; column?: number }): Promise<void>;
  /** 请求源码面板定位到某文件的某一行（一次性）。 */
  focusSource(file: string, line: number): void;
  clearSourceFocus(): void;

  bootstrap(): Promise<void>;
  loadProjects(): Promise<void>;
  addProject(rootPath: string, name?: string): Promise<void>;
  removeProject(id: string): Promise<void>;
  openProject(id: string): Promise<void>;

  loadPages(): Promise<void>;
  openRoute(route: string): Promise<void>;
  refreshAnalysis(): Promise<void>;
  selectNode(id: string | null): void;

  submit(op: Op, title: string, options?: SubmitOptions): Promise<'planned' | 'applied' | 'noop' | 'failed' | 'blocked'>;
  applyPlan(planId: string): Promise<void>;
  discardPlan(): void;
  /** 暂存一条值类改动（不落盘）。 */
  stageOp(op: Op, title: string, label: string): void;
  unstageOp(key: string): void;
  discardStaged(): void;
  /** 把草稿全部提交落盘。 */
  saveAllStaged(): Promise<void>;
  confirmUncovered(): void;
  dismissUncovered(): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  loadHistory(): Promise<void>;

  loadTheme(): Promise<void>;
  draftTheme(key: string, value: string): void;
  clearThemeDraft(): void;
  saveThemeToken(token: {
    file: string;
    selector: string;
    token: string;
    value: string;
    occurrence?: number;
  }): Promise<void>;

  loadEditors(scan?: boolean): Promise<void>;
  loadSettings(): Promise<void>;
  saveEditorCommand(command: string): Promise<void>;
  setCustomEditor(command: string): void;
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
  uncovered: null,
  staged: [],
  preview: null,
  previewTick: 0,
  iframe: null,
  centerMode: 'preview',
  inspectorTab: 'property',
  theme: null,
  themeDraft: {},
  editors: [],
  editorId: localStorage.getItem('studio.editor') ?? 'code',
  // 自定义命令模板由服务端持有（不进请求体），前端只做展示与提交
  customEditor: '',
  editorCommandSaved: true,
  history: [],
  notices: [],
  confirm: null,
  sourceFocus: null,

  notice(level, message) {
    noticeSeq += 1;
    const id = noticeSeq;
    set((s) => ({ notices: [...s.notices, { id, level, message }] }));
    window.setTimeout(() => get().dismiss(id), level === 'error' ? 9000 : 4500);
  },

  dismiss(id) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
  },

  askConfirm(req) {
    if (req.skipKey && localStorage.getItem(req.skipKey) === '1') {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      set({ confirm: { ...req, resolve, skip: false } });
    });
  },

  setConfirmSkip(skip) {
    const current = get().confirm;
    if (!current) return;
    set({ confirm: { ...current, skip } });
  },

  answerConfirm(ok) {
    const current = get().confirm;
    if (!current) return;
    // 只在「确认执行 + 勾了不再询问」时记忆；取消不记，
    // 否则误点一次"取消"会让人以为被记住的是拒绝。
    if (ok && current.skip && current.skipKey) localStorage.setItem(current.skipKey, '1');
    set({ confirm: null });
    current.resolve(ok);
  },

  async openExternally(target) {
    const { project, editorId } = get();
    if (!project) return;
    const where = `${target.file}:${target.line ?? 1}:${target.column ?? 1}`;
    const ok = await get().askConfirm({
      title: '在本机唤起外部编辑器',
      message: `Studio 会在运行服务的这台机器上启动「${editorId}」进程，并打开目标文件。请确认目标文件与编辑器无误。`,
      detail: where,
      confirmText: '打开',
      skipKey: 'studio.skipEditorConfirm',
    });
    if (!ok) return;
    try {
      const res = await api.openInEditor({
        projectId: project.id,
        file: target.file,
        line: target.line ?? 1,
        column: target.column ?? 1,
        editor: editorId,
      });
      get().notice('success', res.data.message ?? '已唤起编辑器');
    } catch (err) {
      get().notice('error', (err as Error).message);
    }
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
      await get().loadSettings();
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
    set({
      projectId: id,
      loading: true,
      analysis: null,
      selectedNodeId: null,
      plan: null,
      theme: null,
      staged: [],
    });
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
    // 草稿里记的是当前页面的节点 id，换页面后必然失效 —— 丢弃并提示，
    // 免得用户以为"改了但没保存"的东西还在。
    const stale = get().staged.length;
    set({ route, selectedNodeId: null, loading: true, inspectorTab: 'property', staged: [] });
    if (stale > 0) get().notice('warn', `切换页面，已丢弃 ${stale} 项未保存的改动`);
    await get().refreshAnalysis();
    get().reloadPreview();
  },

  async refreshAnalysis() {
    const { projectId, route } = get();
    if (!projectId || !route) {
      set({ loading: false });
      return;
    }
    // 请求序号：快速切页面时，先发的请求可能后回来。
    // 没有这个守卫，旧页面的分析结果会盖掉新页面的（右侧面板显示"别人的"属性）。
    analysisSeq += 1;
    const seq = analysisSeq;
    const key = `${projectId}::${route}`;
    try {
      const res = await api.fetchAnalysis(projectId, route);
      if (seq !== analysisSeq) return; // 已经有更新的请求在路上了
      set({ analysis: res.data, loading: false });
    } catch (err) {
      if (seq !== analysisSeq) return;
      set({ loading: false });
      get().notice('error', `解析失败（${key}）：${(err as Error).message}`);
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id });
    // 与预览宿主的协议一致：同一条 fa-select 既做选中也做高亮
    get().postToPreview({ type: id ? 'fa-select' : 'fa-deselect', nodeId: id ?? undefined });
  },

  async submit(op, title, options) {
    const { projectId, route, autoApply } = get();
    if (!projectId) return 'failed';
    try {
      const res = await api.planEdit({
        projectId,
        route,
        op: withDriftGuard(get().analysis, op),
        title,
        acknowledgeUncovered: options?.acknowledgeUncovered,
      });
      if (res.noop) {
        get().notice('info', res.message ?? '新值与当前值一致，无需修改');
        return 'noop';
      }
      if (!res.ok) {
        // 未覆盖引用：不直接失败，而是交给调用方决定要不要"确认继续"。
        if (res.code === 'uncovered-refs') {
          set({
            uncovered: {
              op,
              title,
              message: res.message ?? '存在无法静态确认的引用',
              items: (res.uncovered ?? []) as UncoveredRef[],
            },
          });
          return 'blocked';
        }
        // 锚点漂移：源码被外部改过，同一 nodeId 可能已指向别处。
        // 提示之后立刻刷新，让界面回到真实状态，否则用户会一直撞同一个错。
        if (res.code === 'EANCHOR') {
          get().notice('error', res.message ?? '源码已被外部修改，请刷新后重试');
          await get().refreshAnalysis();
          return 'failed';
        }
        get().notice('error', res.message ?? '无法完成该修改');
        return 'failed';
      }
      // 走到这里 res.data 才是计划本体（未覆盖分支里没有 data）
      if (!res.data) {
        get().notice('error', res.message ?? '服务端没有返回可应用的编辑计划');
        return 'failed';
      }
      const plan = res.data;
      if (!plan.files || plan.files.length === 0) {
        get().notice('info', '没有需要修改的内容');
        return 'noop';
      }
      // 用户已显式点过「保存」（forceApply）就直接落盘；
      // 否则只有开启「改完即存」且是单文件单点时才自动落盘，其余走确认。
      if (options?.forceApply || (autoApply && plan.files.length === 1 && (plan.impacts?.length ?? 0) <= 1)) {
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
      const message = (err as Error).message;
      get().notice('error', message);
      // 基线漂移（409）说明磁盘被别人改了：必须刷新，让界面回到真实状态；
      // 其余错误（路径越界、区间非法）刷新没有意义，只在日志里留痕。
      if (/已被外部修改|失效|stale/i.test(message)) {
        await get().refreshAnalysis();
        get().reloadPreview();
      }
    }
  },

  discardPlan() {
    set({ plan: null });
  },

  stageOp(op, title, label) {
    const key = opKey(op);
    const staged = get().staged.filter((s) => s.key !== key);
    staged.push({ key, op, title, label });
    set({ staged });
  },

  unstageOp(key) {
    set({ staged: get().staged.filter((s) => s.key !== key) });
  },

  discardStaged() {
    set({ staged: [] });
  },

  async saveAllStaged() {
    const items = get().staged;
    if (items.length === 0) return;
    // 先清空再逐个提交：连点两下「保存」不会把同一批 op 提交两遍。
    // 失败的重新塞回草稿区，让用户看得见还剩什么没落盘。
    set({ staged: [] });
    const failed: StagedOp[] = [];
    for (const item of items) {
      const result = await get().submit(item.op, item.title, { forceApply: true });
      if (result === 'failed' || result === 'blocked') failed.push(item);
    }
    if (failed.length > 0) {
      set({ staged: failed });
      get().notice('warn', `${items.length - failed.length} 项已保存，${failed.length} 项未成功（仍在待保存里）`);
    } else {
      get().notice('success', `已保存 ${items.length} 项改动`);
    }
  },

  confirmUncovered() {
    const pending = get().uncovered;
    if (!pending) return;
    set({ uncovered: null });
    void get().submit(pending.op, pending.title, { acknowledgeUncovered: true });
  },

  dismissUncovered() {
    set({ uncovered: null });
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
    // 即时预览：把草稿变量推给预览 iframe（不落盘）。
    get().postToPreview({ type: 'fa-theme', groups: themeGroupsOf(draft) });
  },

  clearThemeDraft() {
    set({ themeDraft: {} });
    get().postToPreview({ type: 'fa-theme', groups: {} });
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
        occurrence: token.occurrence ?? 0,
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
      const known = res.data.editors.some((e) => e.id === current) || current === '__custom__';
      if (res.data.editors.length > 0 && !known) {
        set({ editorId: res.data.editors[0].id });
      }
    } catch (err) {
      get().notice('warn', `编辑器探测失败：${(err as Error).message}`);
    }
  },

  async loadSettings() {
    try {
      const res = await api.fetchSettings();
      set({ customEditor: res.data.editorCommand ?? '', editorCommandSaved: true });
    } catch {
      /* 设置读不到不影响主流程 */
    }
  },

  setCustomEditor(command) {
    set({ customEditor: command, editorCommandSaved: false });
  },

  async saveEditorCommand(command) {
    try {
      const res = await api.saveSettings({ editorCommand: command });
      set({ customEditor: res.data.editorCommand ?? '', editorCommandSaved: true });
      get().notice('success', res.data.message ?? '已保存');
      await get().loadEditors(true);
    } catch (err) {
      get().notice('error', (err as Error).message);
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
    const { iframe, preview } = get();
    if (!iframe?.contentWindow) return;
    // 定向投递到预览宿主自己的 origin，而不是 '*' 广播。
    // 目标工程代码在这个 iframe 里运行，广播等于把内容交给任意 opener。
    let target = '*';
    if (preview?.baseUrl) {
      try {
        target = new URL(preview.baseUrl).origin;
      } catch {
        // baseUrl 是探测结果，理论上可被 /probe 覆写坏。解析失败时退回广播，
        // 至少不让整条消息通道静默断掉（否则点选联动会"没反应"且无从排查）。
        target = '*';
      }
    }
    iframe.contentWindow.postMessage(message, target);
  },

  focusSource(file, line) {
    set({ sourceFocus: { file, line } });
  },

  clearSourceFocus() {
    set({ sourceFocus: null });
  },

  setCenterMode(mode) {
    set({ centerMode: mode });
  },

  setInspectorTab(tab) {
    set({ inspectorTab: tab });
  },
}));

/**
 * 草稿去重键：同目标同操作只保留最后一次。
 * 同一个字段反复来回改时，草稿区不该堆出一串互相矛盾的条目。
 */
function opKey(op: Op): string {
  if ('target' in op && typeof op.target === 'string' && op.target) return `${op.kind}:${op.target}`;
  if ('member' in op && typeof op.member === 'string' && op.member) return `${op.kind}:${op.member}`;
  return op.kind;
}

/**
 * 把选中节点的 anchor.hash 附到 op 上（服务端据此做漂移校验）。
 *
 * 放在 store 里统一处理，而不是让每个调用点自己填：这样所有编辑入口
 * （属性面板、结构画布、重命名、诊断修复）都天然受保护，也不会有人漏填。
 */
function withDriftGuard(analysis: Analysis | null, op: Op): Op {
  const id =
    'target' in op && typeof op.target === 'string'
      ? op.target
      : 'member' in op && typeof op.member === 'string'
        ? op.member
        : null;
  if (!id) return op;
  const hash = nodeById(analysis, id)?.anchor?.hash;
  return hash ? { ...op, anchorHash: hash } : op;
}

/**
 * 把主题草稿按选择器分组，供预览宿主注入。
 *
 * key 的格式是 `file|selector|token#occurrence`（见 ThemePanel 的 tokenKey）：
 *   - 必须取**第 3 段**当 token：早期取 [1] 拿到的是选择器，拼出 `--:root` 这种
 *     非法自定义属性名，浏览器直接丢弃 —— 功能看着在、颜色完全不变；
 *   - `#occurrence` 只是"同一选择器内第几处重复声明"的标识，下发时要剥掉；
 *   - **必须保留 selector**：`.dark` 下的 token 若被当成 `:root` 下发，预览颜色会错
 *     （两个选择器里同名 token 还会互相覆盖），而落盘走的是精确 selector，
 *     于是"预览看到的"与"保存后的"就不是一回事了。
 */
function themeGroupsOf(draft: Record<string, string>): Record<string, Record<string, string>> {
  const groups: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(draft)) {
    const parts = key.split('|');
    const selector = parts[1];
    const token = parts[2]?.split('#')[0];
    if (!selector || !token) continue;
    groups[selector] ??= {};
    groups[selector][`--${token}`] = value;
  }
  return groups;
}

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
