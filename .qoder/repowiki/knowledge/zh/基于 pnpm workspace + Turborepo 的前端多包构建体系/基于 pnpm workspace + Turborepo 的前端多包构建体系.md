---
kind: build_system
name: 基于 pnpm workspace + Turborepo 的前端多包构建体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - packages/framework/package.json
    - packages/framework/vite.config.ts
    - packages/framework/alias.ts
    - apps/demo/package.json
    - apps/demo/vite.config.ts
    - packages/mock/package.json
    - packages/mock/nodemon.json
---

## 1. 使用的系统/工具

- **包管理**：pnpm（`packageManager: "pnpm@10.13.1"`），通过 `pnpm-workspace.yaml` 声明 `apps/*` 与 `packages/*` 两个工作区目录。
- **任务编排与缓存**：Turborepo（`turbo@^2.6.1`），根 `package.json` 的 `build/dev/lint` 等脚本全部委托给 `turbo run`，由 `turbo.json` 统一调度。
- **应用构建**：Vite 7（`vite@^7.2.x`），React 应用使用 `@vitejs/plugin-react-swc`，组件库使用 `@vitejs/plugin-react` + `vite-plugin-dts` 生成类型声明。
- **Mock 服务**：Express 5 + MockJS，通过 `nodemon` 热重载开发，TypeScript 编译产物位于 `dist/index.js`。
- **代码质量**：ESLint 9（Flat Config `eslint.config.js`）、Prettier、Stylelint（`.stylelintignore`）。

## 2. 关键文件

- 根级：`package.json`、`turbo.json`、`pnpm-workspace.yaml`、`eslint.config.js`、`.prettierrc`
- 框架包 `packages/framework/`：`package.json`、`vite.config.ts`、`alias.ts`、`vitest.config.ts`、`tsconfig.json`
- Demo 应用 `apps/demo/`：`package.json`、`vite.config.ts`、`tsconfig.app.json`、`.env*` 环境变量文件
- Mock 服务 `packages/mock/`：`package.json`、`nodemon.json`、`tsconfig.json`

## 3. 架构与约定

### 3.1 工作区结构
- `apps/*`：面向用户的应用（当前为 `demo`），私有包（`private: true`），不发布。
- `packages/*`：可复用库（`@jl/framework`，`private: false`，发布产物在 `dist/`）与服务（`mock-server`）。
- 根 `package.json` 仅暴露聚合脚本，所有具体命令下沉到各子包。

### 3.2 Turborepo 任务定义（`turbo.json`）
- `build`：依赖上游包的 `build`（`dependsOn: ["^build"]`），输出缓存目录为 `dist/**`、`lib/**`，启用缓存。
- `dev` / `dev:mock`：禁用缓存且标记为 `persistent`，适合长期运行的 dev server。
- `lint`：启用缓存。

### 3.3 组件库构建（`packages/framework`）
- `build` 脚本：`tsc -b && vite build`，先 TypeScript 编译再 Vite 打包。
- Vite 以 `lib` 模式输出单一 ES Module：`framework.es.js`，入口为 `src/index.ts`。
- 通过 `peerDependencies` 声明 React、AntD、ahooks、axios、lodash、simplebar-react 等宿主依赖，并在 Rollup `external` 中显式外部化，避免重复打包进库产物。
- 使用 `vite-plugin-dts` 自动生成 `.d.ts` 类型声明，并通过 `exports` 字段提供 `import` 与 `types` 双入口。
- 别名集中维护在 `alias.ts`，被框架自身和 demo 应用共同引用，保证源码级消费时路径一致。

### 3.4 Demo 应用构建（`apps/demo`）
- `dev`：`vite --mode dev`；`build`：`tsc -b && vite build --mode production`；另有 `build:dev` 用于开发模式构建。
- 通过 `vite.config.ts` 中的 `loadEnv(mode, process.cwd(), '')` 按 mode 加载 `.env.dev` / `.env.production` / `.env.mock` 等环境变量，并注入 `__APP_ENV__`。
- 开发时将 `@jl/framework` 直接 alias 到 `../../packages/framework/src`，实现“源码级”联调，无需先 publish。
- 路由采用 `vite-plugin-pages`，基于 `src/pages` 文件系统自动映射。

### 3.5 Mock 服务（`packages/mock`）
- `build`：`tsc` 编译至 `dist/index.js`。
- `dev` / `dev:mock`：`nodemon --config nodemon.json` 热重载。
- `start`：`node dist/index.js` 启动生产进程。

## 4. 约定与约束

- **统一入口**：根 `package.json` 的 `build/dev/lint` 必须通过 `turbo run` 调用，禁止绕过 Turborepo 直接执行子包脚本（由脚本设计强制）。
- **依赖隔离**：框架包通过 `peerDependencies` + Rollup `external` 将 React/AntD 等宿主依赖排除在库产物之外，确保最终应用只保留一份依赖。
- **缓存策略**：Turborepo 对 `build` 和 `lint` 启用缓存，对 `dev` / `dev:mock` 明确关闭缓存并设为持久任务。
- **环境变量**：Demo 应用通过 Vite 的 `--mode` 机制区分 dev / production / mock 环境，对应 `.env.dev`、`.env.production`、`.env.mock`。
- **版本管理**：框架包 `version: "0.0.0"`，未集成 npm publish 或 CI 发布流程；版本号由人工维护。
- **无 Docker/CI**：仓库未发现 Dockerfile、GitHub Actions 或其他 CI/CD 配置文件，发布与部署不在本仓库内体现。