/**
 * 元素探针：把预览里渲染出来的真实 DOM 反向映射到语义节点。
 *
 * 为什么用「启发式文本匹配」而不是给框架打标记：
 * 中台刻意不去改造 @jl/framework（改动会进入业务生产包）。页面里凡是带文字的
 * 交互元素（表头、表单标签、按钮）都是可读的强信号：把它们的文本与语义模型里
 * 的 title/text/label 字面量对齐，就能拿到足够准的映射，且对框架零侵入。
 *
 * 匹配不上的元素只是不参与联动，不影响预览本身的正确性。
 */

type Node = {
  id: string;
  parentId: string | null;
  kind: string;
  name: string;
  label: string;
  editability: string;
  value: unknown;
  /** 所属容器语义（items / searchItems / toolList …），用于按元素类型挑选候选 */
  containerKey?: string | null;
  anchor?: { file: string; line: number; column: number } | null;
};

const TEXT_KEYS = ['title', 'text', 'label', 'name', 'key'];
const TAG_SELECTOR = 'th, label, button, legend, [role="columnheader"]';

/**
 * 容器语义 → 匹配类别。
 * 同一个文本（例如「产品名称」既是搜索项标题又是列标题）会同时出现在多个容器里，
 * 所以索引按类别分开存，打标时再按「点击的是什么元素」挑选合适的类别，
 * 避免点到表头却选中了搜索项。
 */
const CATEGORY_BY_CONTAINER: Record<string, string> = {
  items: 'column',
  searchItems: 'search',
  formItems: 'form',
  summaryItems: 'summary',
  toolList: 'button',
};

/** text → (category → nodeId) */
let textIndex = new Map<string, Map<string, string>>();
let selectedId: string | null = null;
let tagTimer: number | undefined;

function post(payload: Record<string, unknown>) {
  window.parent?.postMessage(payload, '*');
}

function notice(level: 'info' | 'warn' | 'error', message: string) {
  post({ type: 'fa-notice', level, message });
}

