---
kind: frontend_style
name: 基于 Ant Design + Less 的组件化主题与样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - apps/demo/src/theme/themeDefault.ts
    - apps/demo/src/theme/themeCompact.ts
    - apps/demo/src/main.tsx
    - apps/demo/src/layouts/main/styles.less
    - apps/demo/src/layouts/login/styles.less
    - packages/framework/vite.config.ts
    - apps/demo/vite.config.ts
    - packages/framework/src/comp/control/button/index.less
    - packages/framework/src/comp/view/table/styles/index.less
---

## 1. 采用的样式系统

本仓库采用 **Ant Design** 作为 UI 组件库，配合 **Less** 编写样式，通过 Vite 构建。样式组织遵循“每个组件/页面独立样式文件”的模式：组件目录下配套 `index.less` / `styles.less`，由对应 `.tsx` 直接 `import` 引入，实现样式与组件强绑定。

- 主题定制：通过 Ant Design 的 `ConfigProvider` + `ThemeConfig` 在应用入口注入主题，demo 应用中提供两套预设主题 `themeDefault.ts`（defaultAlgorithm）和 `themeCompact.ts`（compactAlgorithm），统一设置 `borderRadius: 2` 及 `Table`、`Input` 等组件 token。
- 样式预处理：全部使用 Less，未引入 CSS Modules、CSS-in-JS 或 Tailwind。
- 构建工具：Vite 原生支持 Less；框架包 (`packages/framework`) 通过 `vite-plugin-dts` 输出 ES 模块，并在 Rollup `external` 中声明 `antd`、`@ant-design/icons` 等 peer 依赖，避免重复打包。

## 2. 关键文件

- 主题配置：`apps/demo/src/theme/themeDefault.ts`、`apps/demo/src/theme/themeCompact.ts`
- 应用入口（注入 ConfigProvider）：`apps/demo/src/main.tsx`
- 布局样式：`apps/demo/src/layouts/main/styles.less`、`apps/demo/src/layouts/login/styles.less`
- 组件样式（框架包）：`packages/framework/src/comp/control/*/index.less`、`packages/framework/src/comp/view/table/styles/index.less`、`packages/framework/src/comp/view/form/styles/*.less` 等
- 构建配置：`apps/demo/vite.config.ts`、`packages/framework/vite.config.ts`

## 3. 架构与约定

- **组件级样式隔离**：每个可复用组件（如 `ctrlButton`、`ctrlCheckbox`、`SearchPanel`、`viewTable`）都在自身目录内维护独立的 `index.less` 或 `styles/*.less`，并通过相对路径从组件文件中 import，避免全局样式污染。
- **命名空间类名**：样式类名采用语义化前缀，如 `.ctrl-button`、`.view-table`、`.main-layout`、`.login-container`，便于区分框架组件、业务布局与第三方组件覆盖。
- **主题分层**：业务层通过 `themeDefault` / `themeCompact` 两个 ThemeConfig 对象集中管理设计 token（圆角、算法、组件覆盖），组件内部不硬编码颜色/尺寸，而是依赖 Ant Design 的设计令牌。
- **响应式策略**：通过 Less 的 `@media (max-width: 576px)` 断点处理移动端适配（见登录页样式），未使用 CSS Grid/Flex 媒体查询组合或设计系统的响应式断点变量。
- **第三方样式覆盖**：通过嵌套选择器直接覆盖 Ant Design 默认样式（如 `.ant-form .ant-form-item`、`.ant-input`、`.simplebar-scrollbar::before`），而非通过主题 token 覆盖，属于局部样式定制。

## 4. 约定与约束

- 所有样式文件使用 `.less` 后缀，由组件文件显式 `import` 引入，无全局 CSS 入口。
- 主题必须通过 `ThemeConfig` 对象定义并导出，供 `ConfigProvider` 使用；禁止在组件样式中散落品牌色常量。
- 框架包的样式需保持轻量（示例 `ctrl-button` 仅 3 行），复杂样式应下沉到 `view/*` 层，控制层组件只负责基础交互。
- 构建时 `antd`、`@ant-design/icons` 等被标记为 external，宿主应用必须自行安装这些依赖，否则样式无法生效。
- 布局与页面样式按功能域拆分：`layouts/main`、`layouts/login` 各自持有独立样式，子组件（如 `Avatar`、`Menu`）再引用父级样式或自建样式文件。