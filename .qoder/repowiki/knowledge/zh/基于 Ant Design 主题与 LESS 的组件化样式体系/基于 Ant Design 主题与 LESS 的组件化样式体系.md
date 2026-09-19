---
kind: frontend_style
name: 基于 Ant Design 主题与 LESS 的组件化样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - apps/demo/src/theme/themeDefault.ts
    - apps/demo/src/theme/themeCompact.ts
    - apps/demo/src/main.tsx
    - apps/demo/vite.config.ts
    - apps/demo/src/layouts/main/styles.less
    - apps/demo/src/layouts/login/styles.less
    - apps/demo/src/layouts/main/comp/Menu.less
    - packages/framework/src/comp/view/table/styles/index.less
    - packages/framework/src/comp/view/form/styles/form.less
    - packages/framework/src/comp/view/toolbar/styles/toolbar.less
---

## 1. 样式系统总览

本项目采用 **Ant Design v6 + LESS** 作为前端样式方案，通过 `ConfigProvider` 在应用根节点注入主题配置，配合各业务页面/布局的独立 `.less` 文件实现样式隔离。框架包 (`packages/framework`) 内部同样使用 LESS 为内置控件（Button、Form、Table、SearchPanel 等）提供默认样式。

- 构建工具：Vite + `@vitejs/plugin-react-swc`，LESS 由 Vite 原生支持，无需额外 loader。
- 路由与页面：`vite-plugin-pages` 基于 `src/pages` 目录生成路由，页面按 `data.tsx / handler.ts / view.tsx / index.tsx` 四段式组织，视图层通过声明式 `VProps` 描述 UI，不直接手写 JSX 样式。
- 设计系统：以 Ant Design 的 `ThemeConfig` 为核心，集中定义 `token`（如 `borderRadius`）、`algorithm`（defaultAlgorithm / compactAlgorithm）以及组件级覆盖（`components.Table`、`components.Input`）。

## 2. 关键文件与位置

- 主题配置：`apps/demo/src/theme/themeDefault.ts`、`apps/demo/src/theme/themeCompact.ts`，导出 `ThemeConfig` 对象供 `ConfigProvider` 使用。
- 应用入口挂载主题：`apps/demo/src/main.tsx` 中 `<ConfigProvider theme={themeCompact}>` 包裹整个路由树。
- 布局样式：`apps/demo/src/layouts/main/styles.less`、`apps/demo/src/layouts/login/styles.less`、`apps/demo/src/layouts/main/comp/Menu.less`。
- 框架内置组件样式：`packages/framework/src/comp/control/*/index.less`、`packages/framework/src/comp/view/table/styles/index.less`、`packages/framework/src/comp/view/form/styles/*.less`、`packages/framework/src/comp/view/toolbar/styles/toolbar.less` 等，每个控件组件在其同级目录引入对应 `.less`。
- 构建配置：`apps/demo/vite.config.ts` 仅依赖 Vite 原生 LESS 能力，无额外 postcss/less 插件。

## 3. 架构与约定

### 3.1 主题分层
- 全局主题通过 `ThemeConfig` 集中管理，区分 `themeDefault`（宽松）与 `themeCompact`（紧凑）两套算法，均设置 `borderRadius: 2` 并保留 Table/Input 的空覆盖占位，便于后续扩展。
- 主应用默认启用紧凑主题，切换主题只需替换 `ConfigProvider` 传入的 theme 对象。

### 3.2 样式作用域
- 业务层样式采用 **BEM 风格命名**（如 `.main-layout`、`.main-header`、`.login-container`、`.login-card`），并通过模块内独立的 `.less` 文件引入，避免全局污染。
- 框架层样式遵循“组件目录即样式目录”的约定：每个控件组件与其 `index.less` 或 `styles/*.less` 同目录，由组件文件显式 `import './xxx.less'` 注入。

### 3.3 响应式策略
- 使用 CSS `@media (max-width: 576px)` 针对登录页做移动端适配（调整 padding、字号、按钮高度等），属于轻量级断点处理，未引入媒体查询变量或响应式工具类库。

### 3.4 第三方组件样式覆盖
- 通过 LESS 嵌套直接覆盖 Ant Design 组件类名（如 `.ant-form .ant-form-item`、`.ant-input`、`.ant-btn-loading`、`.simplebar-scrollbar::before`），而非通过 `ConfigProvider.components` 全部覆盖，说明样式定制集中在视觉表现层。

## 4. 约定与约束

- **主题必须经 `ConfigProvider` 注入**：所有页面共享同一套 `ThemeConfig`，禁止在单个组件内重复创建主题。
- **样式文件统一使用 `.less`**：项目中未发现 `.scss` / `.css-in-js` / Tailwind 配置，所有新增样式应遵循此约定。
- **组件样式就近放置**：框架内每个控件组件与其样式文件同目录，业务布局样式也放在对应 layout 目录下，保持“一处组件一处样式”。
- **页面视图层走声明式 `VProps`**：`view.tsx` 通过 `VType.Table`、`VType.Form`、`VType.LayoutFlex` 等描述 UI 结构，样式主要由框架内置样式与主题 token 驱动，减少手写 CSS。
- **动画与交互效果通过 LESS 伪类/关键帧实现**：如登录卡片 `fadeInUp`、输入框 `inputFocus`、按钮 hover/active/disabled 状态过渡，统一写在对应 `.less` 文件中。

## 5. 适用性说明

该样式体系适用于本 monorepo 中的 `apps/demo` 应用及 `packages/framework` 内置组件；若未来新增业务 app，可复用同一套 Ant Design 主题与 LESS 约定。