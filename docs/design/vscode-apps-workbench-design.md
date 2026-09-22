# FrontArk Apps Workbench：VS Code 插件开发设计报告

## 1. 结论与产品定位

建议开发一个面向当前业务工程的 VS Code 扩展，暂定名 **FrontArk Apps Workbench**，把 `apps` 组织成可导航、可检索、可编辑、可运行的业务工作台。

核心方案是：**业务导航树 + 页面关联视图 + 配置编辑器 + VS Code 原生源码编辑 + 安全的局部代码修改**。

插件的主要价值不是重复实现资源管理器，而是理解“某个业务页面由哪些文件构成、视图绑定了哪个数据节点、按钮调用了哪个处理器、某项配置在哪个环境生效”，减少跨文件查找和切换成本。

设计原则：

1. `apps` 是业务开发核心目录，所有文件都有访问入口；常用业务文件提供语义化导航。
2. 源文件始终是唯一事实来源，不引入需要与源码双向同步的第二套业务配置数据库。
3. 所有文本文件都能通过原生编辑器修改；仅支持明确语法子集的配置提供表单化编辑。
4. 保留 TypeScript、React、Git、撤销重做、格式化和现有调试能力。
5. 不执行业务模块来提取配置，不因查看文件而启动应用、请求接口或修改工程。
6. 先交付导航和高频配置编辑，再扩展视图设计能力；完整拖拽式低代码平台不纳入首版。

### 1.1 报告边界

- 分析基于当前工作区实际文件，不仅依据附件目录和已有设计文档。
- 工作区存在未提交修改，并新增了 Tauri 桌面端目录；这些内容作为当前观察到的适配对象，不视为已验证的稳定发布能力。
- 本次交付为设计报告，不创建插件工程、不修改业务代码、不运行应用或业务接口。
- 本文中的性能指标、工期、插件 API 和目录结构是开发目标或设计建议，不是已经实现或测得的结果。

## 2. 当前项目结构与关键事实

### 2.1 文件分布与编辑策略

当前 `apps` 下识别到一个应用目录 `demo`，其 `package.json` 中包名为 `web`。插件不能把目录名、包名和浏览器路由前缀视为同一个概念。

| 区域 | 实际内容与职责 | 插件建议能力 |
| --- | --- | --- |
| `apps/demo/package.json` | 应用脚本、React/Vite 等依赖 | 脚本列表、依赖查看、JSON 源码编辑 |
| `src/pages/base/*` | table、form、modal、drawer、tab 五类框架页面 | 页面聚合、四文件联动、数据/视图/事件导航 |
| `src/pages/composite/formAndTable` | 当前为普通 React 占位页面 | 普通页面导航和源码编辑，不强制四文件结构 |
| `src/pages/home`、`src/pages/index.tsx` | 普通 React 页面 | 页面搜索、打开入口、路由候选展示 |
| `src/pages/[...all].tsx` | 路由兜底页面 | 特殊页面标记，不生成可直接打开的通配符 URL |
| `src/layouts` | 登录布局、主布局、菜单、头像、Less | 组件与样式关联、源码编辑 |
| `src/init` | 网络、平台、用户 Store 等初始化 | 初始化入口导航、配置引用定位 |
| `src/interface`、`src/types` | 业务接口、全局类型与环境变量类型扩展 | 类型导航、原生 TypeScript 编辑 |
| `src/theme` | 默认/紧凑主题，包含 Ant Design 配置对象 | 当前主题定位、字面量 token 编辑 |
| `.env`、`.env.dev`、`.env.mock`、`.env.production` | 公共及分环境配置 | 环境矩阵、来源追踪、定点修改 |
| `vite.config.ts` | 路由插件、别名、端口、桌面端条件配置 | 配置摘要、源码定位，复杂逻辑保留源码编辑 |
| `tsconfig*.json` | 严格类型检查、工程引用、路径别名 | JSONC 查看、配置项定位 |
| `eslint.config.js` | Flat Config 和类型导入规则 | 源码编辑、手动运行检查 |
| `index.html`、README、`.gitignore` | 页面外壳、项目说明、忽略规则 | 原生编辑器入口 |
| `config/` | 本次扫描未发现配置文件 | 保留目录入口，未来新增文件自动纳入 |
| `src-tauri/` | Tauri JSON、Cargo TOML、Rust、图标 | 桌面配置分组；Rust/TOML/资源使用原生能力 |
| `tests/` | 复核时新增的应用测试文件，如 `desktop.test.mjs` | 测试源码入口、关联测试脚本，新增文件无需插件升级 |
| `dist/`、`dist-desktop/`、`node_modules/`、`.turbo/` 等 | 产物、依赖、缓存 | 默认不参与语义索引，可按需展开访问 |

重要区别：“覆盖所有文件”不意味着为所有语言和二进制格式各实现一个可视化编辑器。文本文件由原生编辑器兜底；图片等资源交由 VS Code 或已安装的专用扩展预览/编辑；未支持的二进制格式只提供资源入口，不承诺可直接编辑。

### 2.2 业务页面具备可利用的结构化约定

典型页面由四个文件组成：

```text
src/pages/base/table/
├── index.tsx     页面装配：ViewRoot + 三个类
├── data.tsx      数据节点、请求地址、主键等
├── view.tsx      表格、表单、布局、事件绑定等
└── handler.ts    数据操作、请求、事件处理
```

适合转换成工作台中的页面卡片及语义导航，但识别必须以真实导入和 JSX 属性为依据，不能只按文件名或类名猜测。

例如，当前表格页入口把 `./view` 默认导入命名为 `VType`，再传给 `ViewClass`。此处的 `VType` 是局部导入别名，而视图文件中的 `VType.Table` 是框架导出的枚举引用。插件必须区分两者。

目前识别到九个页面候选入口：五个基础框架页面、组合页、首页、根页面和兜底页。最终路由仍由 Vite 插件和入口路由装配共同决定，不能把静态候选数冒充运行时路由表。

### 2.3 路由、菜单与访问 URL 是不同层次

当前 `vite.config.ts` 使用 `vite-plugin-pages`：

- 页面根目录为 `src/pages`。
- 支持 `tsx/jsx/ts/js`。
- 排除 `data.*`、`view.*`、`handler.*`，这些是声明/逻辑文件，不是路由页面。
- `src/main.tsx` 在主布局下挂载自动路由，并额外装配登录路由。
- 普通 Web 使用 `BrowserRouter`；桌面端条件下使用 `HashRouter`。
- 主布局通过 `VITE_API_MENU` 请求菜单，菜单不是本地 `pages` 目录的简单映射。

