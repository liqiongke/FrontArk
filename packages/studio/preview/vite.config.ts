import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { getFrameworkAliases } from '../../framework/alias';

/**
 * 把目标工程源码里的 `import.meta.env.XXX` 改写成 `globalThis.__STUDIO_ENV__?.XXX`。
 *
 * 原因：预览宿主跑在 Studio 自己的 Vite 里，目标工程的 .env 不会被加载，
 * `import.meta.env.VITE_BASE_URL` 会变成 undefined。改写后由宿主在运行时
 * 从 URL 参数注入真实值（这些值由 Studio 探测目标工程得到）。
 */
function studioEnv(targetMarkers: string[]) {
  const escaped = targetMarkers
    .filter(Boolean)
    .map((m) => m.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    name: 'studio-env',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.replace(/\\/g, '/').split('?')[0];
      if (file.includes('/packages/studio/')) return null;
      if (escaped.length > 0 && !escaped.some((m) => file.startsWith(m))) return null;
      if (!code.includes('import.meta.env')) return null;
      const next = code.replace(/import\.meta\.env\./g, 'globalThis.__STUDIO_ENV__?.');
      return next === code ? null : { code: next, map: null };
    },
  };
}

// packages/studio/preview → packages/studio → packages → <repoRoot>
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const frameworkSrc = path.resolve(repoRoot, 'packages', 'framework', 'src');

/**
 * 预览宿主是一个**极小的** Vite 工程：
 * 它本身只有 20 行代码，真正的页面由 /@fs/ 动态导入目标工程的 index.tsx 得到。
 *
 * 别名与 apps/demo/vite.config.ts 保持同一口径（本仓库内的工程都消费框架源码），
 * 因此这里可以写成静态配置，不需要按项目动态生成。
 */
export default defineConfig({
  root: __dirname,
  // 目标工程在 apps/ 下（本仓库内的应用都是 workspace 成员）
  plugins: [react(), tailwindcss(), studioEnv([path.join(repoRoot, 'apps')])],
  server: {
    host: '127.0.0.1',
    port: 7099,
    strictPort: true,
    cors: true,
    // 允许 /@fs/ 读取仓库内任意工程（目标页面就在 apps/* 下）
    fs: { allow: [repoRoot] },
  },
  resolve: {
    alias: {
      '@jl/framework': frameworkSrc,
      ...getFrameworkAliases(),
    },
    // 目标工程里也装了一份 react，必须去重，否则 hooks 会报 "multiple React copies"
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
  },
});
