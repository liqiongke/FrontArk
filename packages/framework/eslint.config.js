import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 与 tsconfig 的 verbatimModuleSyntax 对齐：类型导入必须显式标记 type
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // TODO: 框架 store/请求层大量使用 any，属历史技术债，逐步收窄类型后恢复为 error
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // VProps 为纯类型 namespace，支撑 VProps.Form 限定类型访问，予以豁免
    files: ['src/index.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
])
