# FrontArk Studio

本地/局域网运行的**可视化代码编辑中台**：把目标工程的页面结构可视化出来，
在界面上直接改结构、改属性、改主题配色，**每一次修改都落到真实源码的对应位置**。

> 源码始终是唯一事实来源。Studio 不引入第二套配置库，所有写入都是「字符区间替换 + 原子写」。

详细设计见 [`docs/design/可视化代码编辑器中台开发计划.md`](../../docs/design/可视化代码编辑器中台开发计划.md)。

---

## 1. 它解决什么问题

当前工程的页面是**高度结构化的声明式代码**（`index.tsx` / `data.tsx` / `view.tsx` / `handler.ts` 四件套）：

```text
apps/demo/src/pages/base/table/
├── index.tsx    页面装配：<ViewRoot ViewClass={VType} DataClass={Data} HandlerClass={Handler} />
├── data.tsx     数据节点：id / url / keyAttr / params / dependsOn …
├── view.tsx     视图节点：VProps.Table / VProps.Form / VProps.LayoutFlex + getRootId()
└── handler.ts   处理器：命令式取数、请求、事件
```

结构清楚了，但**改一个字段仍要跨文件找人**：一个列标题在 `view.tsx:74`，
它绑的数据在 `data.tsx:11`，它触发的回调在 `handler.ts:32`，它的 `id` 还被
`layout.items` 和 `DataBase.active(...)` 引用着。

Studio 做的事：把这层结构**读出来、画出来、点着改**，并且保证**只改该改的那几个字节**。

---

## 2. 架构

```text
浏览器  packages/studio/web  (React 19 + Tailwind v4 + 自写 shadcn 风格原子组件)
   左：页面 + 语义结构树      中：渲染预览 / 结构画布      右：属性 / 结构 / 数据 / 主题 / 源码
        │ HTTP / SSE（Vite 代理 /api → 127.0.0.1:8788）
        ▼
Go 主服务  packages/studio/server  (127.0.0.1:8788)
   · 项目注册与路径边界校验（唯一写盘者）
   · 编辑计划审批 + 原子写 + .bak 备份 + 内容 sha 乐观锁
   · 编辑历史 / 撤销重做 / SSE 事件广播
   · 外部编辑器唤起（VS Code 及各种改造版）
        │ JSON-RPC 2.0 over stdio（NDJSON）
        ▼
Node sidecar  packages/studio/analyzer  (纯计算，不写盘)
   · TS Compiler API → 语义模型（节点树 + 源码锚点 + 可编辑性判定）
   · 编辑意图 → 最小字符区间替换（保留注释 / 引号 / 缩进 / CRLF / as const / satisfies）
   · 枚举与标签元数据、CSS token 读写、语义重命名与引用索引

预览宿主  packages/studio/preview  (Vite dev，127.0.0.1:7099)
   · 通过 /@fs/ 动态 import 目标页面的 index.tsx，用真实 ViewRoot 渲染
   · 元素探针：点表头 / 标签 / 按钮 → 反查语义节点 → 回传 Studio
```

**为什么是 Go + Node 两个进程**：TS/TSX 的 AST 生态只在 Node 侧成熟；
而进程管理、文件写入、路径安全、静态托管在 Go 侧更稳。分工后 sidecar
**只回字符区间、不碰磁盘** —— 它即使被打挂也弄不坏源码。

---

## 3. 启动

```powershell
# 一键起三个进程（各自一个窗口，关窗口即停）
packages\studio\start.ps1

# 或手动
go -C packages/studio/server run . -root .      # 8788：Go 服务
pnpm --filter @jl/studio-preview dev            # 7099：预览宿主
pnpm --filter @jl/studio-web dev                # 5174：中台前端
pnpm --filter mock-server dev                   # 3001：预览用的假数据（可选）
```

然后打开 <http://localhost:5174>。

首次使用：点顶栏「＋」→ 填目标工程路径（默认预填本仓库的 `apps/demo`）→「注册并打开」。

