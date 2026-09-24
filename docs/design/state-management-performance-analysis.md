# FrontArk 状态管理性能分析

> 分析对象：`packages/framework` 的 store 体系（zustand v5 + immer + 路径级订阅）及其在表格/表单组件中的消费链路。
> 证据等级标注：**[源码确认]** 直接来自实现与调用链；**[实验证实]** 来自 `table-cell-update-analysis.md` 的隔离实验；**[待压测]** 需浏览器大数据量验证。
> 关联文档：`framework-analysis.md`（架构综述）、`table-cell-update-analysis.md`（表格扩散隔离实验）。

## 1. 结论摘要

核心架构（Context 只分发稳定 store 实例、selector 路径级订阅、immer 结构共享、防抖 + 行身份提交）是健康的，不需要推倒重来。当前性能风险按优先级排列如下：

| 编号 | 等级 | 问题 | 状态 |
|------|------|------|------|
| H1 | 高 | 表格默认 `Record` 模式仍走"整数组订阅 → 表格外壳全量执行"的扩散路径，两阶段优化是 opt-in 的 | 已修复能力存在，默认未启用 |
| H2 | 中高 | zustand 通知是 O(订阅者数) 广播，无路径索引；每次 store 写入（含焦点点击、reqMeta 状态翻转）都全量重跑 selector | 架构固有税，可裁剪订阅数量 |
| M1 | 中 | 热路径重复的字符串/序列化开销：每次取数 `JSON.stringify(path)`、`decodeURIComponent`、lodash `get` | 可缓存可下推 |
| M2 | 中 | 请求提交整体替换数组引用 + `initData` 全表拷贝注入行键，刷新无 diff 增量 | 数据量敏感，待压测 |
| M3 | 中 | 批量落盘（`flushData`/dispose）逐任务多次 `setState`，每次都触发一轮广播 | 可单事务合并 |
| L1 | 低 | `useDataState` 每个输入控件 3 个订阅 + 提交后一次本地 draft 清理重渲染 | 影响限于输入框自身 |
| L2 | 低 | `@ActivePath` 派生参数仍在每次焦点点击时维护（O(n) 扫描 + 扩大写入面），但视图层已不消费 | 疑似死代码，可移除 |
| L3 | 低 | 生产环境 `setData` 调用点仍构造 devtools action 对象（含 `PathUtils.toString`） | 每次写入一个小分配 |

## 2. 架构现状：与性能相关的机制

### 2.1 订阅模型 [源码确认]

```
ViewRoot ──useMemo──▶ createBaseStore()（每页面一个 zustand+immer store，引用终身稳定）
    │
    └─ StoreContext（只分发 store 实例，不传递数据 → 无 Context 广播）
            │
   组件侧：useStore(selector) ── useSyncExternalStore 路径级订阅
```

- 数据写入统一走 `setData`/`setDataByFn`/`setDataDebounce` → immer recipe → 结构共享保证未修改子树引用不变。
- 组件按 selector 返回值的引用比较决定是否重渲染；框架已沉淀"selector 必须返回 store 内稳定引用或原始值"的契约（`storeBase.ts` 各方法 JSDoc），历史上的 `getReqParams` 返回新建 `{}` 导致整页死循环的坑已修复并在接口层固化（`IStoreActions` 返回类型带 `| undefined`）。

### 2.2 写入节流：防抖 + 行身份 [源码确认]

- 输入类控件走 `useDataState`：本地 draft 即时反馈，**键入期间零 store 写入**，300ms 后 `commitEdit` 一次性落盘——高频输入不会形成广播风暴，这是当前设计最大的性能优点。
- 防抖任务以 `captureBinding`（冻结数据源引用 + 行 key）登记，提交时 `resolveBinding` 重新定位，规避"缓存渲染下标错位"；计时器按 `PageRuntime` 实例隔离，页面间不互踩。

### 2.3 表格三阶段订阅（已实施的能力）[源码确认 + 实验证实]

