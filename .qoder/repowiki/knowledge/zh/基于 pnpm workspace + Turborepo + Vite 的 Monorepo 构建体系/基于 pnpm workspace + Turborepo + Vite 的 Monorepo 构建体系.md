---
kind: build_system
name: 基于 pnpm workspace + Turborepo + Vite 的 Monorepo 构建体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - apps/demo/package.json
    - packages/framework/package.json
    - docs/1.运行与构建.md
---

## 1. 使用的系统与工具

- **包管理器**：pnpm（通过 `packageManager: "pnpm@10.13.1"` 锁定版本），使用 `pnpm-workspace.yaml` 声明 `apps/*` 与 `packages/*` 两个工作区。
- **任务编排**：Turborepo 2.x（根 `turbo.json`），在根 `package.json` 中统一暴露 `build`、`dev`、`dev:mock`、`lint` 四个脚本，实际由 `turbo run <task>` 分发到各子包。
- **应用构建**：`apps/demo` 使用 Vite 7 + TypeScript（`tsc -b` 先类型检查再 `vite build --mode production`），支持 `dev` / `dev:prod` / `dev:mock` / `build:dev` 多模式。
- **框架库构建**：`packages/framework`（发布名 `@jl/framework`）同样以 Vite 打包，并通过 `vite-plugin-dts` 生成 `.d.ts`；依赖通过 `peerDependencies` 声明（React/AntD/ahooks/lodash 等），由使用者安装。
- **测试**：框架库使用 Vitest（`vitest run` / `vitest` watch 模式）。
- **代码质量**：ESLint 9（flat config `eslint.config.js`）+ Prettier + Stylelint，均通过 Turborepo 的 `lint` task 统一执行。

## 2. 关键文件

- `package.json`：根入口脚本，锁定 pnpm 版本并代理到 Turborepo。
- `turbo.json`：定义 `build`/`dev`/`dev:mock`/`lint` 的任务缓存策略与依赖关系（`build` 依赖 `^build`，即先构建被依赖包）。
- `pnpm-workspace.yaml`：声明 monorepo 工作区目录。
- `apps/demo/package.json`：演示应用的构建脚本、Vite 模式及依赖。
- `packages/framework/package.json`：框架包的产物约定（`main`/`module`/`types`/`exports`）、发布范围（`files: ["dist"]`）与 peerDependencies。
- `docs/1.运行与构建.md`：官方文档化的运行/构建步骤与环境变量说明。

## 3. 架构与约定

- **分层结构**：`apps/*` 为前端应用（当前仅 `demo`），`packages/*` 为可复用库（当前仅 `@jl/framework`），两者通过 `workspace:*` 协议引用。
- **构建产物约定**：Turborepo 将 `dist/**` 和 `lib/**` 视为缓存输出；`@jl/framework` 把 `dist` 作为发布唯一内容，并通过 `exports` 字段提供 ESM 入口与类型路径。
- **任务缓存**：`build` 与 `lint` 开启缓存，`dev`/`dev:mock` 设为 `persistent: true` 且关闭缓存，保证开发体验。
- **环境变量**：应用层通过 Vite 的 `.env` / `.env.dev` / `.env.mock` / `.env.production` 多环境文件管理，变量需以 `VITE_` 前缀暴露给客户端代码（见文档表格）。
- **依赖管理策略**：框架库以 `peerDependencies` 声明 React/AntD 等运行时依赖，避免重复打包；业务应用自行安装这些依赖。

## 4. 约定与约束

- 所有跨包命令必须通过根 `pnpm build` / `pnpm dev` / `pnpm lint` 触发，由 Turborepo 统一调度，禁止在各子包直接调用底层工具绕过缓存。
- 新增子包需在 `pnpm-workspace.yaml` 中匹配 `apps/*` 或 `packages/*` 才能被识别。
- 框架包对外只发布 `dist` 目录，且必须提供 `main`/`module`/`types`/`exports` 四者一致的 ESM 入口，否则消费者无法正确解析类型与模块。
- 构建顺序受 Turborepo 的 `dependsOn: ["^build"]` 约束：当应用依赖某个 package 时，会先执行该 package 的 `build`，再构建自身。
- 开发服务器通过 Vite `--mode` 切换环境（`dev` / `production` / `mock`），对应不同的 `.env.*` 配置覆盖规则，不得硬编码环境变量。
- Node 版本推荐 24.11.1（见文档），配合 pnpm 10.13.1 使用。

目前仓库未包含 Dockerfile、CI 流水线或 Makefile 等外部部署脚本；构建与发布流程集中在 pnpm + Turborepo + Vite 这一套本地可复现的工具链中。