# Ant Design 全量迁移至 shadcn/ui 开发计划书

## 一、目标与范围

已确认的实施方向：
- 视觉采用 shadcn/ui 风格，保留现有页面结构和主要交互，不复刻 Ant Design 的外观。
- 优先保持现有业务 API：`ViewRoot`、`ViewBase`、`DataBase`、`HandlerBase`、`VProps`、`VType`、`Ctrl` 及页面四件套继续使用。
- 最终应用与框架不再依赖 `antd`、`@ant-design/icons`，运行源码、类型声明、测试和构建配置中消除相关依赖。
- 覆盖 `packages/framework`、`apps/demo`，同时验证 Web 和 Tauri 桌面形态。

本次不包含：重做状态管理、改变后端业务协议、新增权限系统、完善占位业务页面，以及重建 Ant Design 全部组件能力。所谓“完整替换”，指当前仓库已使用、已封装的能力全部迁移，而不是实现一个 Ant Design 克隆库。

## 二、项目现状与影响分析

### 2.1 已核实的架构

项目为 pnpm + Turborepo Monorepo：
- `apps/demo` 的包名为 `web`，使用 React 19、Vite 7、React Router 7。
- `packages/framework` 是 `@jl/framework`，使用 Zustand + Immer 管理数据与视图。
- Demo 开发和生产构建均通过 alias 直接消费 framework 源码；框架另外通过 Vite library 模式生成 JS 与声明文件。因此迁移必须同时保证“源码消费”和“构建产物消费”可用。
- 当前依赖 `antd ^6.0.0`、`@ant-design/icons ^6.1.0`，主题由 `ConfigProvider` 注入，存在默认、紧凑两套主题配置。
- 当前找到 20 个 Less 文件。除组件布局样式外，还包含 `.ant-*` 覆盖和 `--ant-*` CSS 变量依赖。

### 2.2 实际迁移范围

| 范围 | 当前情况 | 迁移重点 |
| --- | --- | --- |
| 13 类基础控件 | Text、Input、Button、Select、Switch、Radio、Checkbox、Date、DateRange、Time、TimeRange、Link、Upload | 控件外观、事件和值类型适配 |
| 7 类视图/布局 | Table、Form、Toolbar、Flex、Tab、Modal、Drawer | 保留声明式配置和 Handler 控制方式；Flex 主要调整样式 |
| 搜索面板 | 查询条件、搜索、重置、下拉式面板组件 | 保留请求节点 criteria 与防抖取消逻辑 |
| 应用外壳 | 登录、主布局、侧栏菜单、头像菜单 | 替换直接使用的 Ant Design 组件及类型 |
| 全局反馈 | 静态 message 与 useMessage | 统一消息入口，确保非 React 网络回调也能提示 |
| 桌面组件 | 最小化、最大化、关闭按钮 | 仅替换 UI，保留原生调用、事件订阅和权限 |
| 工程与测试 | peerDependencies、external、主题、Ant 内部测试探针 | 消除隐性依赖，补充新实现的测试 |

生产源码与类型文件中有 30 余处文件直接依赖 Ant Design 或图标库；实际改动还包括样式、构建、测试与新增的 shadcn 源码。