因此：

1. 创建页面只意味着新增路由候选，不能显示“菜单已自动完成”。
2. 表格页按当前目录规则推导的候选路径是 `/base/table`，不能自动加上应用目录名 `/demo`。
3. 后端菜单维护属于独立集成，不在首版写入范围内。
4. 动态路由需要用户输入参数；兜底路由没有固定可预览地址。
5. 修改页面目录名会影响路由和外部菜单，应展示影响，不能当作普通文件移动无提示处理。

### 2.4 数据节点、视图节点与代码属性名不能混淆

以表格页为例：

| 概念 | 当前示例 | 含义 |
| --- | --- | --- |
| 数据类属性名 | `mainTable` | TypeScript 成员访问名称 |
| 数据节点 ID | `table` | 数据存储和请求节点身份 |
| 视图类属性名 | `table1` | TypeScript 成员名称 |
| 视图节点 ID | `table1` | 视图引用及焦点行关联身份 |
| 普通数据绑定 | `dataId: this.data.mainTable.id` | 表格关联数据节点 |
| 焦点行绑定 | `path: [DataBase.active(this.table1.id)]` | 表单跟随指定表格视图的焦点行 |
| 事件绑定 | `this.handler.onSetData` | 指向 Handler 中的方法 |

当前 `DataProps` 没有顶层 `path` 属性，但其 `params` 条目可以包含 `path`。插件的元数据必须来自当前类型和适配规则，不能照搬旧文档生成已不存在的顶层字段。

`DataBase.active(...)` 返回特殊路径字符串；其参数引用的是视图 ID，不是数据节点 ID。编辑器应通过“绑定方式”选择器生成正确代码，而不是让用户在两个命名空间间盲选。

### 2.5 配置不是全部静态 JSON

现有声明包含：

- `as const`、`satisfies DataProps` 和普通类型注解。
- `this.data.mainTable.id`、`this.form1.id` 等引用。
- `DataBase.active(...)` 等具有框架语义的调用表达式。
- Handler 箭头函数、回调、普通 React JSX。
- 表单中的模块级 `options` 常量引用。
- `defineConfig(({ mode }) => ...)`、条件表达式和外部别名函数。

所以不能采取“运行 TS 文件得到对象”“全部 JSON 序列化后回写”“正则替换所有同名字符串”等方案。

### 2.6 应用之外存在关联配置

`apps/demo` 通过 Vite 和 TypeScript 别名直接消费 `packages/framework/src`；根目录还有 pnpm workspace、Turbo、VS Code Tasks/Launch 配置，Mock 服务位于 `packages/mock`。

插件需要展示这些依赖关系，但默认管理边界仍是所选应用。根配置和框架源码提供“关联配置/打开源码”入口，不由应用编辑面板默认跨目录修改。

## 3. 使用体验设计

### 3.1 界面布局

在 Activity Bar 增加“FrontArk”入口，使用原生 TreeView 组织内容：

```text
FrontArk
├── 应用：demo（包名 web）
├── 业务页面
│   ├── base/table                 [框架页面]
│   │   ├── 页面入口               index.tsx
│   │   ├── 数据节点               mainTable → table
│   │   ├── 视图与字段             table1 / form1 / layout
│   │   └── 事件处理               onSetData / onPrintData / ...
│   ├── base/form
│   ├── base/modal、drawer、tab
│   ├── composite/formAndTable     [普通 React 页面]
│   └── home、根页面、兜底页
├── 应用配置
│   ├── 环境变量                   公共 / dev / mock / production
│   ├── 主题                       当前引用：themeCompact
│   ├── 路由与布局
│   ├── 初始化与网络
│   ├── 构建 / 类型检查 / ESLint
│   └── 桌面端                     仅存在 src-tauri 时显示
├── 脚本与运行
├── 全部文件                       包含隐藏文件和未归类文件
└── 关联工程                       根配置 / framework / mock
```

- 单击语义节点打开对应源码并定位；对配置节点提供“表单编辑”按钮。
- 页面概览使用 WebviewPanel，展示四文件快捷入口、绑定关系和问题摘要；不替代源码标签页。
- 单文件结构化编辑使用 `CustomTextEditorProvider`，采用 `priority: option`，不抢占 TSX/JSON 默认编辑器。
- 环境矩阵是跨文件只读总览；点击单元格后进入对应文件的配置编辑器，避免跨文件编辑状态混乱。
- 当前编辑器切换时，侧栏可跟随高亮所属页面，不强制展开所有节点。
- 状态栏显示当前应用与选中运行配置；“选中配置”与“已经运行的进程配置”分别显示。
- 所有入口支持键盘操作、浅色/深色/高对比度主题，复用 VS Code 颜色变量。

### 3.2 四条核心操作链

**快速进入业务页面**：打开工作台 → 输入页面名、路由、字段或数据节点 → 选择结果 → 原生编辑器定位。

**修改环境配置**：选择 `mock` → 查看每个键的来源及覆盖关系 → 修改明确文件中的键 → 应用到文档 → 原生保存 → 提示是否需要重启。

**修改表格字段**：打开页面视图编辑器 → 选中列 → 修改标题/宽度/控件等受支持属性 → 查看局部差异 → 应用 → 源码和面板同步。

**新增页面**：选择应用及目录 → 选择普通 React/表单/表格模板 → 校验冲突 → 预览待创建文件 → 确认创建 → 提示菜单仍需单独配置。

## 4. 功能范围与优先级

定义：P0 为首个可交付 MVP；P1 为结构化业务编辑增强；P2 为独立的后续扩展。

