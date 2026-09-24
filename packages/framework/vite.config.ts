import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'path';
import { getFrameworkAliases } from './alias';

export default defineConfig({
  plugins: [
    react(),
    // 自动生成类型声明文件
    dts({
      insertTypesEntry: true,
      // 测试文件不生成类型声明(避免 vitest 类型进入产物)
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    }),
  ],
  resolve: {
    alias: getFrameworkAliases(),
  },
  build: {
    lib: {
      // 主入口 + UI 子入口：UI 基础组件通过 @jl/framework/ui 单独交付
      // 对象形式显式命名，避免两个 index.ts 因同名 chunk 冲突
      entry: {
        framework: path.resolve(__dirname, 'src/index.ts'),
        ui: path.resolve(__dirname, 'src/ui/index.ts'),
      },
      // 仅输出 ES 模块，供现代打包工具消费
      formats: ['es'],
      // 输出文件名格式；主入口固定为 framework.es，其余按入口名输出(如 ui.es)
      fileName: (_format, entryName) =>
        entryName === 'framework' ? 'framework.es.js' : `${entryName}.es.js`,
    },
    rollupOptions: {
      output: {
        // 多入口时 rollup 以 entryFileNames 输出共享 chunk；将主入口文件名固定为 framework.es.js
        entryFileNames: (chunk) =>
          chunk.name === 'framework' ? 'framework.es.js' : `${chunk.name}.es.js`,
      },
      // 外部化所有 peer 依赖，避免将宿主应用已有的依赖重复打包
      // 正则覆盖子路径引用(如 react/jsx-runtime 的内部引用)
      external: [
        /^react($|\/)/,
        /^react-dom($|\/)/,
        // Tauri SDK 是框架运行依赖，保持子路径按需加载，不打进框架入口。
        /^@tauri-apps\/api($|\/)/,
        // UI 运行依赖(radix/lucide/sonner/tanstack 等)统一 external，由包管理器随 dependencies 安装
        /^@radix-ui\//,
        /^@tanstack\//,
        /^lucide-react($|\/)/,
        /^sonner($|\/)/,
        /^react-day-picker($|\/)/,
        /^date-fns($|\/)/,
        /^dayjs($|\/)/,
        /^react-hook-form($|\/)/,
        /^@hookform\/resolvers($|\/)/,
        /^zod($|\/)/,
        /^class-variance-authority($|\/)/,
        /^clsx($|\/)/,
        /^tailwind-merge($|\/)/,
        'ahooks',
        'axios',
        'lodash',
        'simplebar-react',
      ],
    },
  },
});