关键证据：
- [框架控件枚举](file:///d:/workspace/web/packages/framework/src/comp/control/interface.ts#L15-L46)
- [虚拟表格及双模式入口](file:///d:/workspace/web/packages/framework/src/comp/view/table/viewTable.tsx#L22-L106)
- [按行身份绑定的单元格](file:///d:/workspace/web/packages/framework/src/comp/view/table/comp/basetable/boundTableCell.tsx#L49-L104)
- [框架 Form 实现](file:///d:/workspace/web/packages/framework/src/comp/view/form/viewForm.tsx#L10-L34)
- [Demo 源码 alias](file:///d:/workspace/web/apps/demo/vite.config.ts#L36-L42)
- [现有表格集成测试](file:///d:/workspace/web/packages/framework/src/comp/view/table/viewTable.test.tsx#L17-L65)

### 2.3 对实施方案有直接影响的发现

1. **框架 Form 并不是 Ant Design Form 的封装。** 它使用 Row/Col 布局，数据由框架 hooks 管理；只有登录页使用 Ant Design Form 校验。无需把所有业务表单迁移到另一个表单状态引擎。
2. **表格不能换成普通 HTML 表格就算完成。** 当前启用虚拟滚动、关闭内部分页，并已有 Record/Subscription 双模式、焦点行和局部更新隔离。
3. **业务 schema 大部分已独立于 Ant Design。** 明确的类型耦合包括内部 `TableColumn = ColumnType<any>`、应用菜单 `MenuProps`、上传实现中的类型；不需要全面改写业务配置。
4. **日期控件存在读写类型风险。** 回调将格式化字符串写入 store，回显时又直接把 store 值交给要求日期对象的组件。新实现必须提供明确的解析/序列化边界。
5. **存在与迁移直接相关的小型契约缺陷。** 单 Checkbox 写入布尔值后会继续落入数组处理；Modal 声明了 `onOk` 但当前没有调用。迁移时单独修正并测试，不复制这些缺陷。
6. **演示数据不足以覆盖所有控件。** 表单 mock 未提供日期、时间等多数控件的初始值；未发现上传路由。上传测试使用请求拦截模拟成功/失败，不新增真实文件存储服务。
7. **组合页目前是占位页面。** 真正的焦点行表单联动发生在 `/base/table`，应以该页及集成测试验收，不把占位页当成功能已实现。

本轮已完成静态代码与官方资料核对，尚未运行迁移后的构建、测试或浏览器验证。

## 三、技术方案

### 3.1 分层与技术选型

采用以下结构：

```text
业务页面 / View schema / Handler
               ↓
现有 Ctrl*、View* 适配层
               ↓
framework 内的 shadcn/ui 源码组件
               ↓
Radix UI + Tailwind CSS + 专项能力库

业务数据仍由现有 Zustand / Immer / PageRuntime 管理
```

具体决策：
- 使用 **shadcn 的 Radix UI 版本**，统一 `new-york`、`neutral`、Lucide 图标；`rsc: false`，适配当前 Vite SPA。
- 使用 **Tailwind CSS v4 + CSS variables**；复杂布局保留少量具名 CSS，迁移现有 UI Less 文件后移除未再使用的 Less 依赖。
- shadcn 组件源码放入现有 `packages/framework`，本次不新增独立 UI workspace。
- 表格采用 **shadcn Table + TanStack Table + TanStack Virtual**。
- 本轮查询到的版本为 `@tanstack/react-table 9.2.4`、`@tanstack/react-virtual 3.14.13`，作为迁移基线锁定；当前官网表格教程已使用 v9，不能直接套用旧 v8 示例。
- 消息使用 **Sonner**，由框架导出统一 `notify` 服务，应用根节点挂载一个 Toaster。
- 登录校验使用 **React Hook Form + Zod**；它们只服务登录页，不接管框架业务表单。
- 日期日历使用 shadcn Calendar；以 **Day.js + customParseFormat** 适配原有 `YYYY-MM-DD` 等 format 语法，Calendar 内部使用原生 Date，store 保持字符串。
- 不安装虚构的“shadcn 运行时组件库”；通过 CLI 引入并维护组件源码，锁定生成工具和依赖版本。

### 3.2 拟新增目录与导出

```text
packages/framework/
  components.json
  src/ui/
    components/           shadcn 原始基础组件
    lib/utils.ts          cn 等 UI 工具
    styles/
      theme.css           颜色、圆角、密度变量
      index.css           Tailwind 与框架样式入口
    index.ts              公开 UI 导出
  src/comp/control/...    保留现有业务控件适配层
  src/comp/view/...       保留现有业务视图适配层
  src/utils/notify/...    消息封装
  src/utils/dateUtils/... 日期时间转换

apps/demo/
  components.json
  src/styles/index.css    应用样式入口
  e2e/                    浏览器回归测试
```

公开入口：
- `@jl/framework`：维持现有 API，增加框架消息服务。
- `@jl/framework/ui`：供登录页、应用外壳使用 shadcn 基础组件。
- `@jl/framework/styles.css`：框架构建后的完整 CSS。

业务控件继续通过原路径和工厂使用，不要求业务页面直接组装 Radix 组件。

### 3.3 Monorepo alias 与样式交付

现有 `@/` 指向 framework 源码，并非 Demo 源码。不能照官网安装示例直接将它改成 `apps/demo/src`。

实施要求：
1. 保留现有框架别名；Demo 增加独立的 `@app/*` 别名，避免命名冲突。
2. framework、Demo 分别配置 `components.json`，统一 style、baseColor、iconLibrary；共享 UI 的安装目标指向 framework。
3. Vite 与 TypeScript 同步配置 `@jl/framework/ui`、`@jl/framework/styles.css`，精确子路径映射先于宽泛包名 alias。
4. Demo 使用 `@tailwindcss/vite`；应用 CSS 引入框架 CSS 源入口，通过显式 `@source` 同时扫描 Demo 与 framework，禁止扫描 dist、node_modules、历史文档。
5. framework 独立构建通过 Tailwind CLI 输出 `dist/styles.css`，只扫描框架源码；Vite 增加 UI 子入口并输出匹配的声明文件。
6. JS 入口不重复自动引入整份 Tailwind CSS。Demo 源码模式编译一次；外部消费者显式引入已编译 `styles.css`，不要求安装 Tailwind。
7. 框架剩余具名 CSS 统一纳入样式入口，避免组件零散 import 形成另一份未交付的 CSS 产物。
8. 对动态 `span`、表格高度、宽度使用 style/CSS variables，不拼接 Tailwind 动态类名。
9. React/ReactDOM 继续 external；新增运行依赖在框架显式声明并正确 external，禁止依赖 pnpm 偶然提升。保留 CSS sideEffects 声明。

### 3.4 主题与视觉约定

- 默认采用 shadcn 中性浅色主题和中文系统字体，不引入远程字体依赖。
- 颜色统一使用 background、foreground、primary、muted、border、ring、sidebar 等语义变量。
- 保留默认/紧凑两种密度的能力，改为框架自己的 density 配置；Demo 默认紧凑，避免原有六列表单突然变得过于稀疏。
- 清除 `.ant-*`、`.anticon`、`--ant-*` 依赖；表格焦点行改用 accent/selected 变量。
- 主题与密度应用到 document 根节点，确保 Portal 中的 Dialog、Select、Calendar、Toaster 一致。
- 本期不新增主题切换页面或暗色模式产品功能；预留标准 token 扩展方式。
- SimpleBar 不是 Ant Design，本次保留，验证其与新布局及浮层的兼容性。

## 四、组件替换与行为契约

| 当前组件/能力 | 替换实现 | 必须保留的行为 |
| --- | --- | --- |
| Button | shadcn Button | text、onClick；应用层 loading、disabled、图标、提交按钮 |
| Input、Text | Input、文本节点 | 对齐、只读展示、空值显示、已有防抖 |
| Select | shadcn Select | items、受控值、选项展示及原始值类型 |
| Switch | shadcn Switch | boolean 值与受控状态 |
| Radio | Radio Group | items、单值选择；实现已声明意图的再次点击取消 |
| Checkbox | Checkbox + Label | 单值 boolean、多值数组，两种分支严格区分 |
| Date/DateRange | Popover + Calendar + 可选时间输入 | format、showTime、disabled、placeholder、清空与回显 |
| Time/TimeRange | shadcn Input 组合的时间编辑器 | HH:mm:ss、showSecond、范围值、清空及输入校验 |
| Link | 具备链接样式的语义化 a 元素 | 静态/函数 href、label、新窗口打开 |
| Upload | 文件 input + Button + Progress + 文件列表 | action、accept、multiple、maxSize、maxCount、成功失败回调 |
| Row/Col、Space | CSS Grid/Flex | 24 栅格 span、间距和工具栏布局 |
| Table | Table + TanStack Table/Virtual | 虚拟滚动、列宽、行身份、焦点行、双模式和搜索 |
| Modal | Dialog | Handler 显隐、确定/取消、关闭后状态保持 |
| Drawer | Sheet | 四方向 placement、width、title、onClose |
| Tabs | Tabs | key、label、viewId、活动项状态与内容保留 |
| Layout/Menu | Sidebar + Collapsible + CSS 布局 | 菜单树、收折、路由导航和选中状态 |
| Dropdown/Avatar | Dropdown Menu/Avatar | 用户菜单、分隔项、退出与桌面关闭入口 |
| message | Sonner + notify | success/error 等提示，非 React 回调可调用 |
| Ant 图标 | lucide-react | 同等语义、按钮可访问名称 |

采用 Sheet 替换 Drawer，是因为当前需求是桌面侧栏且支持四方向；不引入以移动端拖拽抽屉为主的行为变化。

### 4.1 数据绑定与类型兼容

以下能力不能因更换 UI 被重写或绕过：
- `useData`、`useDataState` 与 300ms 防抖提交。
- `@Row`、`@Active`、`@key` 和冻结行身份的待提交任务。
- 请求前 flush、搜索重置取消、作用域取消、页面销毁清理。
- `VProps`、`Ctrl`、`items`、`field`、`path`、`dataId`、Handler 回调。

例如，现有业务配置保持有效：

```tsx
{
  id: 'form1',
  type: VType.Form,
  path: [DataBase.active(this.table1.id)],
  items: [
    { title: '价格', field: 'price', ctrl: { type: Ctrl.Input } },
  ],
}
```

适配细节：
- Select/Radio 的 UI 字符串 ID 映射回原始 OptionItem 值，区分数字 `1`、字符串 `'1'`、`false`、`0`、空字符串和 undefined，不能统一 `String(value)` 后写回。
- Checkbox 对 Radix 的 `indeterminate` 明确处理，不把它写成业务 boolean 值。
- 表单仍按 24 列计算 `span`，桌面默认 span=4；窄屏允许换行而不产生横向溢出。
- 移除 `ColumnType`、`MenuProps`、`UploadFile` 等第三方类型耦合，改成本地类型；不承诺兼容未暴露、未使用的 Ant 专有属性。
- 已声明但历史未生效的行为，记录为明确迁移差异；本次修正 Checkbox 单值和 Modal onOk，其他无关缺陷不夹带处理。

### 4.2 日期与时间契约

- store 中保持格式化字符串；范围保持两个字符串，不保存 Date、Day.js 实例或时间戳。
- 日期默认 format 保持 `YYYY-MM-DD`，时间保持 `HH:mm:ss`；显式 format 优先。
- `showTime` 控制时间编辑 UI，序列化仍严格遵循 format；演示带时间场景显式配置 `YYYY-MM-DD HH:mm:ss`。
- 清空单值使用空字符串，清空范围使用两个空字符串；读取兼容 undefined 和既有空值。
- 日历内部进行 Date 转换，采用本地日历语义，不通过 UTC ISO 转换导致日期偏移。
- 范围未选完时只保留 UI 中间态，不向共享数据写入无效 Date；支持取消和重新打开。
- `showSecond` 决定秒编辑区是否显示；非法日期、时间、倒序范围给出明确状态，不提交无效值。
- `defaultValue` 只作为未提供业务值时的初始化配置，不覆盖已有 store 数据或用户清空结果。

### 4.3 上传契约

- 使用 XMLHttpRequest + FormData 实现上传，保持字段名 `file` 和默认路径 `/api/upload`，继续支持自定义 action。
- 前端处理文件类型提示、大小 MB 限制、数量限制、进度、成功/失败、列表移除；accept 不作为服务端安全校验的替代。
- 定义框架文件对象，保留 uid、name、status、response、原始 File 等回调用途，不把 Ant 类型泄漏到公开 API。
- 移除上传中条目或卸载组件时取消对应请求；取消不重复触发成功/失败回调。
- 上传仍使用控件内部文件列表和原有回调，不擅自改成向 `path` 自动写入附件数据。
- 测试通过浏览器请求拦截/单元测试替身模拟服务端；真实服务器仍负责鉴权和文件校验，不扩展本次后端范围。

### 4.4 浮层和菜单契约

- Modal/Drawer 继续通过 `ParamKey.Open` 受控，确定、取消、遮罩、Escape 都走同一关闭流程。
- Modal 确定调用 `view.onOk`；没有回调时维持默认关闭行为，异常时保留窗口并反馈错误。
- 业务内容首次打开后保持状态；关闭时不能遗留遮罩、焦点锁、滚动锁或可 Tab 到的隐藏元素。
- Tabs 首次访问后保留内容状态，隐藏内容不可交互，避免切页造成上传列表或输入中间态丢失。
- 日期/选择框在 Dialog、Sheet、虚拟表格内部打开时，不被滚动容器裁剪，也不错误触发外层关闭。
- 菜单类型以现有接口实际返回的 `key/label/children` 为准；应用现有未匹配该协议的 MenuItem 定义同步修正，不修改后端菜单协议。
- 所有图标按钮提供 aria-label；Dialog/Sheet 提供可访问标题，纯图标装饰不作为业务测试定位方式。

## 五、虚拟表格专项设计

这是本次风险和工作量最高的部分，必须单独实现和验收。

### 5.1 保留公开行为

- 默认 Record 模式不变，Subscription 仍由 `renderMode` 显式选择。
- 保留 `items`、`searchItems`、`height`、`width`、`path`、`dataId`。
- 高度默认 400，兼容数字像素值和 CSS 字符串；使用容器测量得到虚拟滚动尺寸。
- 保留列标题、空状态、列宽、横向滚动和固定表头。
- 内部分页继续关闭；不得因采用官网示例而增加默认 10 行切片。
- 本次不新增 schema 尚未提供的排序、过滤菜单、展开行、多选、列拖拽等能力。

### 5.2 结构实现

1. 将 Ant 的列定义转换为 framework 内部列描述，再映射到 TanStack Table v9。
2. 继续复用 `useRowIdentityList`，Subscription 模式只向表格模型提供稳定行身份序列。
3. `BoundTableCell` 保持稳定身份 props 与内部字段订阅，不把整条 record 或新建配置对象逐层透传。
4. Virtual 负责可见行范围和 overscan；采用合法 table/tr/td 结构及占位行实现纵向虚拟化，避免沿用当前为 Ant 虚拟列表返回 div 的 TableRow 实现。
5. 使用共享列宽约束保证表头和表体对齐；长内容及编辑控件通过行高测量处理。
6. 行点击继续写入焦点参数，布尔 selector 仅通知旧、新焦点行；增加键盘可访问性。
7. 行增删、重排、整批同键替换后仍按身份寻址；虚拟窗口下标绝不能当作原始数据下标。
8. 键缺失、重复或非法时维持安全回退；没有可靠身份的行使用原始数据索引兜底，不构造歧义 @Row 路径。
9. 虚拟行离开可见区后，待提交任务仍按 PageRuntime 冻结身份处理；重新出现时读取最新提交值。

### 5.3 测试探针迁移

现有测试访问 `@rc-component/table/lib/Cell/useCellRender`，并查询 `.ant-table`。移除 Ant 后这些测试会直接失效，不能仅删除测试。

替换方式：
- 保留原有业务场景断言。
- 在框架拥有的表格结构层、行/单元格外壳、真实字段订阅层分别设置测试计数。
- 使用语义角色或稳定 `data-*` 查询 DOM。
- 分别统计 selector、结构执行、字段执行、DOM 更新，不把 wrapper 调用次数当成真实字段更新次数。

## 六、分阶段实施步骤

允许开发过程中短期共存两套组件，但只在全部迁移完成后整体交付；最终不存在运行时 Ant 回退开关。

### P0：冻结迁移基线，约 1 人日

1. 记录依赖、所有组件引用、主题变量、样式和相关测试清单。
2. 运行现有构建、lint、框架与桌面测试，区分原有失败与新增失败。
3. 记录登录、主布局、表单、表格、Modal、Drawer、Tabs 的截图与主要交互。
4. 为 13 类控件补充覆盖表；记录当前无法通过 mock 演示的场景。
5. 建立表格 100/1,000/10,000 行本地测试数据，不依赖只返回少量数据的现有接口。

交付：基线结果、兼容矩阵和已知差异列表。

### P1：接入 shadcn 与样式构建，约 2—3 人日

1. 添加受控版本的 shadcn CLI、Tailwind、Radix/Lucide 及生成组件依赖。
2. 配置两份 components.json、UI 目录、cn、alias、TS paths。
3. 引入 Button、Input、Label、Card、Select、Checkbox、RadioGroup、Switch、Dialog、Sheet、Tabs、DropdownMenu、Popover、Calendar、Table、Sidebar、Collapsible、Tooltip、Progress、Sonner 等实际所需组件。
4. 建立主题变量、默认/紧凑密度和中文文案。
5. 打通 Demo 源码 CSS 与 framework JS/dts/CSS 子入口构建。
6. 做一个内部虚拟表格原型，提前验证 TanStack v9 与行身份、Subscription 模式可组合。

交付门槛：基础组件可显示；跨包样式在开发和生产模式均生效；UI 产物入口可解析。

### P2：基础控件适配，约 2—3 人日

1. 替换 Button、Input、Text、Link。
2. 替换 Select、Switch、Radio、Checkbox，建立选项值编码映射。
3. 继续调用原有绑定 hooks，统一空值、受控状态与事件转换。
4. 修正 Checkbox 单值分支，增加布尔、数组、数字选项、空值测试。
5. 迁移对应 Less 与图标，不修改业务 schema。

交付门槛：现有表单和表格中的基础控件可用，300ms 提交与焦点切换行为保持。

### P3：表单、布局及浮层迁移，约 2—3 人日

1. 替换 Form、SearchPanel 的 Row/Col，保留 span、colNum 和间距语义。
2. 替换 Toolbar 的 Space；保持 Flex 布局和 CompFactory 分发。
3. 替换 Modal、Drawer、Tabs，接回 Handler 和 viewParams。
4. 补充焦点恢复、嵌套浮层、关闭后状态保持和滚动锁测试。
5. 将未被主流程使用的 SearchPanelSelect 也迁移，不因暂时未挂载而遗留 Ant 依赖；不扩展其未实现的业务功能。
6. 修正 Modal onOk 回调缺失，并记录该行为差异。

交付门槛：基础 Modal、Drawer、Tab 页面可交互，搜索/重置与请求路径不变。

### P4：虚拟表格正式迁移，约 4—6 人日

1. 重写 TableUtils 列装配和 TableShell。
2. 接入 TanStack Table/Virtual，完成表头、列宽、测量、滚动和空状态。
3. 重写 TableRow 的 DOM 与 ref；保留焦点订阅。
4. 接回 Record、Subscription、BoundTableCell 和降级路径。
5. 迁移表格测试探针，运行现有防抖、增删重排、配置切换等回归场景。
6. 用大数据测试可见节点数量、输入提交成本、滚动和焦点稳定性。

交付门槛：/base/table 联动正常；Subscription 普通字段编辑不触发表格结构与无关字段更新。

### P5：日期、时间与上传，约 3—4 人日

1. 完成日期格式解析、序列化和空值工具及单元测试。
2. 完成单日期、范围、日期带时间和时间范围控件。
3. 校验中文日历、禁用、清空、默认值、无效输入及跨焦点行切换。
4. 实现上传 transport、进度、校验、取消和文件列表。
5. 使用请求拦截补齐上传成功、失败、超限、取消测试。
6. 在已有表单演示配置中增加必要测试场景，不新建无关业务页面。

交付门槛：13 类控件全部有功能验证，数据格式与外部回调契约明确。

### P6：应用与桌面外壳迁移，约 2 人日

1. 登录页改为 Card/Input/Button + React Hook Form/Zod，保留用户名、密码校验及登录请求、loading、跳转。
2. MainLayout 改为新布局，Menu 改为 Sidebar/Collapsible，保持 key/label/children 协议；菜单选中与当前路由同步。
3. 迁移 Avatar、Dropdown、通知图标及所有消息调用。
4. 根节点移除 ConfigProvider，接入主题/密度与唯一 Toaster；网络初始化回调使用 notify。
5. WindowControls 换为 shadcn Button/Lucide，保留 Web 下不显示、Tauri 操作和 resize 订阅。
6. 保留 data-tauri-drag-region，确保按钮和浮层不被拖动区吞掉事件。

交付门槛：Web 与桌面前端均能登录、导航、反馈错误；桌面控制逻辑测试通过。

### P7：依赖清理与总验收，约 3—4 人日

1. 清除全部运行源码中的 Ant 导入、Ant 类型、图标、类名和变量引用。
2. 移除两个包的 Ant dependencies/peerDependencies/devDependencies 及 Vite external 条目，更新锁文件。
3. 删除已被替换且无引用的主题/Less 文件；在确认无 Less 使用后移除 Less 依赖。
4. 更新窗口按钮测试，不再断言 Ant 图标的 border/switcher aria-label。
5. 增加禁止重新导入 Ant 的静态检查，检查打包后 JS、声明文件和实际依赖树。
6. 使用独立消费者测试 fixture 从 framework dist 导入组件及 CSS，避免源码 alias 掩盖发布产物问题。
7. 更新 README、运行构建文档、组件用法；性能历史文档追加迁移后的说明，保留旧实验记录。历史 Ant 参考资料不属于运行依赖，不做无意义字符串清洗。
8. 执行全量测试、Web/Tauri 构建、浏览器回归与桌面手工检查。

交付门槛：满足下一节全部验收条件，最后再移除开发期间保留的旧实现。

## 七、测试与验收标准

### 7.1 功能测试

- 13 类控件：初始值、清空、受控更新、交互及声明属性。
- 登录：必填、长度限制、成功、业务失败、网络失败、loading 防重复提交。
- 菜单：多级展开、折叠、路由跳转、刷新后的选中项。
- 表单：span、工具栏、请求提交、直接路径和焦点行路径。
- 搜索：条件输入、按钮搜索、Enter、重置；中文输入法确认和浮层选项确认不能误触发搜索。
- 浮层：确定/取消、四方向抽屉、width、Escape、遮罩、焦点恢复、状态保持及嵌套控件。
- 上传：格式/大小/数量限制、进度、成功/失败回调仅触发一次、取消、卸载清理。

### 7.2 状态与表格回归

必须保留并通过现有测试覆盖的语义：
- 输入即时反馈，299ms 不提交、300ms 提交。
- 焦点切换不串草稿，旧任务仍写回原身份。
- 重排后定位正确，删除行后拒绝过期写入。
- 同值写入不产生无意义更新。
- 同键整批替换后字段显示新值。
- 列配置、数据路径动态变化正确生效。
- Record/Subscription 切换与坏键回退安全。
- 搜索重置后，旧待提交条件不会重新出现。
- 普通模式和 StrictMode 均通过。

性能验收：
- Subscription 中单字段提交不进入表格结构重建，无关字段不重新渲染。
- 10,000 行数据时 DOM 行数量受可见区与 overscan 限制，不全量挂载。
- 不因迁移新增表格分页、整表深比较或每格整行对象订阅。
- 同环境记录迁移前后的渲染提交耗时、滚动表现与打包体积；若关键指标明显退化，定位解决后再交付，不预先承诺固定提速比例。

### 7.3 自动化与平台验证

- 保留现有 Vitest + jsdom 和 Demo node:test。
- 新增浏览器 E2E 使用 Playwright，测试目录与现有 `tests/*.test.mjs` 分开，避免运行器互相收集。
- 浏览器验证覆盖开发构建与生产预览，检查跨包 Tailwind 样式、Portal、真实滚动和键盘操作。
- Tauri 验证：HashRouter、无边框拖动、最小化/最大化/还原/关闭、WebView 内浮层和样式资源。
- 不调整 Rust 业务代码、CSP 或 capabilities；如发现迁移必须改变权限，另行说明，不能直接扩大权限。

实施阶段执行的现有命令：

```powershell
pnpm --filter @jl/framework test
pnpm --filter web test
pnpm build
pnpm lint
pnpm --filter web build:desktop:frontend
pnpm build:desktop
```

新增 E2E 脚本后执行 `pnpm --filter web test:e2e`。框架构建需包含 CSS 产物步骤；Turborepo 缓存需覆盖新 CSS 与桌面输出，防止旧产物造成假通过。

### 7.4 最终完成定义

1. 应用与框架已使用的 Ant 能力全部替换，无残留生产依赖或隐藏回退实现。
2. 当前业务 schema、数据请求协议和核心 Handler API 继续可用，必要差异有记录。
3. 类型检查、构建和测试通过；原有独立失败需明确列出，不能宣称全部通过。
4. 发布产物中的 JS/dts 不引用 Ant，CSS 入口可独立使用。
5. Web 与 Tauri 的核心页面和交互均通过验证。
6. 表格局部更新与虚拟化机制没有回退。
7. 运行文档、组件用法与依赖说明已同步。

## 八、工作量与风险控制

初步估算为 **19—26 人日**，适用于熟悉现有框架的开发者，包含实现、自动化和联调；不是已验证的交付承诺。关键路径为样式构建、虚拟表格、日期时间和浮层生命周期。

主要风险及处理：
- **跨包样式漏生成**：P1 同时验证源码与产物，使用显式 @source 和独立消费者 fixture。
- **输入值转换破坏业务类型**：统一选择值编码、日期 codec，增加 false/0/空值测试。
- **表格迁移导致整表更新**：保留身份订阅结构，迁移探针，先做原型再替换正式实现。
- **关闭浮层丢状态或锁页面**：明确懒挂载/保留状态策略，并测试关闭后的 focus/scroll 清理。
- **组件示例与版本 API 不匹配**：固定生成工具及依赖版本，TanStack 按 v9 文档实现。
- **误将历史问题当迁移回归**：P0 保存基线，关联缺陷单独记录，不扩张为全仓重构。

建议按阶段形成独立、可回退的改动单元；提交代码、推送或发布不属于本轮规划操作。

## 九、官方依据

- [Vite 接入](https://ui.shadcn.com/docs/installation/vite)
- [Monorepo 配置](https://ui.shadcn.com/docs/monorepo)
- [components.json](https://ui.shadcn.com/docs/components-json)
- [主题与 CSS variables](https://ui.shadcn.com/docs/theming)
- [Radix Data Table](https://ui.shadcn.com/docs/components/radix/data-table)
- [Date Picker 组合方式](https://ui.shadcn.com/docs/components/date-picker)
- [Sheet 四方向侧栏](https://ui.shadcn.com/docs/components/radix/sheet)
- [Sonner 消息提示](https://ui.shadcn.com/docs/components/radix/sonner)

官方 Data Table 是基于 Table 和 TanStack 的构建指南，并非开箱即用的 Ant Table 等价物；日期选择同样需要组合 Calendar/Popover。计划中的专项适配和测试正是为补齐这些差异。