| 功能 | P0 | P1 | P2 |
| --- | --- | --- | --- |
| 应用识别、切换、多根工作区隔离 | 支持 | 优化 | — |
| 全文件访问、隐藏配置、原生编辑 | 支持 | — | — |
| 页面四文件分组和跳转 | 支持基础识别 | 扩展跨文件引用 | — |
| 文件/页面搜索、当前文件定位 | 支持 | — | — |
| 字段、事件、数据节点语义搜索 | — | 支持 | — |
| 环境变量矩阵、简单值编辑、来源提示 | 支持 | 扩展复杂格式支持 | — |
| package/TSConfig/Vite/主题配置入口 | 支持查看和源码编辑 | 主题 token 与受限配置表单 | — |
| 页面概览及绑定关系摘要 | 基础摘要 | 完整引用图 | 可交互关系图 |
| 视图字段、布局引用、Data 字面量编辑 | — | 支持明确语法子集 | 扩大覆盖面 |
| Handler 方法查看与跳转 | 支持 | 生成事件空方法 | 不承诺可视化任意逻辑 |
| 新增页面 | 普通 React、基础表单/表格 | 弹窗/抽屉/页签模板 | 团队模板库 |
| 页面复制、语义 ID 重命名 | — | 预览确认后执行 | 更广范围重构 |
| 开发、Mock、构建、Lint 脚本入口 | 支持手动启动 | 运行状态和调试配置联动 | — |
| Tauri 配置和资源入口 | 支持原生查看/编辑 | 安全字段表单 | 桌面端专用调试增强 |
| 框架领域诊断 | 基础结构提示 | 引用、绑定、ID 校验 | 更多规则 |
| 拖拽排版、运行态 Store 检查、后端菜单写入 | 不支持 | 不支持 | 单独立项 |

### 4.1 首版明确不做

- 不实现替代 VS Code 的代码编辑器、终端、Git 客户端或 TypeScript 语言服务。
- 不把所有 `.ts/.tsx/.js` 自动转换为表单，不覆盖无法识别的代码。
- 不自动安装依赖、运行 package scripts、访问后端、获取登录态。
- 不自动修改后端菜单、生产环境配置、桌面签名/发布设置。
- 不将业务应用嵌入配置 Webview 执行；真实预览优先打开外部浏览器。
- 不把 `node_modules`、产物和缓存纳入默认全文索引。

## 5. 总体架构与技术选择

### 5.1 分层结构

```text
VS Code 原生能力                  插件 Webview
TreeView / QuickPick /            页面概览 / 环境矩阵 /
Commands / Problems / Tasks      单文件配置编辑器
               \                  /
                命令与消息路由层
                        |
           应用发现 / 索引 / 快照管理
                        |
             框架与配置适配器层
       页面 / Data / View / Env / JSONC / Theme
                        |
             校验 / 差异 / 编辑计划
                        |
       TextDocument + WorkspaceEdit + workspace.fs
```

Extension Host 是权限和状态边界；Webview 只接收脱敏展示模型并提交结构化操作意图，不直接访问文件系统、shell 或业务网络。

### 5.2 技术选型与取舍

| 领域 | 选择 | 理由与边界 |
| --- | --- | --- |
| 扩展宿主 | TypeScript + VS Code 稳定 API | 与业务语言一致，不依赖 Proposed API |
| 树与搜索 | TreeDataProvider、QuickPick、原生搜索 | 减少自绘 UI 和维护成本 |
| 配置 UI | React + 本地 CSS + VS Code 主题变量 | 复用团队经验；首版不引入整套 Ant Design |
| TS/TSX 分析 | 插件自带 TypeScript Compiler API | 支持现有语法，不加载工作区任意解析器代码 |
| JSON/JSONC | jsonc-parser | 保留注释、尾逗号和局部文本结构 |
| 环境变量 | 自有词法定位层 + 固定版本 dotenv/dotenv-expand | 解析与写回分离；不修改扩展宿主 process.env |
| 消息校验 | Zod 严格消息 Schema | 限制动作、属性、值类型与大小 |
| 修改机制 | WorkspaceEdit + 最小 TextEdit | 原生文档、未保存状态、撤销重做 |
| 扩展打包 | esbuild，宿主输出 CJS，外部化 vscode | 控制依赖、启动成本和发布产物 |
| Webview 构建 | Vite，独立资源目录 | 与业务应用的 Vite 配置隔离 |
| 测试 | Vitest + @vscode/test-electron | 分别验证纯逻辑与真实宿主行为 |
| 发布 | @vscode/vsce 生成 VSIX | 先团队离线安装，稳定后再考虑 Marketplace |

首版采用桌面版 VS Code 扩展宿主，建议最低版本基线为 `^1.96.0`，实施时以最低版本集成测试核验所用 API。支持本地 Windows 工作区，多根工作区从首版纳入；SSH/WSL 放在后续验证矩阵，不能在未测时宣称完整支持。

不提供浏览器扩展入口；首版显式声明不支持虚拟工作区，避免用户误以为可运行任务或执行安全写回。代码中的资源身份仍使用 URI，便于后续适配远程宿主。

### 5.3 不选用的方案

- **纯 TreeView**：适合导航，但不足以解决环境差异和批量字段查看需求。
- **所有交互都放 Webview**：会重复实现文件编辑、撤销、搜索、无障碍等原生能力。
- **运行或导入业务类获取配置**：可能触发构造函数、浏览器依赖、网络请求及其他副作用。
- **整文件 AST 打印或 JSON 回写**：容易改动无关格式、注释、表达式，造成大范围 Git diff。
- **首版独立 LSP**：当前仅服务 VS Code 和特定框架，进程协议、同步与部署成本高；先把分析核心设计成无宿主依赖模块，后续再提取。

## 6. 应用发现、文件覆盖与索引

### 6.1 应用发现

按优先级处理以下打开方式：

1. 工作区根为仓库根：定位 `apps/*/package.json`。
2. 工作区根为 `apps`：定位直接子目录中的 `package.json`。
3. 工作区根为单个应用：识别当前 `package.json`、页面目录和 Vite 配置。
4. 非标准结构：允许用户选择应用目录；保存为工作区设置，不改业务文件。

应用身份使用完整根 URI，目录名仅用于展示；包名来自当前 `package.json`，不能用目录名拼接 `pnpm --filter`。

根配置与框架路径在工作区内只读发现。仅打开单应用目录时，如需要访问工作区外的上层仓库，先提示添加仓库为工作区或单独授权，不静默扩大扫描范围。

### 6.2 两层文件视图

**业务视图**：排除构建产物、依赖、日志、缓存，按页面和配置语义分类。

**全部文件视图**：通过 `workspace.fs.readDirectory` 按需枚举，保留未知文件、隐藏文件、空目录和未跟踪文件。生成目录默认折叠并标注，不递归预读；用户可以明确展开和使用原生编辑器打开。

不要让 `files.exclude`、`search.exclude` 或 `.gitignore` 导致 `.env.local` 等重要配置彻底不可达。环境配置按明确文件名规则独立发现，界面注明“本地/忽略文件”。插件提供独立的索引排除设置，不修改用户原有忽略规则。

### 6.3 索引策略

