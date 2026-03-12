import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv } from 'vite';
import Pages from 'vite-plugin-pages';
import path from 'path';
import { getAliasConfig } from '../../packages/framework/vite.config';

export default defineConfig(({ mode }) => {
  // 根据mode加载对应的环境变量
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      Pages({
        dirs: 'src/pages',
        extensions: ['tsx', 'jsx', 'ts', 'js'],
        importMode: 'async',
      }),
    ],
    server: {
      port: Number(env.VITE_SERVER_PORT) || 3000,
    },
    resolve: {
      alias: {
        // 关键配置：将 @jl/framework 包指向源码目录
        '@jl/framework': path.resolve(__dirname, '../../packages/framework/src'),
        // 使用框架项目定义的别名配置
        ...getAliasConfig(),
      },
    },
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_ENV),
    },
  };
});