1. `boundTableCell.tsx`：`React.memo` + 仅稳定身份 props（viewId/columnKey/rowKey），列配置与基础路径改为组件内部订阅；
2. `viewTable.tsx` 双模式分发：`RenderMode.Subscription` 下 `useRowIdentityList` 做结构订阅（dataSource 仅含行键，键序列不变时复用快照），字段值由单元格按 `@Row` 独立订阅；
3. 行焦点高亮为布尔 selector，焦点切换仅新旧焦点行提交。

隔离实验结论：启用后 84 格内容仅目标行 12 格参与提交、DOM 文本只变 1 处；但经典路径下 108 个 Cell 外壳全部执行。

### 2.4 已有的诊断工具

- `renderProbe.ts`：渲染探针 + `traceStoreWrites`（包装 setState 打印写入与调用栈）；
- `perfTrackerUtils.ts`：`readData` 被 `PerfTrackUtils('getData', ...)` 包装，dev 统计 selector 内取数调用次数，**生产开关关闭时零计时开销** [源码确认]。

## 3. 问题详述与建议

### H1 表格优化是 opt-in 的，默认路径仍是性能最差点 [源码确认]

`viewTable.tsx` 中 `RenderMode` 缺省为 `Record`：`RecordTable` 用 `useData(view.path ?? view.dataId)` 订阅**整个数组**，任何一条记录的任何字段变化都会：

- 数组与目标记录引用经 immer 变化 → `TableShell` props 变化 → 表格父级更新；
- `shouldCellUpdate: (r, p) => r !== p` 只能缓存单元格**内容**，阻止不了 antd `Cell` **外壳**执行（实验证实：108 个已挂载 Cell 外壳全部重执行，未修改行也拿到新的 `additionalProps`）；
- 目标行 `record` 引用变化使该行**所有列**重算，超出字段依赖范围。

目前仅 demo 的 `pages/base/table` 一个页面启用了 `Subscription`。这意味着**新页面默认落回坏路径，性能收益依赖每个业务开发者记得配置**。

建议（按侵入度递增）：

1. 短期：文档与代码模板强制引导——无本地排序/行选择依赖的表格一律声明 `renderMode: RenderMode.Subscription`；行键缺失回退逻辑已有（warn 一次 + 自动降级 Record），启用风险可控。
2. 中期：将默认值翻转为 `Subscription`，对确需完整 record 的表格（本地排序、展开行、rowSelection）显式声明 `Record`——回退机制保证键不可靠时行为不变，语义上是把"坏路径"变成显式逃生舱。
3. 依赖 `Record` 模式的行选择等能力落地时，参照两阶段订阅的思路做局部结构订阅，而非退回整数组订阅。

### H2 O(订阅者数) 广播：selector 执行量随"格子数 × 写入次数"线性放大 [源码确认，量级待压测]

zustand 的订阅通知没有路径索引：任何一次 `setState`，该 store 上**每个订阅者的 selector 都会被重跑一遍**（返回值不变则不重渲染，但执行本身不可省）。当前每个订阅点：

- 每个挂载单元格（Subscription 模式）：`BoundTableCell` 3 个配置订阅（items/viewPath/dataId）+ 控件内 1 个值订阅 ≈ **4 个 selector/格**；
- 每行 `TableRow` 1 个布尔 selector；每表单字段 `useDataState` 3 个 selector。

按虚拟滚动可见 15 行 × 12 列估算 ≈ 180 格 → **每次写入约 750 次 selector 执行**；写入源却很多：焦点点击（`setViewParamByKey`）、每个请求至少 2 次状态写（`writeReqMeta pending` + `commitResponse`）、每次防抖提交……且这些写入与表格数据**无关**，纯属"别人更新、全家陪跑"。

区分层级很重要（实验教训）：selector 执行 ≠ 渲染提交，不能把 `getData` 计数当渲染次数；但若把 H1 解决后，这一项将成为 Subscription 模式下剩余的主要成本。

建议：

