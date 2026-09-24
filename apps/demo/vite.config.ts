import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import Pages from 'vite-plugin-pages';
import path from 'path';
import { getFrameworkAliases } from '../../packages/framework/alias';

export default defineConfig(({ mode }) => {
  // 根据mode加载对应的环境变量
  const env = loadEnv(mode, process.cwd(), '');
  const isDesktop = env.VITE_APP_TARGET === 'desktop';

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