> `start.ps1` 刻意保持**纯 ASCII**：Windows PowerShell 5.1 会把无 BOM 的 UTF-8 当 GBK 解码，
> 非 ASCII 文本会乱码并导致脚本解析失败。要加中文请存成 **UTF-8 with BOM**。

---

## 4. 能做什么

### 4.1 结构可视化

- **语义结构树**（左栏）：页面 → 视图 / 数据 / 处理器 → 每一个属性与数组项，可搜索。
- **渲染预览**（中栏）：真实渲染目标页面（不是截图、不是自己拼 UI），数据来自工程自己的 `.env` 配置的接口。
- **结构画布**（中栏）：以「容器 + 子项」视角编辑，每行都有 增 / 删 / 上移 / 下移。
- **属性检查器**（右栏）：选中节点的**全部**属性。

### 4.2 点选联动 + 跳转源码

- 在预览里**点表头 / 表单标签 / 按钮**，右侧自动选中对应语义节点（探针按元素类型匹配：表头优先匹配列定义，标签优先匹配搜索项/表单项）。
- 任何节点都能「⌖ 定位」到源码行，或「↗」在外编辑器中打开（自动探测 `code` / `cursor` / `windsurf` / `trae` / `vscodium` / `codium` / `webstorm` …）。

### 4.3 属性编辑（覆盖到什么程度）

由 analyzer 的 `editability` 判定驱动，前端不做任何猜测：

| 形态 | 例子 | 能力 |
|---|---|---|
| 字符串 / 数字 / 布尔 | `title: '产品ID'`、`width: 120` | 输入框 / 开关，直接改 |
| 对象 / 数组字面量 | `items: [...]`、`pagination: {...}` | 逐项改，可增删、可排序 |
| 枚举成员引用 | `type: VType.Table`、`renderMode: RenderMode.Subscription` | 下拉选择（选项直接取自框架枚举源码的 `@name` JSDoc 中文名） |
| 成员引用 | `dataId: this.data.mainTable.id` | 下拉选择数据 / 视图成员 |
| 框架语义调用 | `path: [DataBase.active(this.table1.id)]` | 专用「焦点行绑定」选择器 |
| 处理器引用 | `onClick: this.handler.onPrintData` | 下拉选择 Handler 方法 |
| 模块常量引用 | `items: CATEGORY_OPTIONS` | 只读 + 跳转（多处引用，首版不动） |
| 箭头函数 / JSX / 模板串 / 对象展开 | `formatter: (v) => \`¥${v}\`` | **只读** + 源码定位 |
| 含对象展开的整个对象 | `...baseConfig` | 整个容器降级只读（无法确定覆盖顺序） |

> 拿不准的一律只读。宁可少改，不可改错 —— 这是硬约束。

### 4.4 系统层：主题配色

右栏「主题」列出框架 `theme.css` 与工程自定义 CSS 里的全部 `--token`：色块 + 原文输入 + 原生取色器。
草稿**即时推给预览**（不落盘），点保存才写文件 —— 一次只改一个 token 的值区间。

### 4.5 语义重命名

把 `table1` 改成 `gridTable` 时，会一并改写：成员声明、`id` 字面量、`this.table1` 引用、
`@Active:table1` 路径、`DataBase.active(...)` 参数、以及 handler 里的字符串常量
（`getSelectedKeys('table1')`）。**无法静态确认的引用会列进「未覆盖清单」**，绝不全局替换。

---

## 5. 安全保障

