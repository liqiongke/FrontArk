---
kind: dependency_management
name: 基于 pnpm workspace + Turborepo 的前端 Monorepo 依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - turbo.json
    - apps/demo/package.json
    - packages/framework/package.json
    - packages/mock/package.json
---

## 1. 使用的系统与工具

- **包管理器**：pnpm（根 `package.json` 通过 `packageManager: "pnpm@10.13.1"` 锁定版本，确保团队一致）。
- **Workspace 管理**：通过根级 `pnpm-workspace.yaml` 声明两个目录作为工作区：`apps/*`（应用）和 `packages/*`（共享库/组件库），实现跨包依赖解析与安装。
- **任务编排与缓存**：Turborepo（根 `devDependencies` 中引入 `turbo ^2.6.1`，并通过 `turbo.json` 定义 `build`、`dev`、`dev:mock`、`lint` 等任务及其缓存策略）。
- **无私有 npm registry / `.npmrc`**：仓库中未发现 `.npmrc`、`.npmrc.local`、`pnpm-lock.yaml` 之外的 registry 配置，所有第三方依赖均从默认 npm 源获取。
- **无 vendoring**：未使用 `vendor/` 或类似目录托管源码；依赖统一由 pnpm 安装到各包的 `node_modules`。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json`（根） | 声明 workspace 入口脚本（`build`、`dev`、`dev:mock`、`lint` 均通过 `turbo run ...` 分发）、锁定 pnpm 版本、引入 Turborepo |
| `pnpm-workspace.yaml` | 声明 `apps/*` 与 `packages/*` 为 workspace 成员 |
| `pnpm-lock.yaml` | 全仓锁文件，保证依赖树可重现 |
| `turbo.json` | 定义任务依赖图（如 `build` 依赖 `^build` 上游产物）、输出目录（`dist/**`、`lib/**`）与缓存开关 |
| `apps/demo/package.json` | Demo 应用依赖声明，包含业务依赖（antd、ahooks、axios、lodash、react/react-dom、react-router-dom、simplebar-react）及开发依赖（vite、typescript、eslint、less 等） |
| `packages/framework/package.json` | 内部组件库 `@jl/framework` 的发布元数据：`exports`、`main`、`module`、`types`、`sideEffects`、`peerDependencies`（将 react、antd、axios、lodash 等声明为 peer，避免重复打包） |
| `packages/mock/package.json` | Mock 服务依赖（express、mockjs、nodemon、ts-node 等） |

## 3. 架构与约定

### 3.1 工作区划分
- `apps/*`：面向最终用户的应用（当前仅 `apps/demo`），通过 `private: true` 标记不发布。
- `packages/*`：可复用库（`@jl/framework` 组件库、`mock-server` mock 服务），其中 `@jl/framework` 的 `private: false`，具备发布能力。

### 3.2 内部包引用方式
- Demo 应用通过 workspace protocol 引用内部框架：`"@jl/framework": "workspace:*"`。pnpm 会将其解析到本地 `packages/framework`，无需发布即可在 dev/build 中使用。
- 这种模式避免了 monorepo 内包之间需要走 npm registry 的耦合，同时保持语义化包名。

### 3.3 依赖版本策略
- 外部依赖普遍采用 `^` 前缀的 semver 范围（如 `antd ^6.0.0`、`react ^19.2.0`、`vite ^7.2.2`），允许小版本自动升级，具体锁定由 `pnpm-lock.yaml` 决定。
- TypeScript 在 demo 与 framework 中分别使用 `~5.9.3` 与 `~5.9.3`，以波浪号锁定精确主/次版本。
- 框架包将运行时依赖（react、antd、axios、lodash、ahooks、simplebar-react、@ant-design/icons）声明为 `peerDependencies`，要求使用者自行提供，从而避免重复打包。

### 3.4 构建与缓存约定
- Turborepo 的 `build` 任务依赖 `^build`，即先构建被依赖的上游包（framework → demo），再构建下游。
- 构建产物目录约定为 `dist/**`、`lib/**`，并开启缓存（`cache: true`）；`dev` 与 `dev:mock` 关闭缓存并设为 `persistent` 以保持进程常驻。

## 4. 约定与约束

- **必须使用 pnpm**：根 `package.json` 的 `packageManager` 字段锁定 pnpm 版本，CI/本地均应使用相同版本。
- **新增包需加入 workspace**：新应用或库应放在 `apps/*` 或 `packages/*` 下，以便被 pnpm workspace 发现。
- **内部包通过 `workspace:*` 引用**：monorepo 内包之间的依赖应使用 `workspace:*` protocol，而非版本号，以保证本地开发与构建一致性。
- **框架包通过 `peerDependencies` 声明运行时依赖**：`@jl/framework` 将 React、Ant Design、Axios 等声明为 peer，使用者需自行安装对应版本，避免多份副本。
- **构建产物路径受 Turborepo 约束**：`build` 任务的 `outputs` 指定 `dist/**`、`lib/**`，若改变产物目录需同步更新 `turbo.json`。
- **未使用私有 registry 或镜像**：仓库未配置 `.npmrc`，所有依赖来自默认 npm 源；如需接入企业私有源，需在根目录添加 `.npmrc` 并在 CI 中注入认证信息。
- **无 lockfile 外部的版本校验**：未见 `pnpm audit`、`npm-check-updates` 等自动化升级脚本，依赖升级主要依赖人工维护 `package.json` 与 `pnpm-lock.yaml`。