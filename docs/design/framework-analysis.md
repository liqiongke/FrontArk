# FrontArk 前端框架架构、数据流与优化分析报告

分析基线：当前工作区源码，Git 提交 `ad5760d`。本文是现状分析及优化建议，不代表相关修复已经实现。

## 1. 结论摘要

FrontArk 的核心方向是合理的：**以 schema 描述页面，采用 View/Data/Handler 分层，以页面级 Zustand store 承载状态，通过 Context 分发实例，通过 selector 驱动组件更新。** 对企业后台的表格、表单、弹窗及联动页面，这套设计有复用价值，不建议为了“现代化”而推倒重写。

目前最值得投入的不是替换 Context、Zustand 或类式页面，而是以下三个方面：

1. **先修复数据正确性和实例隔离。** 请求管理器是静态单例，防抖计时器跨 store 共享；焦点路径在缺失和列表重排时存在错误写入、错误读取风险。这些问题比渲染速度更紧急。
2. **统一框架契约。** `dataId`、`path`、请求参数、依赖声明，在不同模块中的解释不一致；部分示例能工作，不等于能力在一般业务场景下成立。
3. **在正确性基础上做可测量的性能优化。** 优先减少无效请求、订阅扫描、生产环境计时和不必要的组件依赖加载，再按压测结果决定是否拆分页面内 store 或规范化大表数据。

整体判断：框架已具备可用的页面开发骨架和若干有效优化，但多实例、并发请求、复杂列表变更和提交一致性仍需要加固。不能仅凭现有测试通过，就判定已经覆盖复杂企业应用场景。

### 1.1 证据等级与分析边界

- **运行复现**：使用当前源码，通过 esbuild 内存编译后执行最小 Node 探针；部分使用真实 Zustand/Immer store，部分使用明确标注的状态或网络桩。未调用业务接口，未修改框架实现。
- **源码确认**：从实际实现和调用链直接确认的契约、控制流或缺失能力。
- **待压测/界面回归**：具有源码依据的性能风险或交互边界，但本次没有浏览器 Profiler、真实网络瀑布或端到端交互数据。

本次检查包括框架核心、表格/表单/搜索链路、请求层、demo 集成及构建配置，不是全仓安全审计。构建体积是实测值；渲染耗时、吞吐和优化收益没有实测，不作数字承诺。

## 2. 框架设计及职责边界

### 2.1 当前分层

| 层次 | 当前实现 | 评价 |
| --- | --- | --- |
| 应用层 | demo 路由、布局、主题、网络初始化 | 应用职责总体独立于页面 schema |
| 页面声明层 | `ViewBase`、`DataBase`、业务 `HandlerBase` 子类 | 适合重复度高的后台页面 |
| 视图适配层 | `CompFactory`、`CtrlFactory`、Ant Design 适配组件 | schema 到 React 组件的统一出口 |
| 状态层 | 每个 `ViewRoot` 创建 Zustand + Immer store | 页面作用域合理，但请求运行时未跟随隔离 |
| 请求编排层 | `StoreReq` | 已有取消、并发网络去重、重试；依赖与生命周期不完整 |
| 传输层 | `NetUtils` + Axios | 统一鉴权、超时和拦截器 |
| 工程层 | pnpm workspace、Turborepo、Vite、Vitest | 已有构建和测试基础，门禁与发布验证仍可加强 |

这里的 `DataBase` 主要是数据节点和请求配置容器，并非完整的领域模型或响应式依赖引擎。`ViewBase` 持有 `handler` 与 `data`，业务规则主要在 Handler，输入值同步则通常由控件直接写 store。