1. **裁剪单元格配置订阅**：单元格真正每写必变的只有字段值；items/viewPath/dataId 在 schema 初始化后引用恒定，可在 `TableShell` 层解析一次、经 Context（已有 `TableIdContext` 可扩充）下发，`BoundTableCell` 从 4 selector 降到 1 个值 selector——订阅者 selector 量直接砍 3/4。
2. **reqMeta 与数据事务合并**：`pending` 状态单独一次 `setState` 对无消费者（当前 `reqMeta` 尚无组件订阅，grep 证实）也产生全量广播；同类"无人订阅但触发广播"的写入可考虑脏检查（immer 产出与原 state 引用相同则跳过快照替换）或低频状态下沉。
3. 若量级压测（见第 5 节）证明 selector 广播仍是瓶颈，再评估"按数据节点版本号订阅"（写入时顺带 bump `data.<nodeId>.__version`，单元格先订阅版本号原语、命中才取值）——用原语比较把 O(订阅者) 摊薄为 O(1) 判断，仍不需要引入新状态库（遵守既有 ADR：不换 zustand）。

### M1 热路径的重复字符串与序列化开销 [源码确认]

`resolvePath`（所有 `readData`/`bindingKey`/`captureBinding` 的必经入口）每次调用：

- `JSON.stringify(parts)` 作为 `literalPathCache` 的键；
- `@Row` 引用每次 `decodeURIComponent` + `try/catch`；
- 缓存上限 2000 时 `literalPathCache.clear()` **全量清空**——大页面（10k 行 × 多视图）缓存键集合超限时出现周期性全量 miss 尖刺。

单次开销是微秒级，但它乘在 H2 的执行次数上。建议：

- `BoundTableCell` 的 `cellPath`（`[row(viewId, key), field]` 数组）由 `useMemo` 稳定后，可附带一个本地解析缓存（`WeakMap<path数组, 解析结果>`），跳过 `JSON.stringify` 键；行键可在 `ViewPathUtils.row()` 构造时就完成解码，不必每次读取再解；
- 缓存淘汰从 `clear()` 改为按插入序淘汰（`Map` 本身有序，删前 N 个即可），消除尖刺。

### M2 请求提交全量替换数组引用，刷新无 diff [源码确认]

`commitResponse` 用 lodash `set(state.data, reqId, data)` 整体替换节点数据；`NetDataUtils.initData` 对响应**每条记录**做浅拷贝注入 `@key`（`{...item, [KeyAttr]: ...}`）。后果：

- 即便两次响应内容完全相同，所有记录引用都是新的：`Record` 模式下整表内容缓存全部失效（`shouldCellUpdate` 的 `record !== prevRecord` 对所有行为真）；
- Subscription 模式因单元格订阅的是**原始值**，值相同时不重渲染，能显著兜住——但 `useRowIdentityList` 仍要 O(n) 重提行键比对（数据量大时可见）；
- HMR/轮询刷新场景下，M2 是 H1/H2 成本的主要放大器。

建议：提交前按键值做浅合并（新旧记录同键且字段全等时复用旧引用），或对纯轮询节点引入 `format` 层的 diff 工具。属于增量优化，不改事务语义。

### M3 批量落盘逐任务多次 setState [源码确认]

`finishEdits`（`flushData`/`flushDataScope`/页面 `dispose` 时全量 flush）先把每个任务 `commitEdit → setData` **逐一**写入——N 个待写任务 = N 次广播 + N 次 immer finalize + N 次行键索引重建。`dispose` 场景影响小（即将卸载），但"表单多字段编辑后点查询按钮 `refreshByViewId → flushDataScope`"是常态路径：改了 3 个搜索条件就广播 3 次。

建议：`finishEdits` 合并为一次 `zSet`（recipe 内循环 `resolveBinding` + 赋值），失败任务（binding 解析不到）单独 warn。测试上有现成用例可扩：`pageRuntime.test.ts`。

### L1 useDataState 的订阅与 draft 清理 [源码确认]

每个输入控件 3 个 selector（value / identity / resetVersion），并在 `[identity, value, resetVersion]` 变化时 `setDraft(undefined)`。300ms 防抖提交后：store 值变化 → 控件因值 selector 重渲染一次（必要），随后 effect 清 draft 引起**第二次**本地重渲染（React 对同值 `setState` 通常 bail out，实测多为无害，但 draft 对象 `{identity, resetVersion, committed, value}` 每次键入新建，长文本连续输入时是可感知的分配）。可优化为把 draft 收进 `useRef` + 强制更新仅在需要回滚时触发；优先级低。

