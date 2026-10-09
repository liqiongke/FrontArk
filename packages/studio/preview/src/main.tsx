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
const envRaw = params.get('env');

// 目标工程的 import.meta.env.* 由 vite 插件改写到这里（见 vite.config.ts 的 studioEnv）
try {
  window.__STUDIO_ENV__ = envRaw ? JSON.parse(envRaw) : {};
} catch {
  window.__STUDIO_ENV__ = {};
}

function post(payload: Record<string, unknown>) {
  window.parent?.postMessage(payload, '*');
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

NetUtils.init(
  mockBase || '/api',
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