- 初始阶段只发现应用、页面候选和文件元信息；选中页面后才解析其完整声明。
- 小型增量解析在宿主中分批执行；较大扫描与引用分析交给 Worker，避免阻塞 Extension Host。
- Worker 只接收受限源码快照，调用插件自带静态解析器；不提供工作区模块加载或脚本求值入口。Node Worker 本身不是安全沙箱，权限边界仍由宿主检查及不执行工作区代码的约束保证。
- 使用 `createFileSystemWatcher` 感知新增、删除、外部修改；使用 `onDidChangeTextDocument` 同步未保存编辑。
- 以文档版本/内容哈希建立缓存；不同应用、不同 URI 不共享可变索引。
- 文本变更合并窗口建议 200ms；过期解析结果直接丢弃。
- 配置、导入或框架类型变化时只失效相关索引，避免每次击键重建全工程。
- Git 切分支造成批量变化时采用合并刷新，提供手动重建索引命令。
- 默认仅持久化 UI 状态和非敏感路径元信息；源码正文、环境变量值不写入持久缓存。

## 7. 源码解析与框架适配

### 7.1 页面识别

采用“两级识别”：

- 目录/文件名作为候选提示，不能单凭缺少四文件就报错。
- 分析入口的导入、默认导出与 `ViewRoot` JSX 装配，确认三个类的来源。

支持默认导入别名、命名导入别名、`import type`、`.ts/.tsx` 变体和当前 TypeScript 路径别名。解析无法静态确定的重导出、动态工厂或复杂装配时标记为“部分识别”，保留导航，不执行推测性写入。

不额外构建包含全部 React/Ant Design 依赖的完整类型项目；首版以语法树、受限导入图和框架适配规则实现业务识别，通用类型诊断交给 VS Code TypeScript 服务。

### 7.2 值分类及可编辑性

| 值类别 | 例子 | 展示/修改策略 |
| --- | --- | --- |
| 字面量 | 字符串、数字、布尔值、null | 可编辑，保留原引号和上下文 |
| 字面量数组/对象 | `items`、`searchItems`、`keyAttr` | 在明确结构范围内编辑 |
| 包裹表达式 | `'table' as const`、对象 `satisfies DataProps` | 只改内部目标，保留包裹语法 |
| 已知枚举引用 | `VType.Table`、`Ctrl.Input`、`RenderMode.Subscription` | 通过来源确认后提供选择器 |
| 已知成员引用 | `this.form1.id`、`this.data.mainTable.id` | 显示目标及跳转；修改使用引用选择器 |
| 已知框架调用 | `DataBase.active(...)` | 按适配器解释为焦点行引用，不调用函数 |
| 模块级常量引用 | `items: options` | 展示引用；首版跳到声明编辑，避免影响多个消费者 |
| 事件引用 | `this.handler.onSetData` | 跳转与选择方法，不把方法体转为表单 |
| 函数、JSX、计算属性、动态展开 | 箭头函数、`...createItems()` | 显示源码片段并只读，转原生源码编辑 |

遇到对象展开、重复属性或计算属性时，必须评估其是否覆盖目标字段。不能仅因为某个局部字段看起来是字面量，就宣称整个节点可安全编辑。无法确定覆盖顺序或引用语义时关闭受影响字段的写入。

### 7.3 核心内部模型

以下是插件拟新增的内部模型，不是要求业务代码增加的接口：

```ts
type Editability = 'literal' | 'reference' | 'source-only';

interface SourceAnchor {
  documentUri: string;
  documentVersion: number;
  snapshotId: string;
  start: number;
  end: number;
  originalTextHash: string;
}

interface SemanticNode {
  nodeKey: string;
  kind: 'page' | 'data' | 'view' | 'field' | 'handler' | 'config';
  memberName?: string;
  declaredId?: string;
  editability: Editability;
  source: SourceAnchor;
  references: string[];
}
```

`nodeKey` 是当前快照中的编辑目标标识，不能直接用 `field` 或业务 ID 代替。当前表单示例重复展示相同 `field`，这是允许的 UI 用法，不能因此判定字段节点重复或误修改所有同名项。

### 7.4 元数据与框架版本适配

- 首批编辑元数据内置于插件，覆盖当前 Form/Table/Flex/Tab/Modal/Drawer/ToolBar 和常用控件。
- 字段名与类型以当前框架接口核验；JSDoc 可补充展示文案，但不足以自动推导完整表单。
- 框架目前版本为 `0.0.0`，不能仅凭 semver 判断能力；适配器同时记录特征和关键接口指纹。
- 未识别的新字段保留原文并提供源码入口；接口不兼容时降低编辑能力，不删除未知属性。
- 长期可由框架发布纯 JSON 的编辑元数据，但不是首版前置条件，也不要求改造业务声明格式。

## 8. 安全编辑、同步与重构

### 8.1 单文件编辑链路

```text
用户调整属性
  → Webview 提交受限操作意图
  → 宿主校验会话、应用范围、消息 Schema 和权限
  → 取得当前 TextDocument 快照
  → 核对版本、目标位置和原始文本哈希
  → 构建最小 TextEdit
  → 在内存中模拟并重新解析修改结果
  → 展示必要的差异预览
  → WorkspaceEdit 应用到文档
  → 文档事件驱动所有视图刷新
  → 用户使用 VS Code 保存或依其自动保存设置落盘
```

- Webview 不提交可任意写入的文件路径、源码范围或 shell 字符串，只提交宿主已分配的实体 ID、动作及校验后的值。
- AST 用于定位；编辑使用原始文本范围，不默认重新打印整个文件。
- JSONC 用局部修改 API；环境变量只修改对应键的值区域；其他格式保留原生编辑路径。
- 保留 UTF-8、中文、BOM、CRLF/LF、缩进、注释、引号、`as const`、`satisfies` 和无关 import。
- 新增项通过局部格式策略或用户显式格式化处理，不自动执行未知的工作区格式化配置。
- 单次“应用”对应一个有界编辑动作，避免输入每个字符都写文件。
- 应用到文档后只使用文档事件更新面板，避免“面板更新又发写入”的循环。
- 面板未应用表单草稿不作为已保存文件内容；离开面板前由前端交互提示，不能承诺强制拦截 VS Code 标签关闭。需要持久恢复的数据应先应用到 TextDocument。

### 8.2 并发与失败处理

文档版本改变、外部进程修改、Git 切换、格式化或另一个面板编辑后，旧快照的操作必须失效，提示刷新后重新提交。编辑计划按相关文档串行处理；异步解析/预览后，在提交前再次校验版本和目标文本。

