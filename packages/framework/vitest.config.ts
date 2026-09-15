import { defineConfig } from 'vitest/config';
import { getFrameworkAliases } from './alias';

// 单测配置:复用框架别名配置,纯 Node 环境运行 store 层工具测试
export default defineConfig({
  resolve: {
    alias: getFrameworkAliases(),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
