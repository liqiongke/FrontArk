import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import Pages from 'vite-plugin-pages';
import { existsSync } from 'node:fs';
import path from 'path';
import { getFrameworkAliases } from '../../packages/framework/alias';

/**
 * 解析用于自动打开页面的浏览器（Vite 通过 process.env.BROWSER 读取）。
 * - 已设置 BROWSER 时直接使用，因此可用 `BROWSER=none` 关闭自动打开
 * - Windows 下 Chrome 默认不在 PATH 中，优先取安装目录的绝对路径，取不到再回退为名称
 */
function resolveBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;

  if (process.platform === 'darwin') return 'google chrome';
  if (process.platform === 'win32') {
    const chromePath = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ]
      .filter(Boolean)
      .map((dir) => path.join(dir!, 'Google/Chrome/Application/chrome.exe'))
      .find((exe) => existsSync(exe));
    return chromePath ?? 'chrome';
  }
  return 'google-chrome';
}

export default defineConfig(({ mode }) => {
  // 根据mode加载对应的环境变量
  const env = loadEnv(mode, process.cwd(), '');
  const isDesktop = env.VITE_APP_TARGET === 'desktop';

  // 开发服务器启动完成后自动用 Chrome 打开页面（桌面端由 Tauri 承载，不打开浏览器）
  if (!isDesktop) process.env.BROWSER ||= resolveBrowser();

  return {
    base: isDesktop ? './' : '/',
    clearScreen: !isDesktop,
    build: {
      outDir: isDesktop ? 'dist-desktop' : 'dist',
    },
    plugins: [
      react(),
      tailwindcss(),
      Pages({
        dirs: 'src/pages',
        extensions: ['tsx', 'jsx', 'ts', 'js'],
        importMode: 'async',
        // data/view/handler 是页面的 schema 声明文件而非路由页面,不生成路由
        exclude: ['**/data.*', '**/view.*', '**/handler.*'],
      }),
    ],
    server: {
      host: isDesktop ? '127.0.0.1' : undefined,
      port: isDesktop ? 7000 : Number(env.VITE_SERVER_PORT) || 3000,
      strictPort: isDesktop,
      open: !isDesktop,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    resolve: {
      alias: {
        // 将 @jl/framework 包指向源码目录，开发与构建均直接消费框架源码
        '@jl/framework': path.resolve(__dirname, '../../packages/framework/src'),
        // 复用框架定义的别名配置，保证框架内部别名可解析
        ...getFrameworkAliases(),
      },
    },
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_ENV),
    },
  };
});