公开的 WorkspaceEdit 不是跨进程文件锁或数据库事务。不能仅靠调用一次 `applyEdit` 就承诺任意多文件操作原子成功。应检查返回结果、验证落地状态；发现并发事件或状态不确定时停止继续写入，展示现状，不用旧内容覆盖恢复。

对已打开的脏文档，读取 `TextDocument.getText()` 而非磁盘旧内容。语法不完整时显示解析错误和源码入口，不尝试自动“修复”为插件可识别的格式。

### 8.3 新建、复制、重命名和删除

- 新建页面通过文件创建编辑计划实现，默认 `overwrite: false`；只在目标应用页面根目录下创建。
- 模板先限定普通 React、表单和表格；代码需遵循当前 `verbatimModuleSyntax`、类型导入及框架 API。
- 页面复制不得复制临时文件、构建产物、敏感环境配置；跨页面相同的页内 ID 不默认视为冲突。
- P1 语义重命名区分“TypeScript 成员名”“数据节点 ID”“视图 ID”，分别建立引用集合。
- 引用集合覆盖已识别的 `dataId`、`path`、`DataBase.active`、布局引用、Handler 已知路径及相关类型声明。
- TypeScript 成员重命名优先利用语言服务结果，并补充领域字符串引用；只修改确认语义的引用，禁止全局字符串替换。
- 发现动态引用或范围外依赖时，显示未覆盖清单，禁用“一键完整重命名”的成功承诺。
- 页面目录重命名需提示路由、菜单及外部链接影响；删除需检查文件内容与引用并二次确认，不绕过原生资源操作流程。

## 9. 配置中心设计

### 9.1 环境变量矩阵

每一行展示：键名、公共值、模式覆盖、本地覆盖、文件推导有效值、来源文件、是否被覆盖、引用位置。

文件优先级按 Vite 规则由低到高处理：

```text
.env
  < .env.local
  < .env.[mode]
  < .env.[mode].local
  < 启动 Vite 时实际继承的进程环境
```

需要区分三个维度：

- `mode`：例如 `dev`、`mock`、`production`，决定环境文件集合。
- `NODE_ENV`：与 mode 不等价，不能用 mode 替代构建模式判断。
- 应用目标：当前 `VITE_APP_TARGET` 区分 Web 与桌面端，不是另一套 `.env` mode。

插件只能保证“根据文件和已知任务覆盖推导的值”。外部启动进程、Turbo 环境过滤和 shell 注入可能改变最终环境，界面应标注无法观测的部分，不能读取扩展宿主的全部环境变量冒充 Vite 实际环境。

首版支持常见单行赋值和带引号值；保留注释、空格与顺序。对重复键、复杂多行、无法安全处理的变量展开，给出提示并提供源码编辑。变量展开在隔离对象中计算，不污染 `process.env`。

高频字段：`VITE_TITLE`、`VITE_SERVER_PORT`、`VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN`、`VITE_API_MENU`、`VITE_AUTH_TOKEN_EXPIRE_TIME`、`VITE_UI_DEBOUNCE_DELAY`、`VITE_LOG_LEVEL`、`VITE_ENV`、`VITE_APP_TARGET`。

交互约束：

- “修改当前模式覆盖值”和“修改公共值”是两个明确操作，不能写错文件。
- 原始值仍是环境字符串；数值控件只辅助校验，不改变 Vite 的字符串暴露语义。
- 新增覆盖文件先展示路径并确认；不默认创建或提交 `.env.local`。
- `.env` 修改提示重启相关开发进程；是否重启由用户确认。
- 敏感键默认掩码，日志和索引摘要不包含实际值；复制/显示需要显式操作。
- 提示 `VITE_*` 会暴露到客户端，不能用于保存服务端秘密。
- 引用定位需考虑 `src`、HTML 以及关联框架源码。只在应用中未找到引用时不能直接宣布变量“无用”。

### 9.2 主题

当前 `main.tsx` 实际引用 `themeCompact`，两个主题文件都存在并不意味着有运行时切换机制。

P1 支持：显示当前引用、编辑受支持的字面量 token、查看组件覆盖、跳转算法引用。切换主题须预览 `main.tsx` 的 import 与引用修改；涉及动态主题表达式时降级源码编辑。不能通过只改 `themeDefault.ts` 向用户宣称当前界面已切换。

### 9.3 构建与工具配置

- `package.json`：展示 scripts 和 dependencies，提供 JSON 编辑；不在修改依赖后自动安装。
- `tsconfig*.json`：用 JSONC 解析，保留注释；展示 `extends/references/paths` 来源，不自动展开后重写文件。
- `vite.config.ts`：展示可静态识别的页面目录、排除模式、端口和路径别名。当前存在桌面条件分支及外部函数，复杂部分保留源码定位。
- `eslint.config.js`：不在扩展进程中执行；通过用户手动任务运行 ESLint。
- `src-tauri/tauri.conf.json`：优先支持产品名、窗口标题与尺寸等安全字段；安全策略、capabilities、构建命令和签名发布项保留源码并提示风险。
- 根 Tasks/Launch/Turbo 配置默认只提供关联入口；向导修改需独立展示全部文件并确认。

## 10. 运行、调试与真实预览

### 10.1 脚本映射

优先发现现有 Tasks 和 package scripts，复用而不重复生成相同任务。根脚本与应用脚本分别标识，执行前明确工作目录和影响范围。

| 用户动作 | 当前可发现入口 | 说明 |
| --- | --- | --- |
| 开发 | 根 `pnpm dev` | 经 Turbo 编排，可能启动多个包 |
| Mock 开发 | 根 `pnpm dev:mock` | 与现有 `.vscode/tasks.json` 对应 |
| 构建 | 根 `pnpm build` | 不把单应用和全仓构建混为一谈 |
| Lint | 根 `pnpm lint` | 用户手动运行 |
| 桌面开发 | 根 `pnpm dev:desktop` | 当前配置入口，依赖本机 Tauri/Rust 环境 |
| 桌面构建 | 根 `pnpm build:desktop` | 高成本构建，必须明确操作 |

任务解析器读取当前 scripts，不将上述命令永久写死。需要过滤包时使用真实包名 `web`，不是 `demo`；不能把任意用户输入拼接进 shell。

### 10.2 生命周期与跨平台要求