function cssEscape(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

/** 按文本给 DOM 打标记。 */
function tagDom() {
  for (const el of Array.from(document.querySelectorAll('[data-fa-node]'))) {
    el.removeAttribute('data-fa-node');
    el.classList.remove('fa-hover', 'fa-selected');
  }
  if (textIndex.size === 0) return;

  for (const el of Array.from(document.querySelectorAll(TAG_SELECTOR))) {
    const text = (el.textContent ?? '').trim();
    if (!text || text.length > 48) continue;
    const nodeId = pickNode(el, text);
    if (nodeId) el.setAttribute('data-fa-node', nodeId);
  }

  if (selectedId) paintSelected(selectedId);
}

/** 按元素类型挑选最合适的候选节点。 */
function pickNode(el: Element, text: string): string | null {
  const candidates = textIndex.get(text);
  if (!candidates) return null;

  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  const isHeader = tag === 'th' || role === 'columnheader';

  const preferred: string[] = [];
  if (isHeader) preferred.push('column');
  if (tag === 'button') preferred.push('button');
  if (tag === 'label' || tag === 'legend') preferred.push('search', 'form');
  preferred.push('column', 'search', 'form', 'summary', 'button', 'other');

  for (const category of preferred) {
    const hit = candidates.get(category);
    if (hit) return hit;
  }
  return null;
}

function scheduleTag() {
  window.clearTimeout(tagTimer);
  tagTimer = window.setTimeout(tagDom, 160);
}

function paintSelected(nodeId: string) {
  for (const el of Array.from(document.querySelectorAll('.fa-selected'))) {
    el.classList.remove('fa-selected');
  }
  const el = document.querySelector(`[data-fa-node="${cssEscape(nodeId)}"]`);
  if (el) {
    el.classList.add('fa-selected');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/** 拉取语义模型并建立「文本 → 节点」索引。 */
async function buildIndex(apiBase: string, projectId: string, route: string) {
  const url = `${apiBase}/api/projects/${encodeURIComponent(projectId)}/pages/analyze?route=${encodeURIComponent(route)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`分析接口返回 ${res.status}`);
  const json = (await res.json()) as { data?: { nodes?: Node[] } };
  const nodes = json.data?.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  textIndex = new Map();
  for (const node of nodes) {
    if (node.editability !== 'literal' || typeof node.value !== 'string') continue;
    if (!TEXT_KEYS.includes(node.name)) continue;
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (!parent) continue;
    const key = String(node.value).trim();
    if (!key) continue;
    const container = parent.containerKey ?? '';
    const category = CATEGORY_BY_CONTAINER[container] ?? 'other';
    const bucket = textIndex.get(key) ?? new Map<string, string>();
    if (!bucket.has(category)) bucket.set(category, parent.id);
    textIndex.set(key, bucket);
  }
  return nodes.length;
}

export function installProbe(opts: { apiBase: string; projectId: string; route: string }) {
  // 1) 索引
  void buildIndex(opts.apiBase, opts.projectId, opts.route)
    .then((count) => {
      notice('info', `探针已就绪，索引 ${textIndex.size} 个可点选元素（共 ${count} 个语义节点）`);
      tagDom();
      // 2) 渲染是异步的，用 MutationObserver 跟着 DOM 变化重新打标
      const observer = new MutationObserver(() => scheduleTag());
      observer.observe(document.body, { childList: true, subtree: true });
      // 保险：框架初次渲染完成后可能超过一个微任务周期
      window.setTimeout(tagDom, 400);
      window.setTimeout(tagDom, 1200);
    })
    .catch((err: Error) => {
      notice('warn', `探针索引建立失败（点选联动不可用）：${err.message}`);
    });

  // 3) 点选
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.('[data-fa-node]');
      if (!el) return;
      const nodeId = el.getAttribute('data-fa-node');
      if (!nodeId) return;
      selectedId = nodeId;
      paintSelected(nodeId);
      post({ type: 'fa-select', nodeId });
    },
    true,
  );

  // 4) 悬停高亮
  document.addEventListener('mouseover', (event) => {
    const el = (event.target as HTMLElement | null)?.closest?.('[data-fa-node]');
    if (el) el.classList.add('fa-hover');
  });

  document.addEventListener('mouseout', (event) => {
    const el = (event.target as HTMLElement | null)?.closest?.('[data-fa-node]');
    if (el) el.classList.remove('fa-hover');
  });

  // 5) 响应 Studio 的指令（主题草稿 / 重新打标 / 选中同步）
  window.addEventListener('message', (event) => {
    // 只接受父窗口：预览里跑的是目标工程的真实代码，
    // 不校验来源等于允许任意嵌套页面遥控这里的 DOM。
    if (event.source !== window.parent) return;
    const msg = event.data as {
      type?: string;
      nodeId?: string;
      groups?: Record<string, Record<string, string>>;
    } | null;
    if (!msg?.type) return;
    if (msg.type === 'fa-select' || msg.type === 'fa-highlight') {
      if (msg.nodeId) {
        selectedId = msg.nodeId;
        paintSelected(msg.nodeId);
      }
      return;
    }
    if (msg.type === 'fa-deselect' || msg.type === 'fa-clear') {
      selectedId = null;
      for (const el of Array.from(document.querySelectorAll('.fa-selected'))) el.classList.remove('fa-selected');
      return;
    }
    if (msg.type === 'fa-theme') applyThemeVars(msg.groups ?? {});
    if (msg.type === 'fa-retag') scheduleTag();
  });

  post({ type: 'fa-mounted', route: opts.route });
}

/**
 * 主题即时预览：把变量写到一张独立 style 上，**不落盘**。
 *
 * 按选择器分组下发（`{ ':root': {...}, '.dark': {...} }`），而不是全部塞进 `:root`：
 * `.dark` 里的 token 如果被当成 `:root` 变量预览，看到的颜色是错的，而保存走的
 * 是精确选择器 —— 预览与落盘结果就会不一致。
 *
 * 变量名必须真的是合法的自定义属性名（`--xxx`）。Studio 早期版本传错过 key
 * （把选择器当成 token），生成 `--:root: ...` 这种声明，浏览器直接丢弃 ——
 * 表现就是"功能看起来在、颜色完全不变"。这里再兜一层。
 */
export function applyThemeVars(groups: Record<string, Record<string, string>>) {
  let style = document.getElementById('fa-theme-preview') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'fa-theme-preview';
    (document.head ?? document.documentElement).appendChild(style);
  }
  const blocks: string[] = [];
  for (const [selector, vars] of Object.entries(groups ?? {})) {
    if (!selector.trim()) continue;
    const decls = Object.entries(vars ?? {})
      .filter(([k, v]) => /^--[A-Za-z0-9_-]+$/.test(k) && String(v).trim() !== '')
      .map(([k, v]) => `  ${k}: ${v};`);
    if (decls.length > 0) blocks.push(`${selector} {\n${decls.join('\n')}\n}`);
  }
  style.textContent = blocks.join('\n');
}
