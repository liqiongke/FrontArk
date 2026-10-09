/**
 * FrontArk Studio 预览宿主。
 *
 * 全部逻辑就三件事：
 *   1. 把目标工程的页面（index.tsx 的默认导出）动态 import 进来，用真实的 ViewRoot 渲染；
 *   2. 按 Studio 给的数据源配置初始化 NetUtils；
 *   3. 装载元素探针，把点选回传给 Studio。
 *
 * 渲染的是**页面组件本身**（而不是自己拼 ViewRoot），
 * 所以预览形态与真实应用完全一致，也不需要知道 Data/View/Handler 的类名。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NetUtils } from '@jl/framework';
import { installProbe } from './probe';
import './index.css';

declare global {
  // eslint-disable-next-line no-var
  var __STUDIO_ENV__: Record<string, string> | undefined;
}

const params = new URLSearchParams(window.location.search);
const pagePath = params.get('page');
const apiBase = params.get('api') ?? '';
const mockBase = params.get('base') ?? '';
const projectId = params.get('project') ?? '';
const route = params.get('route') ?? '/';
// Studio 自己的 origin：postMessage 定向投递，而不是 '*' 广播。
// 预览里跑的是目标工程的真实代码，把环境变量广播给任意 opener 不合适。
const studioOrigin = params.get('studio') || '*';

function post(payload: Record<string, unknown>) {
  window.parent?.postMessage(payload, studioOrigin);
}

/**
 * 向 Studio 要目标工程的 import.meta.env.*。
 *
 * 为什么不走 URL query：环境变量值会留在浏览器历史 / 地址栏 / 访问日志里。
 * 这里改成挂起等一条 `fa-env` 消息，拿到之后才开始 import 页面模块 ——
 * 因为页面模块在**导入期**就会读 `window.__STUDIO_ENV__`。
 */
function requestEnv(timeoutMs = 600): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (env: Record<string, string>) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve(env);
    };
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; env?: Record<string, string> } | null;
      if (data?.type !== 'fa-env') return;
      finish(data.env ?? {});
    };
    window.addEventListener('message', onMsg);
    post({ type: 'fa-want-env' });
    window.setTimeout(() => finish({}), timeoutMs);
  });
}

function renderFatal(title: string, detail: string) {
  const el = document.getElementById('root');
  if (!el) return;
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'p-6 font-mono text-xs leading-relaxed';
  const h = document.createElement('div');
  h.className = 'mb-2 text-sm font-semibold text-destructive';
  h.textContent = title;
  const pre = document.createElement('pre');
  pre.className = 'whitespace-pre-wrap rounded border border-border bg-surface p-3 text-muted-foreground';
  pre.textContent = detail;
  box.appendChild(h);
  box.appendChild(pre);
  el.appendChild(box);
  post({ type: 'fa-error', title, detail });
}

/**
 * 预览里不参与真实鉴权：塞一个占位 token，
 * 免得框架的请求拦截器把每个请求都拦成 401。
 */
localStorage.setItem('@authtoken', 'studio-preview');
localStorage.removeItem('@authtoken_expire');

// baseURL 缺省刻意不留 '/api' 兜底：目标工程没配 VITE_BASE_URL 时，
// 请求会打到预览宿主自己的 7099 端口（那里没有 /api 代理，只会得到 404 HTML），
// 反而掩盖了「数据源没配」这个真正的问题。
NetUtils.init(
  mockBase,
  '/login',
  '/login',
  (code, msg, type) => {
    post({ type: 'fa-notice', level: 'warn', message: `${type} 请求失败 [${code}]：${msg}` });
  },
);

async function bootstrap() {
  if (!pagePath) {
    renderFatal('缺少参数', '预览地址必须带 page 参数（目标页面 index.tsx 的绝对路径）。');
    return;
  }

  // 先取环境变量（页面模块在导入期就会读 window.__STUDIO_ENV__）
  window.__STUDIO_ENV__ = await requestEnv();

  const url = `/@fs/${pagePath.replace(/\\/g, '/')}`;
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  } catch (err) {
    const e = err as Error;
    renderFatal('页面模块加载失败', `${url}\n\n${e?.message ?? String(err)}\n\n${e?.stack ?? ''}`);
    return;
  }

  const Page = (mod.default ?? mod.Page) as React.ComponentType | undefined;
  if (typeof Page !== 'function') {
    renderFatal(
      '页面入口没有默认导出组件',
      `模块已加载，但没找到可渲染的组件导出。\n导出的键：${Object.keys(mod).join(', ') || '(空)'}`,
    );
    return;
  }

  const el = document.getElementById('root');
  if (!el) return;
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );

  installProbe({ apiBase, projectId, route });
}

void bootstrap();