- 使用 VS Code Task API 管理启动、输出、结束和取消，避免自建不可追踪的后台进程。
- 以“应用 + 脚本 + mode + target”识别插件管理的任务，重复启动时提供复用/停止选择。
- 已打开的外部进程只做状态提示，不擅自接管或终止；扩展退出只清理自己拥有的资源。
- Windows 上不能假设 `.cmd` 可按普通二进制执行，也不能生成 PowerShell 5.1 不支持的 `&&` 串联命令。
- 优先使用解析出的可执行程序与参数数组；必要的 ShellExecution 使用命令/参数分离及严格转义，并由信任策略和执行确认保护。
- 插件不解析或重写 package scripts 内部的 shell 语法，脚本由对应包管理器执行。
- 执行前提示保存与运行关联的脏文档；取消保存时明确运行的将是磁盘版本。

### 10.3 预览行为

首版“预览页面”打开真实开发服务 URL，不在 Extension Host 中渲染业务页面。

- P0 根据已知配置给出候选 URL，由用户对照任务终端确认实际地址；不能把 Task 启动事件等同于服务已经就绪。
- 标准 Task API 不直接提供任意已有任务的 stdout 流。P1 如需自动提取 Vite 实际地址，应为插件自建任务使用受控的 CustomExecution/Pseudoterminal 输出桥接；对已有任务仍保留手动确认，不依赖终端私有 API。
- 当前普通 Web 端口可能被 Vite 自动调整；桌面端配置使用固定端口和 `strictPort`，应区分处理。仅探测端口开放也不足以证明目标是本应用。
- 远程开发通过 `vscode.env.asExternalUri` 处理端口转发，再调用 `openExternal`。
- BrowserRouter 与 HashRouter 分别拼接普通路径和 `/#/路径`；不直接打开 Tauri 构建目录中的 HTML 代替运行环境。
- 登录与接口请求在业务应用自身发生，插件不绕过鉴权或复制浏览器 token。
- CSP、Cookie 和鉴权使内嵌 iframe 更复杂，因此运行态嵌入预览放入 P2 单独评估。

## 11. 领域诊断规则

通用语法、类型、Lint 继续交给现有工具；插件使用独立 `DiagnosticCollection` 只补充框架领域问题，避免重复报错。

| 规则 | 级别与条件 |
| --- | --- |
| `FA001` 页面装配引用无法解析 | 静态确认引用缺失时报错；复杂动态装配只提示部分识别 |
| `FA002` 重复 Data/View ID | 同一页面运行时、同一命名空间内确定重复时报错；不同页面不合并判断 |
| `FA003` 绑定目标不存在 | 已完整解析页面内的 `dataId`、已知 path 或布局引用无目标时报错 |
| `FA004` 焦点行引用类别错误 | `@Active` 或 `DataBase.active` 已确认引用数据 ID 而非视图 ID 时提示错误 |
| `FA005` Handler 方法不存在 | 解析到方法及继承来源后确认缺失才报错，不能只查本类就断言不存在 |
| `FA006` 根视图/布局引用异常 | 可静态确定的不存在节点或布局环提示错误；动态情况不猜测 |
| `FA007` 环境变量重复或覆盖 | 重复键告警；正常环境覆盖以信息形式展示 |
| `FA008` 敏感配置暴露风险 | 对疑似敏感 `VITE_*` 键提示；不在诊断文本显示值 |
| `FA009` 路由与页面操作影响 | 页面重命名提示外部菜单/链接需复核；不宣称已同步后端 |
| `FA010` 适配器不兼容 | 关闭受影响表单写入，保留原生编辑 |

不能把“表单相同 field 出现两次”定义成错误，当前示例就用于展示同一字段的不同控件。`RenderMode.Subscription` 的运行时行键有效性也不能仅凭静态配置保证；只展示适用条件，不伪造运行时检查结果。

## 12. 安全、权限与数据边界

### 12.1 工作区信任

声明 `capabilities.untrustedWorkspaces.supported: limited`。

- 未信任时允许文件导航、只读摘要、插件自带解析器进行静态解析，以及打开原生源码。
- 未信任时禁用插件结构化写入、模板创建、自动重构、任务启动、调试和运行预览。
- 命令入口和宿主处理函数都检查 `workspace.isTrusted`，不能只隐藏按钮。
- 即使工作区已信任，导入业务配置求值也不是默认行为；插件解析器始终采用静态处理。

### 12.2 文件边界

- 使用 URI 标识资源，不用字符串前缀判断目录归属。
- 写入前校验路径段、规范化目标和所属应用，拒绝 `..`、绝对路径逃逸及非授权根目录。
- 本地路径额外检查真实路径；新文件检查最近存在父目录，防止 symlink/junction 越界。
- 全文件视图显示外链时明确标记，不递归追踪越界链接；无法可靠验证的文件系统禁用结构化写入。
- 大文件和二进制不送入 AST/配置面板；默认单文件超过 1 MiB 时降级原生打开，可配置调整。

### 12.3 Webview 和通信

- `localResourceRoots` 默认仅允许扩展打包资源，不直接向 Webview 暴露整个工作区。
- CSP 使用 `default-src 'none'`，脚本使用 nonce，限制样式、图片来源；不使用 CDN 和远程脚本。
- 用户文本作为文本渲染，不作为 HTML 或可执行命令 URI。
- 消息包含协议版本、会话 ID、请求 ID、快照 ID；宿主限制动作、字段和值类型，拒绝超大或未知消息。
- 状态消息与用户编辑消息分离；旧面板、旧快照和重复请求不能触发重复写入。
- 环境敏感值不进入通用日志、错误堆栈附加数据、遥测和持久化 Webview 状态。
- 默认不启用遥测、不上传源码、不内置云端依赖。

## 13. 插件工程组织与发布

### 13.1 推荐目录

实施时建议在同一仓库新增 `packages/vscode-frontark`，复用当前 pnpm workspace 管理，但不把插件代码放入业务 `apps`。

```text
packages/vscode-frontark/
├── package.json                 VS Code 扩展清单及命令/视图/配置声明
├── src/
│   ├── extension.ts             激活、注册与释放
│   ├── workspace/               应用发现、范围与信任检查
│   ├── indexer/                 文件/语义索引、快照、Worker 调度
│   ├── adapters/                页面、Data、View、Env、JSONC、主题适配
│   ├── editing/                 编辑计划、差异、校验、文档提交
│   ├── views/                   TreeView 和页面概览
│   ├── editors/                 CustomTextEditorProvider
│   ├── commands/                导航、新建、搜索、重命名
│   ├── diagnostics/             领域规则
│   ├── tasks/                   脚本发现及生命周期
│   └── protocol/                消息 Schema 与 DTO
├── webview/                     React 面板代码
├── templates/                   内置页面模板
├── tests/                       解析/编辑 fixtures 与宿主集成测试
├── resources/                   图标与静态资源
└── dist/                        扩展入口、Worker、Webview 产物
```

