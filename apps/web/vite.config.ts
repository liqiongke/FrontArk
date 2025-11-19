import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv } from 'vite';
import Pages from 'vite-plugin-pages';

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
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_ENV),
    },
  };
});