依据：[ViewBase](file:///d:/workspace/web/packages/framework/src/comp/viewBase.ts)、[DataBase](file:///d:/workspace/web/packages/framework/src/data/dataBase.ts)、[HandlerBase](file:///d:/workspace/web/packages/framework/src/handler/handlerBase.ts)。

### 2.2 Store 的实际结构

```text
页面 store
├─ data        业务数据树
├─ req         数据节点声明、搜索条件，以及当前混入的响应元信息
├─ view        视图 schema；@Root 还保存 View 类实例
├─ viewParams  焦点 key、焦点路径、弹窗开关等
└─ handler     按需创建的视图 Handler 实例
```

优点是状态入口统一、页面数据集中、更新容易追踪。需要注意：`view`、`req`、`handler` 中混有实例、函数和配置，不能把整个 store 当作可序列化业务快照直接持久化或回放。

依据：[storeBase.ts](file:///d:/workspace/web/packages/framework/src/stores/store/storeBase.ts#L20-L85)、[store interface](file:///d:/workspace/web/packages/framework/src/stores/store/interface.ts#L82-L138)。

### 2.3 Context 不是当前的主要瓶颈

`ViewRoot` 通过 `useRef` 保存 store，并将稳定的 store 实例传给 Context；业务数据没有被整体作为 Context value 反复替换。组件通过 Zustand hook 的 selector 取值。

因此需要区分：

- **Context 广播**：不是这里每次业务更新的主要机制。
- **Zustand 通知和 selector 检查**：一次有效 store 更新会通知该 store 的订阅者。
- **React 重渲染**：selector 返回结果变化的组件才需要由该订阅触发更新；父组件更新仍可能带来额外渲染。

这是一种“按路径选择数据”的订阅方式，不是内部已经实现了路径索引、只通知相关字段的订阅引擎。Immer 的结构共享有助于保持未修改子树的引用，但不会自动消除所有 selector 执行。

依据：[ViewRoot](file:///d:/workspace/web/packages/framework/src/ViewRoot.tsx#L16-L44)、[useValue.ts](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useValue.ts#L15-L65)。

### 2.4 已经存在的优化，应保留

- `ViewTable` 已开启 `virtual`，列定义使用 `useMemo`。
- 行组件通过 `TableIdContext` 获取当前视图 ID，已不是硬编码 `table1`。
- 常见 selector 查询缺失时返回 `undefined`，避免反复创建空对象。
- 字面量路径有上限缓存，行 key 到索引有 WeakMap 缓存。
- Zustand DevTools 仅在开发环境启用。
- 已有分级 `logger`，支持 `VITE_LOG_LEVEL` 和运行时设置。
- 请求已支持 AbortController、相同参数的进行中网络请求去重，以及可配置重试。
- demo 路由配置采用异步导入。

因此，不应把“引入虚拟列表”“新增请求取消”“新增日志入口”直接作为当前的待办。真正需要的是完善它们的正确性、边界和验证。

## 3. 数据流转过程

### 3.1 页面初始化和首次请求

```text
路由加载页面
  → <ViewRoot ViewClass DataClass HandlerClass>
  → 创建页面 store
  → initStore
      → new HandlerClass，并绑定当前 store getter
      → StoreReq.init（当前是覆盖全局静态 getter）
      → new DataClass / new ViewClass
      → initView：收集视图 schema
      → initDataAndReq：收集数据请求声明
      → 写入 data / req / view
      → fetchAllReq：触发没有父依赖的节点
  → Context 分发 store
  → CompFactory 按 schema.type 渲染组件
```

当前请求启动发生在 `ViewRoot` 的 `useMemo → initStore` 调用内部，属于渲染阶段副作用，而不是提交后的 effect。

依据：[storeInit.ts](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeInit.ts#L15-L54)。

### 3.2 请求返回后的流转

```text
fetchData(dataId)
  → 依赖检查
  → buildRequestParams
  → 进行中请求去重 / 取消旧请求 / 重试
  → NetUtils.get → Axios → 后端
  → req.format（可选）
  → extractCoreData：拆出数据和响应元信息
  → initData：补充 @key 等处理
  → setData(dataId, data)
  → setData(['@Req', dataId, 'params'], meta)
  → 触发子请求
  → selector 检查结果变化 → React 更新
```

注意最后两个写入是两次 store 更新；响应元信息还覆盖了原本用于参数声明的 `req.params`，详见 F04。

### 3.3 表单输入与业务事件

普通输入框的路径：

```text
Input.onChange
  → useDataState 的本地 React state 立即更新
  → setDataDebounce 记录当前解析后的路径
  → 300ms 后写入 store
  → 表格文本、其他绑定组件读取新值
```

按钮等业务操作通常走 `schema.onClick → Handler → store / NetUtils`。不是每次输入都经过 Handler。

如果输入后立即查询、打印或提交，Handler 读取的是 store 中的旧值，除非已经完成防抖回写。当前没有提供提交前统一 flush 的契约。

### 3.4 表格焦点与联动表单

```text
点击 TableRow
  → 写 viewParams[tableViewId]['@Active'] = rowKey
  → 根据当前数组计算并保存 '@ActivePath' = ['table', index]
  → 表单 schema.path = ['@Active:tableViewId']
  → 字段路径解析为 ['table', index, field]
  → 读写焦点行字段
```

引用必须指向视图 ID，不是数据节点 ID。当前设计保存了“由 key 推导出的数组下标路径”，但列表变化时没有同步失效机制，是一致性问题的重要来源。

## 4. 需要优先处理的问题

优先级含义：**P0** 为存在跨页面串扰、错误记录读写或丢失更新，应优先修复；**P1** 为核心功能、生命周期和契约问题；**P2** 为后续性能、发布及可维护性改进。这里的 P0 不表示所有页面每次都会触发。

| 编号 | 优先级 | 问题 | 证据 |
| --- | --- | --- | --- |
| F01 | P0 | 请求运行时为全局静态状态，页面隔离失效 | 源码 + getter 覆盖复现 |
| F02 | P0 | 缺失焦点写到根节点；列表重排后读错行 | 真实 store 复现 |
| F03 | P0/P1 | 跨 store 防抖互相取消；提交有旧值窗口 | 真实 store 复现 + 调用链 |
| F04 | P1 | 搜索、数据绑定与请求参数契约不一致 | 源码 + 函数复现 |
| F05 | P1 | 依赖图构建和异步依赖检查不可靠 | 源码 + 状态替换桩复现 |
| F06 | P1 | 请求生命周期、错误状态及去重边界不完整 | 源码确认 |
| F07 | P1 | 表格用渲染下标定位原始数据，且永久关闭单元格重算 | 框架及已安装依赖源码；待界面回归 |
| F08 | P1 | 数据标准化丢失原始值并修改输入对象 | 函数复现 |
| F09 | P1/P2 | 全量重置性能统计破坏查询；生产读路径持续计时 | 函数复现 + 源码 |

### F01：请求运行时需要按页面实例隔离

依据：[StoreReq 静态成员](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeReq.ts#L24-L36)、[store 包装方法](file:///d:/workspace/web/packages/framework/src/stores/store/storeBase.ts#L72-L79)。

`StoreReq.zGet`、`zSet`、`inflight` 都是静态成员。每个页面初始化都会覆盖 getter，而每个 store 的 `getReqParams`、`refreshByViewId` 又共同调用这个单例。

可推导的触发场景：

1. 页面 A 发起请求。
2. 页面 B 初始化，覆盖 `StoreReq.zGet`。
3. A 请求完成后通过 `this.zGet().setData(...)` 回写，目标可能变成 B。

不需要同时显示两个页面才能触发：路由切换时，旧页面未结束的请求也存在此风险。另外，同名节点共享 `inflight`，不同页面可能互相去重或取消；当前去重身份也没有包含 URL。

运行探针先初始化请求状态 A，再初始化 B，保留的 A 查询入口返回 B 的值 `2`，确认了静态 getter 覆盖机制。该探针验证的是串扰机制，不是浏览器端完整网络复现。

**建议：** 保留现有 Zustand 和 schema，对每个页面创建独立 RequestRuntime，通过闭包或实例持有 getter、进行中任务和取消控制器。全局 Axios 客户端可以继续共享；“页面请求任务”不能因此共享。任务增加 generation/requestId 检查，回写前验证所属页面及任务是否仍有效。

### F02：焦点引用应采用安全失败，并跟随行身份

依据：[getRealPath](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeDataPath.ts#L43-L68)、[getActivePath](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeDataPath.ts#L146-L180)、[setViewParamByKey](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeView.ts#L90-L109)。

**问题一：缺失焦点被解释成合法根路径。**

`@Active:missing` 解析为 `[]`，再拼接字段 `price` 后变成 `['price']`。真实 store 执行：

```ts
store.getState().setData(['@Active:missing', 'price'], 9);
// 实际 data：{ price: 9 }
```

因此，未选中行、焦点失效或视图 ID 配错时，输入不是被阻止，而是可能污染数据根节点。单独读取缺失的 `@Active` 也会因为空路径语义退化为读取整个 data。

**问题二：重排后仍保留旧下标。**

探针初始化 `[a, b]`，选中 `b`，再替换列表为 `[b, a]`；读取 `@Active:t` 得到 `a`。这是明确的错误行读取；继续编辑也会写错行。

**建议：**

- 路径解析区分“合法根路径”和“引用未解析”，后者读取返回 `undefined`、写入拒绝，并在开发环境给出诊断。
- 用稳定 rowKey 表达行身份；读取时按当前列表版本定位，或列表变更时事务性地重算/清空焦点路径。
- 行已删除时清空选择，不能继续沿用旧 index。
- 补充未选中、刷新重排、删除焦点行、分页、跨视图引用等回归测试。
- 同步修正 `setViewParams(..., init=true)` 的赋值顺序：目前先算出的 `@ActivePath` 会被随后整体替换参数对象覆盖。

### F03：防抖必须同时解决实例隔离和提交一致性

依据：[debounceTimers](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeData.ts#L125-L153)、[useDataState](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useValue.ts#L7-L33)。

`debounceTimers` 是模块级 Map，key 只有路径字符串，没有 store 身份。真实 store 探针让 A、B 同时写 `name`，等待 350ms 后：

```text
A.data = {}
B.data = { name: 'B' }
```

A 的更新被 B 取消。并且 `PathUtils.toString` 使用 `join('.')`，带点字段名与多段路径也可能产生同一个计时器 key。

当前防抖还存在两个独立的一致性边界：

- 300ms 内本地控件值与 store 值不同；输入后立即提交/搜索会读取旧值。
- 定时器捕获的是当时的数组下标路径，等待期间列表重排可能把旧输入写到另一条记录。

源码注释要求同一路径不要混用防抖与直接订阅，但 table 示例的联动表单输入和表格文本已经形成该组合。仅靠使用约定不足以保证框架级一致性。

**建议优先方案：** 表单事实值同步写 store，仅对搜索请求、校验等昂贵副作用防抖；先压测再决定是否保留输入值防抖。若确需草稿模式，则提供显式 `commit/flush/cancel`，提交前 flush，切换绑定时按记录身份处理，卸载时明确取消或提交策略。计时器按页面实例隔离，并使用无歧义的路径编码。

### F04：搜索与请求参数链路存在多处断点

依据：[SearchPanelItem](file:///d:/workspace/web/packages/framework/src/comp/view/comp/searchPanel/SearchPanelItem.tsx#L9-L20)、[StoreReq 参数与视图解析](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeReq.ts#L41-L69)、[参数构建及回写](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeReq.ts#L133-L185)、[useReq](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useReq.ts)。

1. `SearchPanelItem` 接收 `viewId`，实际却固定写 `['@Req', 'table', 'criteria', field]`，多个数据节点不能正确复用搜索组件。
2. `getReqByViewId` 只识别 `view.path`，不回退 `dataId`；table 示例主要使用 `dataId`，刷新入口会找不到请求。最小函数探针返回 `undefined`。
3. `buildRequestParams` 在 `params` 不是数组时直接返回 `{}`，丢掉已有 `criteria`。探针输入 `criteria: { name: 'abc' }`，输出 `{}`。
4. `params` 存在时，又直接拿 `criteria` 对象追加字段，越过 Immer 写入边界。冻结对象探针抛出 `Cannot add property limit, object is not extensible`；不同模块严格模式下也可能表现为写入不生效。
5. 请求完成后把响应元信息写到 `req[id].params`，覆盖同一字段原先的 `DataParamType[]` 参数声明。后续刷新可能失去默认参数和依赖引用。
6. 搜索重置入口仍是 TODO，未执行字段重置。

另外，`ViewTable` 的整表数据只按 `dataId` 读取，而单元格路径优先使用 `path`；`ViewForm` 只消费 `path`。统一接口里的两个属性，实际优先级并不统一。

**建议：** 编译 schema 时统一生成 `dataPath` 和明确的 `requestId`，读取和刷新都消费规范化结果。请求定义、用户条件、最终参数快照和响应元信息分开存储；参数构建为纯函数，不能修改 store 内部对象。明确参数覆盖优先级，并补齐搜索及重置的端到端测试。

### F05：依赖能力需要从“递归调用”补齐为可验证的调度契约

依据：[依赖图初始化](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeData.ts#L27-L51)、[DataParamType](file:///d:/workspace/web/packages/framework/src/data/interface.ts#L23-L39)、[依赖检查](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeReq.ts#L95-L127)。

主要问题：

- 类型声明允许字符串、数字及路径数组，但依赖提取读取 `param.path.id`；合法声明 `path: ['a', 'id']` 不会产生父子依赖。运行探针确认 `parentIds/childIds` 没有生成。
- 初始化未统一填充 `parentIds`、`childIds`，若使用对象形态路径勉强触发构图，又可能对缺失数组调用 `includes/push`。
- 现有依赖测试使用 `as unknown as DataBase` 绕过类型，手动补齐数组，并使用类型本不接受的 `{ id }` 路径，不能证明业务合法声明可用。
- `checkDependencies` 在 `await` 前保存整个 state，之后仍读取旧 state。状态替换桩中，父数据已更新为 `{ p: 1 }`，检查结果仍为 `false`。
- 没有请求依赖环检测；兄弟子请求串行等待，失败还会中断后续子节点。
- 本地默认数据分支写入后不触发子请求；普通 `setData` 也不会自动传播依赖失效，所以目前并非完整的响应式依赖系统。

**建议：** 用显式 `dependsOn`，或从规范化后的数据路径构图；初始化时补齐默认值，检测重复 ID、缺失依赖和环。每次 `await` 后读取最新状态。以每节点任务状态驱动 DAG 调度，对可独立的节点限流并行，明确“缺失、成功为空、失败、被取消”的不同语义。不要仅用是否为 `undefined` 判断就绪。

### F06：补齐请求生命周期和错误边界

依据：[渲染阶段初始化](file:///d:/workspace/web/packages/framework/src/ViewRoot.tsx#L20-L32)、[请求启动](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeInit.ts#L51-L54)、[请求生命周期](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeReq.ts#L160-L269)、[网络拦截器](file:///d:/workspace/web/packages/framework/src/utils/netUtils/index.ts#L39-L73)。

已实现的取消/去重值得保留，但尚不足以构成完整生命周期：

- 请求在渲染阶段启动；没有页面卸载时统一 abort、计时器清理和失效回写保护。`useRef` 的初始化防重不等于具备提交/卸载生命周期。
- `fetchAllReq` 的 `forEach` 不收集或捕获 Promise；交互 `useReq.sendReq` 也丢弃返回值。最终请求失败可能成为未处理 Promise rejection。
- `getReqData` 不检查 `Result.code`，HTTP 成功但业务失败仍可能被当成成功格式化、写数据并触发子请求。
- 当前网络去重只共享 `sendWithLifecycle` 中的 Promise；多个外层 `getReqData` 仍会分别格式化、写 store、触发子请求，并非整条任务去重。
- 重试没有区分 401/403 等不可重试错误和临时错误；拦截器会在每次失败尝试时通知全局错误处理，可能重复提示。
- `req` 中缺少可订阅的 `status/error/updatedAt` 等明确运行状态，也没有完整的结果缓存和失效协议。

**建议：** 将 schema/store 的纯初始化与请求启动分开，在 effect 中启动可幂等任务，在 cleanup 中取消；重启应正确支持 StrictMode 的 effect 重放。让同节点同参数共享完整任务，所有回写受 requestId 保护。公开 `Promise` 返回值，统一错误收口，依据业务约定检查 `Result.code`，UI 错误通过页面 ErrorBoundary 限制影响范围。不要假定 ErrorBoundary 会捕获异步请求异常。

### F07：表格定位必须跟随记录身份，而非渲染 index

依据：[ViewTable](file:///d:/workspace/web/packages/framework/src/comp/view/table/viewTable.tsx#L15-L50)、[tableUtils](file:///d:/workspace/web/packages/framework/src/comp/view/table/utils/tableUtils.tsx#L16-L38)。

当前列渲染忽略 `record`，直接用回调的 `index` 生成 store 路径。同时表格未显式配置分页，已安装 Ant Design 的默认 pageSize 是 10，内部把 `pageData` 切片后交给表格。

这意味着第二页第一条记录的渲染 index 可能为 0，而 store 的第 0 条仍是第一页第一条；单元格读取和点击后的焦点定位可能指向不同记录。排序、过滤、树表也具有同类风险。

此外，`shouldCellUpdate: () => false` 在已安装 table 依赖中会阻止重新计算列 render 的结果。子控件自身订阅仍能更新值，但不能自动修复旧 render 结果中保存的路径或控件配置。记录位置或 schema 改变时，永久返回 false 不是安全的优化契约。

**建议：** 由 `record[KeyAttr]` 绑定行身份，并基于当前数据建立 rowKey 到实体/索引的映射；支持动态位置变化。明确客户端分页与服务端分页模式，让分页参数、总数及请求状态贯通。仅在记录身份、路径和列配置稳定且有回归测试时使用单元格跳过更新策略。

本项已核查框架与已安装 Ant Design/table 源码，但未执行浏览器翻页和排序回归；应以 25 条以上数据的交互测试作为验收。

### F08：数据标准化应是保值、无副作用的转换

依据：[NetDataUtils.initData](file:///d:/workspace/web/packages/framework/src/utils/netUtils/netDataUtils.ts#L62-L111)。

当前仅在数组和对象分支返回结果，数字、字符串、布尔值会落到隐式 `undefined`。运行结果：

```text
initData([1, 'x', false], {})
→ [undefined, undefined, undefined]
```

对象分支直接追加 `@key`；对冻结对象的探针报错。`req.defaultData` 在写入 Immer 管理的配置树后可能已经冻结，因此也存在默认数据初始化失败的边界。另外，对象分支没有遍历其嵌套字段，不能按注释理解为已经给所有嵌套记录补齐 key。

**建议：** 原始值原样返回；转换不修改传入对象；为需要列表身份的记录生成稳定且可校验的 key。不要无差别深拷贝大数据，应只复制需要变更的对象，并区分通用 JSON 数据与列表实体处理。重复或组合 key 冲突在开发环境报错。

### F09：性能监控不能改变业务正确性

依据：[PerfTrackUtils](file:///d:/workspace/web/packages/framework/src/utils/sysUtils/perfTrackerUtils.ts#L42-L79)、[resetStats](file:///d:/workspace/web/packages/framework/src/utils/sysUtils/perfTrackerUtils.ts#L140-L151)、[getData 包装](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeData.ts#L62-L73)。

`resetStats()` 不带参数时清空 Map，而已创建的包装函数仍假设统计对象存在。探针执行“包装函数 → 全量 reset → 再调用”得到：

```text
Cannot read properties of undefined (reading '调用次数')
```

因为 `getData` 也被包装，调用公开的全量 reset API 后，业务数据读取可能直接失败。table 示例传入 `'getData'` 的单项 reset 不触发该问题，但公开 API 的全量重置仍需修复。

此外，统计包装没有生产关闭开关，每次读路径都会计时两次并更新统计字段；日志级别关闭并不代表计时开销关闭。

**建议：** 全量重置只归零，或调用时惰性补建统计项；保持所有异常的原始抛出语义。生产默认直接返回原函数，诊断时按需开启或采样。计时成本及关闭后的收益需要 A/B 测量。

## 5. 性能分析与优化顺序

### 5.1 用成本模型定位，而不是笼统说“Context 慢”

一次有效更新的成本可粗略拆为：

```text
更新成本 ≈ Immer 修改/复制成本
        + 当前页面订阅数量 × selector 取值成本
        + 实际受影响 React 子树的渲染和提交成本
```

这只是分析模型，不是已测出的耗时公式。

- 表格字段修改会改变所属数组引用，因此订阅整数组的 `ViewTable` 也会更新；单元格独立订阅不能保证表格父层完全不执行。
- 虚拟化减少挂载行和 DOM，但不消除响应预处理、数组复制及列表管理成本；当前分页还会影响实际挂载规模。
- 每个 hook 可能订阅值和多个稳定 action，action selector 结果虽然不变，但对应订阅仍有检查成本。

**先做的低风险优化：** 请求数据和元信息一次事务提交；稳定 action 通过页面实例读取，避免只为获取 action 增加订阅；工厂仅订阅需要的类型字段；值订阅保持细粒度。不要在所有组件外无差别加 `memo`。

### 5.2 焦点切换的渲染可以进一步收窄

`TableRow` 当前订阅整个 `activeKey`。A 行切到 B 行时，每个已挂载行看到的 selector 结果都改变，都会由该订阅触发更新。

可以改为订阅 `activeKey === rowKey` 的布尔值，使该订阅通常只有原焦点行和新焦点行结果变化。父组件或其他 Context 引发的更新需另测，不能承诺页面总共只渲染两行。

依据：[tableRow.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/comp/basetable/tableRow.tsx#L16-L35)。

### 5.3 缓存已有，但成本和失效策略仍可优化

- 字面量路径缓存每次仍需 `JSON.stringify(path)`；数组路径含行号时，规模并非仅等于 schema 字段数量。
- 缓存达到 2000 项后整体清空，滚动大量不同单元格时可能反复重建。
- 行索引首次构建是 O(N)，命中才是 O(1)；数组因编辑生成新引用后需要重建。不能把它描述成任何时候都是 O(1)。

建议在 schema 初始化时预编译静态路径；对动态行采用稳定身份与有限缓存。先测序列化、索引重建和缓存命中率，再选择小型 LRU 或更细粒度索引；避免引入比原查询更昂贵的深比较缓存。

### 5.4 减少不必要的网络任务

- 修复完整任务去重、依赖并行调度与路由离开取消，通常比微调 JSX 更有价值。
- `fetchAllReq` 会启动所有根节点，与弹窗是否打开、Tab 是否激活无关；可增加 `eager/onVisible/manual` 等加载策略，并保留明确的刷新语义。
- `MainLayout` 的菜单请求依赖 `location.pathname`，每次路由变化都重新请求菜单。菜单可按会话/权限版本缓存，权限变更时失效，而不是随路由刷新。
- 缓存业务请求结果前先定义 key、TTL、强制刷新、权限隔离和失效规则；已有 inflight 去重不等于已有结果缓存。

依据：[MainLayout](file:///d:/workspace/web/apps/demo/src/layouts/main/MainLayout.tsx#L21-L39)。

### 5.5 包体积有明确改进空间

本次生产构建结果：

| 产物 | 构建输出大小 | gzip |
| --- | ---: | ---: |
| demo 主 `index` JS chunk | 873.27 kB | 290.43 kB |
| demo `handlerBase` 共享 JS chunk | 556.30 kB | 161.40 kB |
| 框架独立 ES 产物 | 71.06 kB | 22.20 kB |

demo 构建产生超过 500 kB 的 chunk 警告。chunk 名称不等于某个类自身的代码大小；其中包含共享依赖，不能把 556.30 kB 全部归因于 HandlerBase，也不能用库产物大小推算首屏传输量。

源码中值得验证和调整的边界：

1. `HandlerBase` 运行时导入 `CompFactory` 的 Handler 注册表，而 `CompFactory` 静态导入全部视图；`CtrlFactory` 又静态引用全部控件。建议把 Handler 注册表与 React 渲染工厂分离，按应用注册组件，重型控件按需加载。
2. demo 路由插件扫描 `src/pages` 下所有 ts/tsx，包括 `data.tsx`、`view.tsx`、`handler.ts`。应只匹配页面入口或明确排除辅助文件，避免这些文件进入路由生成范围；本次构建也产生了对应辅助模块的独立 chunk。
3. 库构建 external 仅列出了包根名称，没覆盖 `react/jsx-runtime` 等子路径。产物中已看到 JSX runtime 实现；建议按“包名及其子路径”匹配外部依赖，并核查其他依赖是否重复打包。
4. `manualChunks` 只改变分块，不自动减少总下载量；应结合实际入口依赖、缓存命中和网络瀑布评估，不能只抬高警告阈值。

依据：[HandlerBase 依赖](file:///d:/workspace/web/packages/framework/src/handler/handlerBase.ts#L1-L7)、[CompFactory](file:///d:/workspace/web/packages/framework/src/comp/compFactory.ts)、[CtrlFactory](file:///d:/workspace/web/packages/framework/src/comp/ctrlFactory.ts)、[demo Vite 配置](file:///d:/workspace/web/apps/demo/vite.config.ts)、[库构建配置](file:///d:/workspace/web/packages/framework/vite.config.ts)。

## 6. 架构演进建议

### 6.1 保持三段式，分离定义、状态和运行时资源

建议演进为以下职责结构，仍使用现有 Zustand：

```text
页面定义（schema）
├─ 规范化视图定义
├─ 请求定义、参数声明、依赖 DAG
└─ 字段路径与类型信息

页面 Zustand 状态
├─ 业务数据
├─ 搜索条件
├─ 视图交互状态
└─ 可订阅请求状态、错误和响应元信息

页面运行时（不作为可持久化状态）
├─ Handler 实例/注册表
├─ 请求任务、AbortController、generation
├─ 防抖/草稿控制器
└─ dispose、诊断和受控缓存
```

这不是新增平行状态库，也不要求拆除 `CompFactory`。它主要解决静态资源、响应式数据和有生命周期对象混装的问题。

### 6.2 类型安全聚焦在错误高发边界

当前开启 TypeScript strict，但 `any` 大量穿过 Data/Store/Handler/控件接口，视图 ID 与数据 ID 也只是普通字符串。

建议分阶段实施：

- 从 Data 声明推导 DataNodeId，避免每页手写联合类型；区分 ViewId 与 DataId。
- 对路径首段、字段值和 `getData/setData` 增加泛型关联；必要时先使用 typed accessor，避免一次引入过重的递归路径类型。
- 请求参数定义、请求状态及结果类型分离；`refreshByViewId`、`useReq` 公开 Promise，而不是把异步操作标成 void。
- `getView` 可能返回 `undefined`，接口需要真实表达；框架入口统一处理非法 schema。
- 明确废弃或实现 `DataProps.path`；当前注释描述的“引用数据路径、不发请求”没有在请求调度和数据读写中实现，不能继续保留误导性契约。

### 6.3 schema 初始化时做一次验证

推荐初始化阶段校验：重复 view/data ID、缺失数据节点、非法控件类型、无效根节点、引用环、请求依赖环、重复 rowKey 和无法解析的绑定。

当前未知视图类型会静默返回 null、未知控件会回退 Text；可以保留生产兜底，但开发环境应给出可定位的错误。重复数据 ID 的检查还读取了始终为空的初始数据容器，现有测试反而固定了“后声明覆盖”的行为，应重新明确契约。

### 6.4 验证真正的包消费，而不仅是源码 alias

demo 通过 alias 直接消费框架源码，因此成功构建 demo 并不能证明外部项目消费发布包正常。

建议增加独立消费冒烟验证：包 exports、声明文件、CSS 引入、peer 依赖、开发/生产环境配置及 tree-shaking。当前声明生成还包含 `*.test.d.ts`；应保留测试参与类型检查，但从发布声明产物中排除。

框架使用 `import.meta.env` 的地方，在“源码消费”和“先构建库再消费”两种模式下求值时机不同，也需要明确支持范围。

## 7. 已执行验证与测试缺口

### 7.1 本次执行结果

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @jl/framework test` | 2 个文件、30 项测试全部通过 |
| `pnpm --filter @jl/framework exec tsc --noEmit` | 通过 |
| `pnpm --filter web exec tsc -b --noEmit` | 通过 |
| `pnpm lint` | 通过；框架 107 条 warning、0 error，主要为 any 和 hook 依赖 |
| `pnpm --filter web build` | 通过；存在大 chunk 警告 |
| `pnpm --filter @jl/framework build` | 通过 |
| 源码最小运行探针 | 复现 F01～F05 的指定边界、F08、F09；F06/F07 以源码分析为主 |
| 浏览器性能与端到端交互 | 本次未执行 |

运行探针通过 esbuild 在内存中编译，没有新增测试脚本文件。冻结对象、旧快照等探针用于隔离验证机制，不等于完整浏览器环境；最初尝试 Vite SSR 装载时遇到 lodash CommonJS 命名导出兼容问题，随后改用内存打包。该装载问题没有被计为浏览器业务缺陷。

### 7.2 为什么现有测试通过，仍有这些问题

- 当前测试集中在 `storeData` 和 `storeDataPath`，没有请求生命周期、搜索、表格分页或 React 组件集成测试。
- 数据写入测试使用原地修改桩，没有真实 Immer 的新快照、冻结和订阅行为；它只模拟了部分写入语义。
- 依赖测试构造不符合公开路径类型的对象，并预先准备框架本应初始化的字段。
- 焦点测试验证“当前状态算出的路径”，没有验证列表重排之后继续使用旧路径。
- 根 scripts 和 Turbo tasks 没有统一 test/typecheck 任务，现有测试未进入完整的根级门禁编排。

不宜据此声称具体覆盖率百分比；本次未生成 coverage 报告。

### 7.3 建议补充的回归矩阵

| 场景 | 验收标准 |
| --- | --- |
| 两个 ViewRoot 使用相同 dataId/path | 请求、取消、条件和防抖互不影响 |
| A 请求未完成时切到 B | A 结果不写入 B；卸载任务被取消或失效 |
| 相同节点同参数并发刷新 | 网络请求一次、数据提交一次、子任务一轮 |
| 快速改变条件，旧请求晚返回 | 仅最新有效结果生效 |
| 合法路径依赖、菱形依赖、依赖环 | 有序调度、不重复执行、环在初始化时报错 |
| 未选中、删除焦点、刷新重排 | 无根节点误写，无错误记录读取/修改 |
| 输入后立即搜索/保存 | 操作使用最新输入值 |
| 两个不同数据节点的搜索和重置 | 条件和请求都归属正确节点 |
| 25 条以上数据翻页、重排、schema 更新 | 展示、点击和编辑始终指向同一条记录 |
| 冻结默认数据、原始值数组 | 不修改输入、不丢失合法值 |
| 全量 resetStats 后继续读数据 | 无异常，不影响业务行为 |
| StrictMode 挂载、清理、重启 | 无孤立任务，无失效回写 |

## 8. 分阶段落地顺序

### 阶段一：先建立正确性底线

处理 F01～F03：请求及防抖实例隔离、安全路径解析、稳定行身份、输入提交一致性。同步补真实 store 测试和路由切换测试。

完成标准：跨页面无串扰；缺失绑定不能写入根；列表重排后不会编辑错行；提交读取最新输入。

### 阶段二：统一数据与请求协议

处理 F04～F08，并修复 F09 的全量重置异常：统一绑定解析，拆分请求定义和运行状态，完善依赖 DAG、完整任务去重、错误处理与卸载清理；修复分页定位和数据标准化。

完成标准：搜索、重置、依赖请求及分页编辑都有可重复的集成测试；业务失败不覆盖成功数据；类型接口与实际返回行为一致。

### 阶段三：低风险性能优化

关闭生产默认计时、焦点布尔订阅、合并事务、减少 action-only 订阅、菜单缓存、按可见性加载、按需组件注册及发布包 external 修正。

完成标准：具有前后对照数据；正确性测试全部保持通过；不以增加复杂状态同步换取未经证实的收益。

### 阶段四：按数据规模决定是否进一步重构

在目标设备上，用 100/1000/10000 行、不同列数、多个联动表单和不同请求延迟建立性能基线：

- React render/commit 次数、单次编辑与焦点切换的 p50/p95 耗时。
- selector 执行次数、路径解析时间、索引重建频次和缓存命中率。
- 网络请求数、重复任务数、取消数、请求到可见数据的延迟。
- 初始及重复导航的传输量、解析执行时间、长任务。
- 反复进入/退出页面后的活跃订阅、计时器、请求及内存变化。

只有结果表明单 store 通知和数组更新已成为瓶颈，再考虑页面内部按数据域拆分、`entities + ids` 规范化或更强的字段订阅索引。仍优先复用 Zustand，避免同时维护两套状态事实源。

## 9. 最终建议

应保留 FrontArk 的核心资产：schema 驱动、View/Data/Handler 分层、组件工厂、稳定 Context 分发和 Zustand/Immer 更新模式。

当前演进重点应从“增加更多功能或缓存”转为“明确契约并证明正确”：先保证实例隔离、稳定记录身份、请求生命周期和数据读写一致性，再优化可观测到的成本。这样能够以较小的架构扰动，显著提高框架在复杂业务中的可靠性与可维护性。

## 10. 修复记录（2026-09-16）

按上文 F01～F09 完成全量修复，架构约束不变（仍 schema 驱动 + View/Data/Handler + 单一 Zustand store + 自研请求层）。回归测试 66 项全部通过，framework/demo 的 tsc、lint（0 errors）、双端构建全部通过。

| 问题 | 修复方式 | 关键文件 |
| --- | --- | --- |
| F01 请求静态单例串扰 | `StoreReq` 静态类重写为 `PageRuntime` 实例类，由 `createBaseStore` 闭包按页面实例化（构造注入 zGet/zSet）；`inflight` 登记、防抖计时器、disposed 均为实例成员；新增 `dispose`（flush 防抖 + abort 进行中请求）与 `startRequests`（幂等启动） | `stores/store/utils/pageRuntime.ts`（新增）、`storeBase.ts`、`storeInit.ts`（去 `StoreReq.init/fetchAllReq` 副作用），`storeReq.ts` 删除 |
| F02 焦点行重排错位/写根 | `@Active` 改为访问时按 activeKey 动态解析（`getArrayIndexByKey` 引用级 WeakMap 索引），不再依赖点击时下标缓存；`getRealPath` 返回 `undefined` 表示引用未解析，读写双方安全失败（读 undefined、写拒绝并告警）；新增 `@Row:<viewId>:<rowKey>` 行身份寻址（`ViewPathUtils.row`），表格单元格按行键值寻址；antd Table 关闭内部分页（`pagination={false}`，默认 pageSize=10 的切片是错位根因之一）；`shouldCellUpdate` 改为行引用比较 | `stores/store/utils/storeDataPath.ts`、`utils/viewPathUtils/index.ts`、`comp/view/table/viewTable.tsx`、`utils/tableUtils.tsx` |
| F03 跨 store 防抖互踩 | 防抖计时器移入 `PageRuntime` 实例（按 store 隔离），key 用 `JSON.stringify(解析后路径)`；`flushData(path?)` 手动提交，`dispose` 自动 flush，卸载不丢输入；`setDataDebounce` 对未解析引用拒绝调度 | `pageRuntime.ts`、`storeData.ts`（删静态防抖） |
| F04 搜索条件归属/重置 | `useReq`/`SearchPanelItem` 不再硬编码 `'table'`，经 `getReqNodeId(viewId)` 解析请求节点（view.path 字符串/数组首段，回退 dataId）；`resetReq` 实现为删除 criteria 指定字段后重新请求；`buildRequestParams` 深拷贝 criteria 不再修改 store 对象（冻结对象安全），取值契约统一为 criteria > param.value > param.path，修复无 params 时 criteria 被丢弃的问题 | `stores/store/hooks/useReq.ts`、`comp/view/comp/searchPanel/SearchPanelItem.tsx`、`pageRuntime.ts`、`interface.ts`（新增 `getReqNodeId` action） |
| F05 参数契约/依赖图 | 响应元信息改存 `reqMeta.responseParams`（新增 reqMeta 状态切片），不再覆盖请求参数声明；数据与 reqMeta 在单次 zSet 事务提交；依赖提取支持 params.path 三种形式（字符串/数组首段/{id} 对象）+ `dependsOn` 显式声明，合并去重；`parentIds/childIds/criteria` 框架兜底初始化；初始化期 DFS 环检测报错，运行期等待链 visited 兜底；`Result.code !== 200` 视为业务错误不写数据；fetchData resolve-only 不产生 unhandled rejection；子请求并行触发 | `stores/store/interface.ts`（ReqStatus/ReqMetaInfo/reqMeta）、`data/interface.ts`（删死声明 path、加 dependsOn）、`pageRuntime.ts`、`storeData.ts` |
| F06 请求生命周期 | 依赖检查取最新快照（修复旧快照误判）；依赖等待期间已由父请求扇出写入的数据直接复用（防重复请求）；修正 visited 语义——checkDependencies 先查数据再判环、triggerChildren 以空等待链开始，修复正常父子链被误判为循环的问题；无 url 节点提交默认数据后也触发子请求 | `pageRuntime.ts` |
| F07 渲染期副作用 | ViewRoot 重写：store 创建留 `useMemo`（纯），`init`/`startRequests` 移入 `useEffect`，cleanup `dispose`；setViewParams(init) 先写 values 再算 @ActivePath（修复覆盖）；setViewParamByKey 解析失败不写脏键 | `ViewRoot.tsx`、`stores/store/utils/storeView.ts` |
| F08 initData 丢值/改入参 | 基础类型与 null/undefined 原样返回（修复 `[1,'x',false] → [undefined×3]`）；对象浅拷贝注入 `@key` 不修改入参（冻结对象安全）；键值判断改 isUndefined/isNull（0/'' 合法）；viewTable 的 scroll 改 useMemo | `utils/netUtils/netDataUtils.ts`、`comp/view/table/viewTable.tsx` |
| F09 性能/包构建 | PerfTrackUtils 增加 `perfEnabled` 开关（默认 `import.meta.env.DEV`，关闭时零计时开销）与 `setPerfEnabled/isPerfEnabled`；`resetStats()` 全量改为逐项重置（修复清空后调用崩溃）；TableRow 改布尔 selector（焦点切换仅新旧焦点行重渲染）；vite external 用正则覆盖子路径（`react/jsx-runtime` 等不再被重复打包）；dts exclude 测试文件；demo 路由 exclude `data.*`/`view.*`/`handler.*` 声明文件 | `utils/sysUtils/perfTrackerUtils.ts`、`comp/view/table/comp/basetable/tableRow.tsx`、`packages/framework/vite.config.ts`、`apps/demo/vite.config.ts` |

新增/更新测试：`storeDataPath.test.ts`（@Active 动态解析、@Row、undefined 安全失败）、`storeData.test.ts`（依赖三形式、dependsOn、环检测、重复 id 保留首个、写入安全失败）、`pageRuntime.test.ts`（双 store 防抖隔离、dispose flush、reqMeta 事务、业务错误、依赖链、运行期环退出、焦点重排回归——真实 store 集成）、`netDataUtils.test.ts`（保值/不改入参/0 与空串键值）。

遗留说明：lint warnings 126 条（基线 107，新增均为测试与运行时的显式 `any`，与既有风格一致）；demo 构建存在 chunk 超 500 kB 提示（基线既有，属阶段四性能基线范畴）；`getReqData` 在并发复用场景可能二次提交相同数据（幂等无副作用，未列入修复）。