依赖方向：宿主 UI/命令 → 分析与编辑服务 → 适配器；分析核心不导入 `vscode`。扩展运行时不直接 import `@jl/framework` 或 `apps/demo` 的业务模块。

### 13.2 命令与设置

按已声明的视图、命令、自定义编辑器按需激活，不使用无条件 `*` 激活及启动全量扫描。激活后监听工作区增删、配置变化和当前编辑器切换；所有 watcher、provider、Worker 和消息订阅统一纳入 Disposable 生命周期，面板关闭及扩展停用时释放。

建议命令：

- `frontark.selectApp`、`frontark.refresh`、`frontark.searchPages`、`frontark.revealCurrentPage`。
- `frontark.openPagePart`、`frontark.openPageOverview`、`frontark.openConfig`。
- `frontark.createPage`、`frontark.previewChange`、`frontark.renameSemanticId`。
- `frontark.runScript`、`frontark.stopTask`、`frontark.previewPage`。

建议设置：应用根目录、页面目录、默认运行配置、索引排除项、单文件解析大小、诊断开关。数据根等路径按工作区资源作用域解析；改变扫描/执行范围的设置受信任限制。

不建议提供“任意 shell 命令模板”“任意 JS 配置加载器”等首版设置。

### 13.3 构建与安装

- 开发使用 Extension Development Host，与业务应用开发服务分开运行。
- 扩展专用脚本命名为 `build:extension`、`dev:extension`、`test:extension`、`package:extension`，避免自动参加现有所有包的 `dev` 编排；新增 Turbo 任务需明确配置。
- 使用专用 tsconfig 和宿主类型配置，不直接继承业务 DOM/Vite 编译环境。
- 打包宿主、Worker 及 Webview；运行时第三方依赖全部打包或显式收集，`vscode` 保持外部依赖。
- pnpm 的链接式依赖布局不能未经检查直接作为 VSIX 依赖收集依据。若采用 `vsce package --no-dependencies`，必须先验证所有运行时依赖和资源已包含。
- `vsce ls` 检查包内清单，排除业务源码、环境文件、缓存、测试大样本及签名材料。
- 在未安装仓库依赖的干净 VS Code 用户配置中安装 VSIX，验证不存在对本机 node_modules 的隐式依赖。
- 分发先采用 VSIX；Marketplace 发布者账号、命名占用、图标、许可和版本策略在发布阶段确认，不影响首版内部开发。

## 14. 性能目标与测试验收

### 14.1 性能目标

以下为本地 SSD、排除依赖和产物后的验收目标，实施时记录实际机器、样本规模及 P95：

| 场景 | 目标 |
| --- | --- |
| 当前 demo 规模首次出现可用导航 | 1 秒以内，不等待全部语义解析 |
| 1,000 个源码文件、100 个页面的冷索引 | 5 秒以内，期间可取消且界面可交互 |
| 已索引页面搜索 | P95 小于 100ms |
| 当前文档变更后面板更新 | 合并窗口后 P95 小于 300ms |
| 单个简单属性生成局部修改 | P95 小于 150ms，不含用户确认时间 |
| 性能退化 | 大文件/复杂语法明确降级，不造成宿主长时间阻塞 |

### 14.2 自动化测试

| 类别 | 必测案例与断言 |
| --- | --- |
| 应用发现 | 仓库根、apps 根、单应用根、多根、多个同名 demo；实例不串用 |
| 文件覆盖 | 隐藏 `.env`、被忽略 `.env.local`、未跟踪文件、空 config、新扩展名、生成目录按需访问 |
| 页面识别 | 五个基础页面、普通 React、兜底页、默认导入别名 VType、文件变体和部分装配 |
| AST 解析 | `as const`、`satisfies`、枚举、引用、事件函数、模块常量、展开、重复属性、半成品语法 |
| 无损修改 | 仅目标区域改变；保留中文、注释、BOM、换行、引号、未知属性、函数与 JSX |
| 数据语义 | 数据 ID/视图 ID 分离、焦点行引用、合法重复 field、页内 ID 冲突与跨页面同名 |
| 环境变量 | 覆盖链、重复键、引号、注释、变量展开、掩码、模式/target 分离；不污染 process.env |
| 文档同步 | 未保存源码、多面板、撤销/重做、外部写入、旧快照请求、事件反馈循环 |
| 文件操作 | 新建冲突、重命名引用不完整、用户取消、权限错误；失败不覆盖已有内容 |
| 安全 | 未信任工作区、伪造消息、越界路径、Windows junction、XSS 文本、敏感值日志检查 |
| 运行 | 重复启动、端口占用、缺少 pnpm/Rust、任务取消、PowerShell 5.1、包含空格/中文的路径 |
| 分发 | 最低 VS Code 版本、干净安装 VSIX、缺失工作区依赖、主题与键盘可访问性 |

对静态解析器设置“绝不执行工作区代码”的测试：样本文件内放置会产生可观察副作用的构造函数或顶层调用，解析后断言未触发。

### 14.3 以当前仓库为例的验收流程

1. 打开仓库，识别应用 `demo` 和包名 `web`；打开表格页后能跳转入口、Data、View、Handler。
2. 从工作台访问 `.env`、Less、README、Rust、TOML、JSON 和未归类文件；未知类型不会消失。
3. 在配置编辑器修改 mock 环境的普通值，只修改选中的文件和键；撤销后恢复，其他环境不受影响。
4. P1 修改表格某一列标题，只产生对应字面量的局部差异；事件引用和 `satisfies` 保持不变。
5. 把表单绑定到表格焦点行时生成 `DataBase.active(视图ID)` 语义，不写成数据节点 ID。
6. 从普通 React 页面打开工作台，不出现“缺少 data/view/handler”误报。
7. 源码编辑后旧面板提交被拒绝；重新读取后再编辑成功。
8. 新建框架页面，四文件类型检查通过；在当前路由规则下不把声明文件列为页面，并明确提示后端菜单尚未处理。
9. 未信任工作区中能够查看，但无法由插件写入、启动脚本或执行业务代码。
10. VSIX 在干净环境安装成功，浏览与静态编辑不要求先启动应用或连接后端。

