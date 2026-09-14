---
kind: frontend_style
name: 基于 Ant Design + Less 的模块化主题与样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - apps/demo/src/main.tsx
    - apps/demo/src/theme/themeDefault.ts
    - apps/demo/src/theme/themeCompact.ts
    - apps/demo/src/layouts/main/styles.less
    - apps/demo/src/layouts/login/styles.less
    - apps/demo/src/layouts/main/comp/Menu.less
    - packages/framework/src/comp/control/button/index.less
    - packages/framework/src/comp/view/form/styles/form.less
    - apps/demo/vite.config.ts
    - apps/demo/package.json
---

## 1. 采用的样式系统

- **UI 组件库**：统一使用 [Ant Design v6](https://ant.design)（`antd ^6.0.0`）作为基础组件，图标来自 `@ant-design/icons ^6.1.0`。
- **样式预处理器**：全部使用 **Less**（`less ^4.4.2`），无 Sass/SCSS、CSS Modules、Tailwind 等方案。
- **构建工具链**：通过 Vite + `@vitejs/plugin-react-swc` 直接编译 `.less` 文件，无需额外 postcss 配置。
- **主题机制**：采用 Ant Design v6 的 `ConfigProvider` + `ThemeConfig` 运行时主题注入，而非 CSS 变量覆盖或 less 变量替换。

## 2. 关键文件与位置

| 职责 | 路径 | 说明 |
|---|---|---|
| 全局主题入口 | `apps/demo/src/main.tsx` | 在根节点用 `<ConfigProvider theme={themeCompact}>` 注入主题 |
| 默认主题 | `apps/demo/src/theme/themeDefault.ts` | 基于 `theme.defaultAlgorithm`，设置 `borderRadius: 2` 及组件 token |
| 紧凑主题 | `apps/demo/src/theme/themeCompact.ts` | 基于 `theme.compactAlgorithm`，同上 token 结构 |
| 布局样式 | `apps/demo/src/layouts/main/styles.less`、`layouts/login/styles.less` | 页面级布局样式，按 layout 目录组织 |
| 子组件样式 | `layouts/main/comp/Menu.less`、`Avatar.tsx` 中引入父级 `../styles.less` | 组件内联样式，就近管理 |
| 框架组件样式 | `packages/framework/src/comp/control/*/index.less`、`view/form/styles/*.less` | 每个控制/视图组件自带 `index.less` 或 `styles/*.less` |
| 第三方滚动条样式 | `simplebar-react/dist/simplebar.min.css` | 在 `MainLayout.tsx`、`Menu.tsx` 中按需引入 |

## 3. 架构与约定

### 3.1 主题分层
- 应用层主题集中在 `apps/demo/src/theme/`，导出 `ThemeConfig` 对象，通过 `ConfigProvider` 在 `main.tsx` 顶层注入。
- 主题仅覆盖少量 token（如 `borderRadius: 2`）和个别组件（`Table`、`Input` 占位扩展点），其余遵循 Ant Design 默认设计。
- 提供两套算法：`defaultAlgorithm`（宽松）与 `compactAlgorithm`（紧凑），便于切换。

### 3.2 样式组织方式
- **布局级样式**：放在对应 layout 目录下的 `styles.less`，由该 layout 组件 `import './styles.less'` 引入。
- **组件级样式**：框架包 `packages/framework/src/comp/**` 下，每个控件组件与其同级 `index.less` 绑定；表单相关样式放入 `styles/form.less`、`styles/formItem.less` 等子目录。
- **命名规范**：所有类名使用 BEM 风格的小写连字符命名（如 `.main-layout`、`.ctrl-button`、`.view-form-container`），避免使用 CSS Modules 的局部作用域。
- **样式隔离**：不使用 CSS-in-JS，也不使用 CSS Modules；样式通过普通 `.less` 文件以模块级 import 方式加载。

### 3.3 与 Ant Design 的集成约定
- 颜色、背景等视觉值优先从 `theme.useToken()` 获取（如 `colorBgContainer`），避免硬编码色值。
- 对第三方滚动条（SimpleBar）通过覆盖 `.simplebar-scrollbar::before` 伪元素来适配主题色。
- 登录页等独立页面通过嵌套选择器（如 `.login-card .ant-input`）对 Antd 组件进行局部覆盖。

### 3.4 响应式策略
- 使用 Less 的 `@media (max-width: 576px)` 断点进行移动端适配（见 `login/styles.less`）。
- 未引入 CSS Grid/Flex 媒体查询工具库，纯手写 media query。

## 4. 约定与约束

- **必须通过 `ConfigProvider` 注入主题**：`main.tsx` 在根节点包裹 `ConfigProvider`，确保全应用共享同一套 token。
- **新增控件样式需新建 `index.less`**：框架包中每个 `comp/control/*` 都配套一个同名 `index.less`，新控件应遵循此模式。
- **布局样式就近管理**：layout 及其子组件的样式放在各自目录下，不集中到全局样式文件。
- **禁止硬编码主题色**：业务组件应使用 `theme.useToken()` 返回的 token，而非直接使用 `#1890ff` 等色值（登录页为演示例外）。
- **统一使用 Less**：项目中未发现任何 `.scss`、`.css`（除第三方 `simplebar.min.css`）或 CSS-in-JS 用法，新增样式应使用 `.less`。
- **类名使用 BEM 小写连字符**：观察到的类名均为 `.xxx-yyy` 形式，未见大驼峰或下划线命名。