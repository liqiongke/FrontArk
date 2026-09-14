---
kind: dependency_management
name: 基于 pnpm + Turborepo 的 Monorepo 依赖管理
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
---

## 1. 使用的系统与工具

- **包管理器**：pnpm（通过根 `package.json` 的 `packageManager: "pnpm@10.13.1"` 字段锁定版本，确保团队与 CI 使用统一 pnpm）。
- **Monorepo 编排**：`pnpm-workspace.yaml` 声明两个 workspace 目录 `apps/*` 和 `packages/*`，所有子项目共享同一份依赖树。
- **任务/构建编排**：Turborepo（根 `package.json` 中安装 `turbo ^2.6.1`，并通过 `turbo run build/dev/lint` 统一调度各子项目的脚本）。
- **锁文件**：根目录 `pnpm-lock.yaml`（lockfileVersion 9.0），记录每个 importer（根、`apps/web`、`packages/framework`、`packages/mock`）解析到的精确版本及 peerDependencies 组合。

## 2. 关键文件

- `package.json`（根）：定义顶层脚本 `build`/`dev`/`dev:mock`/`lint`，均通过 `turbo run ...` 转发；声明 `packageManager` 固定 pnpm 版本。
- `pnpm-workspace.yaml`：声明 workspace 成员为 `apps/*` 与 `packages/*`。
- `turbo.json`：定义 `build`/`dev`/`dev:mock`/`lint` 四个 task，其中 `build` 依赖 `^build`（上游产物就绪后再构建下游），并缓存 `dist/**`、`lib/**`。
- `apps/demo/package.json`：应用级依赖声明，包含 React 19、antd 6、ahooks、axios、lodash、react-router-dom 等运行时依赖，以及 Vite、TypeScript、ESLint 等开发依赖。
- `packages/framework/package.json`：内部库 `@jl/framework`，通过 `peerDependencies` 声明对 react、antd、ahooks、axios、lodash 等的版本要求，自身仅内联依赖 immer、zustand；通过 `exports` 同时暴露 ESM (`framework.es.js`) 与 UMD (`framework.umd.js`) 入口。
- `pnpm-lock.yaml`：锁定所有第三方包的精确版本，并记录 workspace 内 `@jl/framework` 以 `link:../../packages/framework` 形式被 `apps/web` 引用。

## 3. 架构与约定

- **Workspace 内包引用**：应用通过 `workspace:*` 协议引用内部框架包（如 `"@jl/framework": "workspace:*"`），由 pnpm 在本地建立 symlink，无需发布到 npm registry。
- **依赖分治**：公共 UI/业务逻辑下沉到 `packages/framework`，通过 `peerDependencies` 将 React、antd、ahooks、axios、lodash 等“宿主”依赖交由使用方提供，避免重复打包；框架自身只持有状态管理相关内联依赖（immer、zustand）。
- **版本范围策略**：外部依赖普遍采用 `^` 语义化版本范围（如 `antd: ^6.0.0`、`react: ^19.2.0`、`vite: ^7.2.x`），配合 `pnpm-lock.yaml` 锁定实际安装版本，便于安全更新的同时保持可重现构建。
- **构建缓存**：Turborepo 对 `build`、`lint` 启用缓存，`dev`/`dev:mock` 禁用缓存并标记为 persistent，提升开发体验。

## 4. 约定与约束

- **必须使用 pnpm**：根 `package.json` 的 `packageManager` 字段锁定 pnpm 版本，是团队与 CI 的统一约束。
- **Monorepo 结构固定**：新增应用需放在 `apps/` 下，新增库需放在 `packages/` 下，才能被 workspace 自动发现。
- **内部包通过 workspace 协议引用**：`apps/demo` 对 `@jl/framework` 使用 `workspace:*`，而非版本号，保证开发期直接链接源码。
- **框架包不重复打包宿主依赖**：`packages/framework` 将 React、antd、ahooks、axios、lodash 等声明为 `peerDependencies`，使用者需自行提供对应版本。
- **构建产物路径受 Turborepo 约束**：`build` task 缓存输出目录为 `dist/**`、`lib/**`，因此各子项目的构建配置应产出到这些目录，否则缓存命中会失效。
- **无私有仓库或 vendoring 配置**：当前仓库未配置 `.npmrc`/`.pnpmrc` 中的私有 registry、`shamefully-hoist=false` 等策略，也未见 `vendor/` 目录或 Git submodule；依赖全部来自公开 npm registry 并由 `pnpm-lock.yaml` 锁定。