## 15. 实施路线与工作量

假设一名熟悉 TypeScript/React 的开发者投入开发，具备代码评审和测试支持；以下为初始估算，不包括 P2。

| 阶段 | 交付结果 | 估算人日 |
| --- | --- | --- |
| A：风险验证 | 扩展骨架、页面别名识别、无损编辑原型、文档同步与信任验证 | 4–6 |
| B：P0 MVP | 应用导航、全文件入口、快速搜索、环境配置、基础模板、任务入口、VSIX | 8–12 |
| C：P1 增强 | Data/View 属性编辑、领域引用和诊断、主题、事件生成、受控复制/重命名 | 15–22 |
| D：发布加固 | 安全/性能/跨平台回归、干净安装验证、使用引导和故障信息 | 5–8 |

- MVP 为 A+B，约 12–18 人日；可先进入日常业务开发试用。
- 完整 P1 加固版本约 32–48 人日；预留约 20% 风险缓冲后约 38–58 人日，单人约 8–12 个工作周。
- 最主要不确定性是源码无损编辑、动态引用边界和跨文件重构，不是侧栏 UI。
- 如果需要首版完整拖拽设计器、运行态数据检查或后端菜单写回，应单独评估，不能纳入上述估算直接承诺。

### 15.1 阶段退出条件

A 阶段先通过以下门槛：表格页默认导入别名可识别；`as const/satisfies` 与注释可保留；多面板旧快照拒绝；解析期间业务代码零执行。任一失败，先缩小结构化编辑范围，不继续堆叠面板功能。

B 阶段以“常用文件两步内到达、环境变量改对文件、模板可用、VSIX 可安装”为核心。C 阶段以“支持的语法稳定编辑，不支持的语法完整保留”为核心。D 阶段以安全和回归用例通过为发布条件。

## 16. 主要风险与决策边界

| 风险 | 应对 |
| --- | --- |
| 框架 API 仍在演进 | 适配器特征检测、类型指纹、fixture 回归；不只依赖 0.0.0 版本号 |
| 任意 TS 表达式无法可靠静态求值 | 明确子集，表达式源码保留，禁止运行求值 |
| 插件写回破坏业务代码 | 最小编辑、内存模拟、版本校验、差异预览、原生撤销 |
| 文件系统和多编辑器并发 | 当前文档为准，旧计划拒绝，失败停止，不宣传全局事务 |
| 自动路由和后端菜单不同步 | 分开展示，页面操作提示后端影响，不自动写接口 |
| `.env`、桌面权限配置具有敏感性 | 掩码、目标文件确认、高风险配置源码编辑、禁止上传 |
| 索引因依赖/产物过大而卡顿 | 两层视图、按需枚举、范围过滤、Worker、取消与缓存 |
| 插件变成另一套业务开发框架 | 只增强既有源码，不要求业务迁移到插件专用 DSL |

默认按“内部团队使用、桌面 VS Code、本地文件系统、现有目录约定、静态配置增强”落地。是否公开发布、适配其他框架版本、引入后端管理 API、支持 Web IDE，属于后续范围决策。

## 17. 源码与官方资料依据

### 17.1 当前仓库关键依据

- [应用依赖与脚本](../../apps/demo/package.json)、[根脚本](../../package.json)、[workspace 范围](../../pnpm-workspace.yaml)、[Turbo 编排](../../turbo.json)。
- [Vite 页面规则、别名及桌面条件](../../apps/demo/vite.config.ts)、[应用路由及主题装配](../../apps/demo/src/main.tsx)。
- [表格页入口](../../apps/demo/src/pages/base/table/index.tsx)、[数据声明](../../apps/demo/src/pages/base/table/data.tsx)、[视图声明](../../apps/demo/src/pages/base/table/view.tsx)、[事件处理](../../apps/demo/src/pages/base/table/handler.ts)。
- [表单中的控件、重复字段和常量引用](../../apps/demo/src/pages/base/form/view.tsx)、[普通 React 组合页](../../apps/demo/src/pages/composite/formAndTable/index.tsx)。
- [后端菜单加载](../../apps/demo/src/layouts/main/MainLayout.tsx)、[网络初始化](../../apps/demo/src/init/net.ts)、[平台与 Hash 导航](../../apps/demo/src/init/platform.ts)。
- [紧凑主题](../../apps/demo/src/theme/themeCompact.ts)、[默认主题](../../apps/demo/src/theme/themeDefault.ts)、[全局类型](../../apps/demo/src/types/global.d.ts)。
- [公共环境配置](../../apps/demo/.env)、[开发环境](../../apps/demo/.env.dev)、[Mock 环境](../../apps/demo/.env.mock)、[生产环境](../../apps/demo/.env.production)。
- [类型检查配置](../../apps/demo/tsconfig.app.json)、[ESLint 配置](../../apps/demo/eslint.config.js)、[现有 Task](../../.vscode/tasks.json)、[现有调试配置](../../.vscode/launch.json)。
- [Tauri 配置](../../apps/demo/src-tauri/tauri.conf.json)。
- [框架 DataProps](../../packages/framework/src/data/interface.ts)、[视图基础接口](../../packages/framework/src/comp/view/interface.ts)、[表格属性与渲染模式](../../packages/framework/src/comp/view/table/interface.ts)、[框架包版本](../../packages/framework/package.json)。

### 17.2 官方能力依据

- [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)。
- [VS Code Custom Editors](https://code.visualstudio.com/api/extension-guides/custom-editors)：TextDocument、局部 WorkspaceEdit、多视图同步与撤销机制。
- [VS Code Webview](https://code.visualstudio.com/api/extension-guides/webview)：消息通信、CSP、本地资源限制。
- [VS Code Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)：受限模式、能力声明与运行时检查。
- [VS Code Virtual Workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)：URI、文件系统抽象与兼容边界。
- [VS Code Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)：扩展打包与产物组织。
- [Vite Env Variables and Modes](https://vite.dev/guide/env-and-mode)：环境优先级、变量展开、mode 与 NODE_ENV、客户端暴露和重启要求。

最终建议：先把 `apps` 做成一个真正理解业务文件关系的开发工作台，再逐步加入安全的结构化编辑。对当前项目而言，最值得优先投入的是页面四文件联动、环境配置来源追踪、Data/View/Handler 关联导航，以及不会破坏源码的局部修改能力。
