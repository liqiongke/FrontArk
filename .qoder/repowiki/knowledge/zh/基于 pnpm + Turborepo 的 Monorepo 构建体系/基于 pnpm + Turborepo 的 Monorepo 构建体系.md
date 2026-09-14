---
kind: build_system
name: 基于 pnpm + Turborepo 的 Monorepo 构建体系
category: build_system
scope:
    - '**'
source_files:
    - turbo.json
    - pnpm-workspace.yaml
    - package.json
    - apps/demo/package.json
    - apps/demo/vite.config.ts
    - packages/framework/package.json
    - packages/framework/vite.config.ts
    - docs/1.运行与构建.md
---

## 1. 构建系统概览

本项目采用 **pnpm workspace + Turborepo** 的 monorepo 构建方案，统一编排 `apps/*`（应用）与 `packages/*`（共享库）的依赖安装、开发、构建与代码检查。根级 `package.json` 通过 `turbo run` 暴露 `build`、`dev`、`dev:mock`、`lint` 四个顶层脚本，所有子项目复用同一套命令入口。

- 包管理器：`pnpm@10.13.1`（由根 `package.json` 的 `packageManager` 字段锁定）
- 任务编排：`turbo@^2.6.1`，通过 `turbo.json` 定义任务缓存、依赖顺序与持久化进程
- 工作区声明：`pnpm-workspace.yaml` 将 `apps/*` 和 `packages/*` 纳入同一 workspace

## 2. 关键文件与职责

| 文件 | 作用 |
|---|---|
| `turbo.json` | 定义 `build`/`dev`/`dev:mock`/`lint` 任务的执行策略、输出目录与缓存策略 |
| `pnpm-workspace.yaml` | 声明 workspace 包含 `apps/*` 与 `packages/*` |
| `apps/demo/package.json` | 前端应用脚本：`dev`、`dev:prod`、`dev:mock`、`build`、`build:dev`、`lint`、`preview` |
| `apps/demo/vite.config.ts` | Vite 构建配置，按 `mode` 加载 `.env.*` 环境变量，注入页面路由插件与别名 |
| `packages/framework/package.json` | 框架库元信息，声明 `main`/`module`/`types`/`exports` 多入口及 `peerDependencies` |
| `packages/framework/vite.config.ts` | 以 `vite build --lib` 模式输出 UMD 与 ES 模块，并通过 `vite-plugin-dts` 生成类型声明；导出 `getAliasConfig()` 供 apps 复用 |
| `docs/1.运行与构建.md` | 官方文档，约定 Node ≥ 24.11.1、pnpm 安装流程与环境变量说明 |

## 3. 架构与约定

### 3.1 任务图与缓存
- `turbo.json` 中 `build` 任务声明 `dependsOn: ["^build"]`，即先按拓扑序构建被依赖的 packages（如 `@jl/framework`），再构建 app。
- `build` 的输出目录为 `dist/**` 与 `lib/**`，并启用 Turbo 缓存；`dev`/`dev:mock` 标记为 `persistent: true` 且关闭缓存，保证热更新。
- `lint` 任务也开启缓存。

### 3.2 应用构建（Vite）
- 每个 app 使用 Vite 7.x，通过 `--mode dev|production|mock` 切换不同 `.env.*` 文件（`.env`、`.env.dev`、`.env.mock`、`.env.production`）。
- `vite.config.ts` 通过 `loadEnv(mode, process.cwd(), '')` 读取环境变量，并将 `VITE_SERVER_PORT`、`VITE_ENV` 等注入到运行时。
- 页面路由使用 `vite-plugin-pages`，约定 `src/pages` 下文件自动映射路由。
- 通过 `tsc -b` 先行类型检查，再执行 `vite build`，确保类型安全后再打包。

### 3.3 框架库构建（Vite Library 模式）
- `packages/framework` 以 library 模式构建，入口 `src/index.ts`，输出 `framework.es.js`（ESM）与 `framework.umd.js`（UMD），并通过 `vite-plugin-dts` 生成 `dist/index.d.ts`。
- `react`、`react-dom`、`antd` 在 Rollup 中声明为 `external`，避免重复打包，由宿主应用提供。
- 通过 `peerDependencies` 声明框架对 React/Antd 等运行时依赖的版本范围，要求宿主应用自行安装匹配版本。
- 框架内部使用自研路径别名（`@`、`@view`、`@ctrl`、`@store`、`@data`、`@handler`、`@utils`），并以 `getAliasConfig()` 函数形式导出，供 apps 在 `vite.config.ts` 中合并复用，保持跨项目一致。

### 3.4 环境变量规范
- 所有面向前端的变量必须以 `VITE_` 前缀命名（遵循 Vite 约定），由 `loadEnv` 暴露到客户端。
- 核心变量包括 `VITE_ENV`、`VITE_SERVER_PORT`、`VITE_BASE_URL`、`VITE_TITLE`、`VITE_LOGIN_URL`、`VITE_AUTH_TOKEN_EXPIRE_TIME`、`VITE_API_*` 等，详见 `docs/1.运行与构建.md`。
- 不同环境通过 `.env`、`.env.dev`、`.env.mock`、`.env.production` 覆盖基础配置。

## 4. 约定与约束

- **Node 版本**：文档明确要求推荐 Node ≥ 24.11.1，建议使用 nvm 管理。
- **依赖安装**：必须在根目录执行 `pnpm install`，利用 workspace 能力一次性安装所有子项目依赖。
- **开发启动**：推荐使用 `pnpm dev`（或 `pnpm dev:mock`）从根目录启动，由 Turborepo 并行调度各子项目的 dev 任务。
- **构建产物**：app 构建产物输出至 `dist/`，框架库产物输出至 `packages/framework/dist/`，Turbo 仅缓存这些目录。
- **类型检查**：app 与 framework 均通过 `tsc -b`（TypeScript project references）进行增量类型检查，再进入 Vite 构建阶段。
- **Lint**：根与子项目各自维护 `eslint.config.js`，通过 `pnpm lint`（Turborepo 聚合）统一执行。
- **无 CI/Dockerfile**：仓库内未发现 GitHub Actions、Jenkinsfile、Dockerfile 等持续集成或容器化配置，发布流程目前停留在本地 `pnpm build` 阶段。
- **版本号策略**：根 package 版本为 `1.0.0`，app 与 framework 均为 `0.0.0`（占位），未见自动化版本管理工具（如 changesets、standard-version）。

## 5. 总结

该仓库的构建体系围绕 **pnpm workspace 管理依赖 + Turborepo 编排任务 + Vite 作为单仓内统一的构建引擎** 展开。apps 负责业务应用构建，packages 中的 `@jl/framework` 作为可复用的 UI/状态框架以 library 模式输出 ESM/UMD 与类型声明，并通过 `peerDependencies` 解耦运行时依赖。环境变量通过 `.env.*` + Vite `loadEnv` 实现多环境切换，构建产物与缓存由 Turborepo 统一管理。当前仓库未包含 CI/CD 流水线与 Docker 化部署脚本。