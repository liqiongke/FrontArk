---
kind: dependency_management
name: 基于 pnpm workspace + Turborepo 的多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - packages/framework/package.json
    - apps/demo/package.json
    - packages/mock/package.json
    - pnpm-lock.yaml
---

## 1. 使用的系统/工具

- **包管理器**：pnpm（根 `package.json` 通过 `packageManager: "pnpm@10.13.1"` 锁定版本），使用 `pnpm-lock.yaml` 作为锁文件。
- **工作区**：`pnpm-workspace.yaml` 声明两个目录为 workspace：`apps/*`（应用）和 `packages/*`（共享库）。
- **任务编排与缓存**：Turborepo（根 `devDependencies.turbo ^2.6.1`，`turbo.json` 定义 `build`、`dev`、`dev:mock`、`lint` 任务及缓存策略）。
- **私有包发布**：`packages/framework` 的 `name` 为 `@jl/framework`、`private: false`，表明该包计划发布到 npm registry（或私有 registry），但当前仓库未配置 `.npmrc` 等私有源。

## 2. 关键文件

- `package.json`（根）：声明 workspace 脚本 `build/dev/dev:mock/lint` 统一通过 `turbo run` 调用各子包脚本；锁定 pnpm 版本。
- `pnpm-workspace.yaml`：定义 workspace 成员 `apps/*`、`packages/*`。
- `turbo.json`：定义任务依赖（如 `build` 依赖 `^build` 即先构建上游依赖）、输出目录 `dist/**, lib/**`、缓存开关。
- `packages/framework/package.json`：组件库包，使用 `peerDependencies` 声明 React、antd、axios、ahooks、lodash、simplebar-react、@ant-design/icons 等运行时依赖由使用者提供，自身仅内嵌 `immer`、`zustand` 作为 `dependencies`。
- `apps/demo/package.json`：演示应用，通过 `workspace:*` 引用内部包 `@jl/framework`，并直接声明 antd、react、axios 等依赖。
- `packages/mock/package.json`：Express Mock 服务，独立依赖 express、mockjs。
- `pnpm-lock.yaml`：全局锁文件，保证所有 workspace 包安装结果一致。

## 3. 架构与约定

- **Monorepo 分层**：`apps/*` 是消费方应用，`packages/*` 是共享库。应用通过 `workspace:*` 协议引用内部包，实现本地开发时直接链接源码，无需发布。
- **依赖提升与 hoist**：pnpm 默认将依赖提升到顶层 `node_modules`，配合 workspace 协议避免重复安装。
- **Peer Dependencies 模式**：框架包 `@jl/framework` 将 React、antd、axios 等放在 `peerDependencies`，要求使用者自行安装，从而避免多份副本，也允许不同应用使用不同版本的这些库。
- **构建产物约定**：`@jl/framework` 通过 `main/module/types/exports` 指向 `./dist/framework.es.js` 与 `./dist/index.d.ts`，由 `vite build` 产出，`files` 字段仅发布 `dist` 目录。
- **任务级依赖**：`turbo.json` 中 `build` 任务设置 `dependsOn: ["^build"]`，确保在构建某个包之前先构建其 workspace 依赖包。

## 4. 约定与约束

- **包管理器锁定**：根 `package.json` 的 `packageManager` 字段强制使用 pnpm 10.13.1，CI/本地需匹配该版本。
- **Workspace 引用规范**：内部包统一使用 `workspace:*` 协议（见 `apps/demo/package.json` 中对 `@jl/framework` 的引用），而非固定版本号。
- **公共库 peerDependency 约束**：`@jl/framework` 的 `peerDependencies` 明确列出 React ^19.2.0、antd ^6.0.0、axios ^1.13.2、ahooks ^3.9.6、lodash ^4.17.21、simplebar-react ^3.3.2、@ant-design/icons ^6.1.0，使用者必须提供兼容版本。
- **构建缓存策略**：`turbo.json` 对 `build`、`lint` 启用缓存，`dev`、`dev:mock` 禁用缓存并标记为 `persistent`，区分开发与构建场景。
- **发布范围**：仅 `packages/framework` 标记为 `private: false`，其余包（`apps/demo`、`packages/mock`）为私有应用/工具，不对外发布。
- **无 vendoring**：未发现 vendor 目录或 git submodule 形式的第三方代码托管，全部依赖通过 pnpm 从 registry 拉取并由 `pnpm-lock.yaml` 锁定。
- **无私有 registry 配置**：仓库中未发现 `.npmrc`、`.pnpmrc` 等私有源配置，依赖来源为默认 npm registry。