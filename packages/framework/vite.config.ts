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
    }),
  ],
  resolve: {
    alias: getFrameworkAliases(),
  },
  build: {
    lib: {
      // 库的入口文件
      entry: path.resolve(__dirname, 'src/index.ts'),
      // 库的名称
      name: '@jl/framework',
      // 仅输出 ES 模块，供现代打包工具消费
      formats: ['es'],
      // 输出文件名格式
      fileName: () => 'framework.es.js',
    },
    rollupOptions: {
      // 外部化所有 peer 依赖，避免将宿主应用已有的依赖重复打包
      external: [
        'react',
        'react-dom',
        'antd',
        '@ant-design/icons',
        'ahooks',
        'axios',
        'lodash',
        'simplebar-react',
      ],
    },
  },
});