### L2 @ActivePath 派生写入疑似死代码 [源码确认 + 记忆佐证]

`setViewParamByKey`/`setViewParams` 在写 `@Active` 时顺带调 `getActivePath`（O(n) `getArrayIndexByKey` + 定位）写入 `@ActivePath`。但 2026-09-16 重构后，`@Active` 引用在**访问时**动态解析（`getRealPath`），ViewForm 渲染只消费 `view.path`——`@ActivePath` 已无消费者。它的成本是：每次焦点点击多一次数组扫描、同一次 `setState` 里多写一个键（放大 viewParams 订阅者中 `ParamKey.All` 的 selector 输出变化）。建议确认无外部依赖后删除维护逻辑，`ParamKey.ActivePath` 标记废弃。

### L3 生产环境的 devtools action 分配 [源码确认]

`devtools` 中间件本身已按 `import.meta.env.DEV` 关闭（近似透传，正确）；但调用点 `setData` 仍无条件构造 `{ type: 'setData', path: PathUtils.toString(rPath) }`——每次写入一个对象 + 一次路径字符串拼接。可在 `setData` 入口按 `import.meta.env.DEV` 短路。收益小，顺手改。

## 4. 已验证无问题的关键点（避免重复排查）

- **Context 用法**：只分发稳定 store 实例，无数据经由 Context 广播（framework-analysis.md 2.3 已论证，本次复核 `ViewRoot.tsx` 一致）。
- **无限重渲染类缺陷**：selector 引用稳定契约已在接口类型 + JSDoc 双层固化，`getReqParams`/`getView`/`getData` 查不到均返回 `undefined`。
- **行键索引缓存**：`activeIndexCache` 为 WeakMap（键=数组引用），immer 每次写入只重建**一次** O(n) 索引，同批多单元格解析共享命中，且随数组失自动回收，无泄漏。
- **`useRowIdentityList` 快照复用**：行键序列不变时复用整个 snapshot（非仅 rows），身份对象经 pool 复用保持引用稳定——实现正确。
- **请求治理**：inflight 按参数序列化去重、竞态 abort、失败线性退避重试，避免了重复请求引发的重复 store 广播。
- **StrictMode**：`startRequests` 幂等（inflight 去重兜底），`init` 有已初始化分支，无重复请求风暴。
- **`PerfTrackUtils`**：生产开关关闭时透传零开销；`stats` 打印走 logger 分级。
- **immer 同值写入**：`set(path, sameValue)` 不产生新引用，不触发通知。

## 5. 验证与度量方案

分层计量口径（实验教训，必须区分）：**selector 执行 → Cell 外壳执行 → 列 render → 内容提交 → DOM 文本**。

1. **压测用例**：新建合成数据页（300 行 × 20 列、1000 行 × 20 列），`createBaseStore` 真实 store，对比 Record / Subscription 两模式下：修改单字段时的 React Profiler 提交组件数、`perfTracker` 的 `getData` 调用次数与平均耗时、焦点点击与整节点刷新各测一轮。
2. **广播计数**：控制台 `traceStoreWrites(store)` + `setProbeEnabled(true)` 归因"谁触发"，把与本次写入无关的 selector 执行数打出来（验证 H2 裁剪效果：单元格 4→1 selector 应减少约 70% 执行量）。
3. **回归**：现有 7 测试文件（`storeDataImmer` / `useRowIdentityList` / `boundTableCell` / `pageRuntime` 等）为基线；H1 默认值翻转、M3 事务合并、L2 删除均需先补断言再改。

## 6. 实施顺序建议

1. H1（表格模式启用策略/默认值翻转）→ 2. H2-1（单元格配置订阅下沉到 TableShell Context）→ 3. M3（flush 单事务）+ L2（删 @ActivePath 维护，同批低风险改动）→ 4. 压测后决定 H2-3（版本号订阅）与 M2（响应 diff）→ 5. M1 / L1 / L3 择机清理。

其中 1、3 与既有测试覆盖直接相关，改动面小、可独立回归；2 是收益/风险比最高的一项结构性裁剪；4 依赖压测数据，不建议在无浏览器证据前实施。
