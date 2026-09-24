import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { getFrameworkAliases } from '../../packages/framework/alias';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@jl/framework': fileURLToPath(new URL('../../packages/framework/src', import.meta.url)),
      ...getFrameworkAliases(),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/layouts/**/*.test.tsx'],
    restoreMocks: true,
  },
});
