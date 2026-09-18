---
kind: dependency_management
name: 基于 pnpm workspace + Turborepo 的 Monorepo 依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - pnpm-lock.yaml
    - apps/demo/package.json
    - packages/framework/package.json
    - packages/mock/package.json
---

## 1. 使用的系统与工具

- **包管理器**：pnpm（根 `package.json` 通过 `packageManager: "pnpm@10.13.1"` 锁定版本，确保团队一致）。
- **Monorepo 编排**：`pnpm-workspace.yaml` 声明两个 workspace 目录 `apps/*` 与 `packages/*`，将应用与共享库纳入统一依赖解析。
- **任务编排与缓存**：Turborepo（根 `turbo.json`），为 `build`、`dev`、`dev:mock`、`lint` 等任务配置依赖顺序、输出缓存和持久化运行。
- **构建/开发工具链**：Vite + TypeScript + ESLint，各子模块独立维护自己的 `package.json` 与依赖。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json`（根） | 定义全局脚本 `build/dev/lint` 委托给 `turbo run`，并锁定 pnpm 版本 |
| `pnpm-workspace.yaml` | 声明 workspace 成员 `apps/*`、`packages/*` |
| `turbo.json` | 定义 `build` 依赖 `^build`（上游先 build）、`outputs: dist/**, lib/**` 用于缓存；`dev`/`dev:mock` 关闭缓存并标记 persistent |
| `apps/demo/package.json` | 业务应用 `web` 的运行时依赖（antd、react、axios、ahooks 等）与开发依赖（vite、eslint、typescript） |
| `packages/framework/package.json` | 框架包 `@jl/framework`，声明 `peerDependencies` 让应用自行提供 React/Antd 等宿主依赖，自身仅 `dependencies` 引入 immer、zustand |
| `packages/mock/package.json` | Mock 服务端 `mock-server`，依赖 express、mockjs |
| `pnpm-lock.yaml` | 全仓库锁定的依赖树（未展开） |

## 3. 架构与约定

### 3.1 Workspace 内包引用
- 应用通过 `workspace:*` 引用内部框架包：`apps/demo/package.json` 中 `"@jl/framework": "workspace:*"`，由 pnpm workspace 在本地解析，无需发布到 npm registry。
- 框架包以 npm package 形式发布产物（`files: ["dist"]`，`main/module/types` 指向 `dist/`），但当前仓库内仍走 workspace 链接。

### 3.2 Peer Dependencies 策略
- `packages/framework` 将 `react`、`react-dom`、`antd`、`axios`、`ahooks`、`lodash`、`simplebar-react`、`@ant-design/icons` 全部放入 `peerDependencies`，强制使用方（如 `apps/demo`）自行安装并提供这些依赖，避免重复打包。
- 应用 `apps/demo` 的 `dependencies` 中显式声明了上述 peer 依赖，保持版本对齐。

### 3.3 依赖版本管理
- 所有第三方依赖以 `^` 或 `~` 语义化版本声明在各子 `package.json` 中，具体锁定版本由 `pnpm-lock.yaml` 决定。
- 根层不集中声明业务依赖，而是由各 workspace 包各自维护，符合 pnpm workspace 的“每个包独立依赖”模式。

### 3.4 构建与缓存
- Turborepo 的 `build` 任务通过 `dependsOn: ["^build"]` 保证 framework 先于 demo 构建，且 `outputs: ["dist/**", "lib/**"]` 启用增量缓存。
- `dev`/`dev:mock` 关闭缓存并设为 `persistent: true`，适合长期运行的 dev server。

## 4. 约定与约束

- **包管理器锁定**：根 `package.json` 的 `packageManager` 字段要求使用 pnpm 10.13.1，CI 或本地需匹配该版本。
- **Workspace 范围**：只有 `apps/*` 与 `packages/*` 下的包会被 pnpm workspace 识别，新增子模块需遵循此目录约定。
- **内部包发布契约**：`packages/framework` 通过 `exports`、`types`、`sideEffects` 暴露 ESM 入口与类型声明，发布产物仅限 `dist` 目录。
- **宿主依赖解耦**：框架包通过 `peerDependencies` 声明宿主依赖，使用者必须显式安装对应版本的运行时依赖，避免多份 React/Antd 实例。
- **Mock 服务独立**：`packages/mock` 作为独立 Node 服务，通过 `nodemon` 启动，与前端应用解耦。
- **无私有 registry / vendor**：仓库未发现 `.npmrc`、`.yarnrc`、`vendor/` 等私有源或 vendoring 配置，依赖均从默认 npm 源解析并通过 `pnpm-lock.yaml` 锁定。