| 机制 | 说明 |
|---|---|
| 唯一写盘者 | sidecar 只返回字符区间；实际替换、备份、写盘都在 Go 侧 |
| 两阶段提交 | `edit/plan`（生成计划，不落盘）→ `edit/apply`（校验后写入）；前端拿不到任意写入范围 |
| 内容 sha 乐观锁 | 计划里记基线 sha，apply 时文件被外部改过就拒绝（HTTP 409），并提示刷新 |
| 无损写回 | 只替换目标区间，保留 BOM / CRLF / 缩进 / 引号 / 注释 / `as const` / `satisfies`；修改后先在内存重新 parse，语法不过则拒绝 |
| 自动备份 | 写入前复制 `<name>.bak`（已在 `.gitignore` 忽略） |
| 路径边界 | 只能操作已注册项目的允许根（工程根 + 框架包根 + 主题文件目录）；`EvalSymlinks` 后比对，拒绝 `..` / junction 逃逸 |
| 文件白名单 | 只允许 `ts/tsx/js/jsx/json/css`；`node_modules` / `dist` / `.git` 一律拒绝；>1MB 降级只读 |
| 不执行目标代码 | 分析全程静态；预览在独立进程加载，且**生产包里零痕迹**（不改造框架运行时） |
| 局域网 | 默认只绑 `127.0.0.1`；`-addr` 对外时**必须**同时给 `-token`，否则拒绝启动 |

---

## 6. HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务状态、sidecar 状态、已注册项目数 |
| GET | `/api/events` | SSE：`files-changed` / `projects-changed` |
| GET/POST | `/api/projects` | 列表 / 注册（body: `{rootPath, name?}`） |
| GET/PUT/DELETE | `/api/projects/{id}` | 读取 / 改配置 / 注销（**不动目标工程文件**） |
| POST | `/api/projects/{id}/probe` | 重新探测 |
| GET | `/api/projects/{id}/pages` | 页面候选 |
| GET | `/api/projects/{id}/pages/analyze?route=` | 语义模型 + 诊断 + 引用 + 文件 sha |
| GET | `/api/projects/{id}/refs` | 跨页面引用索引 |
| GET | `/api/projects/{id}/meta` | 枚举 + 中文标签 |
| GET | `/api/projects/{id}/theme` | 主题 token |
| GET | `/api/projects/{id}/history` | 编辑历史 |
| GET | `/api/projects/{id}/preview` | 预览宿主地址与就绪状态 |
| GET | `/api/source` | 读取源码文本（`?projectId=&file=`） |
| GET | `/api/templates` | 可插入项模板（「+ 添加」菜单来源） |
| POST | `/api/edit/plan` \| `/apply` \| `/undo` \| `/redo` | 编辑计划与历史 |
| GET | `/api/editors` | 探测本机可用编辑器 |
| POST | `/api/open` | 唤起编辑器并定位到行列 |

冒烟（可重复执行）：

```powershell
# 先确保服务在跑
packages\studio\server\smoke.ps1            # 只读检查
packages\studio\server\smoke.ps1 -Apply     # 附带「改一个字段 → 撤销还原」的落盘验证
```

分析器单独冒烟（不依赖 Go 服务，只在内存里生成编辑计划）：

```powershell
node packages\studio\analyzer\test\smoke.mjs [目标工程路径] [路由]
```

---

## 7. 命令行参数（Go 服务）

```
-addr    监听地址，默认 127.0.0.1:8788
-root    仓库根目录（含 packages/studio），默认自动向上查找
-config  配置目录，默认 %APPDATA%\frontark-studio（projects.json 与编辑历史）
-web     前端构建产物目录；给了就由本服务托管，不给则用 Vite dev server
-token   对外暴露时的访问 Token（-addr 非本机时必填）
```

---

## 8. 已知边界

- **只支持本仓库内、使用了 `@jl/framework` 的工程**。非框架工程会退化成
  「只读浏览 + 源码跳转 + iframe 预览」。
- **撤销/重做栈是会话级的**：重启服务后仍能看到历史列表，但不能跨会话撤销。
- **预览宿主是独立进程**，`start.ps1` 会一起拉起；单独跑 Go 服务时预览会显示「未启动」。
- 预览里的元素探针是**文本启发式匹配**（出于不改造框架运行时的取舍）：
  同名的表头/标签会按元素类型择优，但极端情况下仍可能选中同名节点，此时用左栏结构树定位。
- 编辑元数据由 analyzer 从**当前框架源码**即时提取（枚举 + JSDoc `@name`），
  不依赖 `packages/framework` 的构建产物（该包当前还没有 `dist`）。
