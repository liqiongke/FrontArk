# 提交 95259f1c 修改总结与优化分析

> 提交:`95259f1c5c48fd91d073ef8b0a30b43188645cac`(当前 HEAD → master)
> 作者:liqiongke ｜ 日期:2026-09-19 14:46 +0800
> 规模:44 个文件,+1309 / -499 行

## 一、提交概览

提交消息标题为"feat(documentation): 新增前端核心工具库渲染探针与日志系统说明",**但实际改动远不止文档**——文档部分(`.qoder/repowiki/`,wiki 自动生成)只是伴随更新,真正的主体是 **@store 数据层与表格模块的一次核心重构**,围绕三条主线:

1. **防抖写入从"缓存路径下标"改为"冻结行身份绑定(DataBinding)"**——修复列表重排/删行后待写任务写错行、写已删除记录的竞态;
2. **输入草稿(useDataState)重写**——render 阶段即校验草稿有效性,消除 300ms 双源不一致窗口,新增显式取消机制;
3. **统一读取入口**——所有 Hook/组件订阅改为"只读传入快照"(readView/readData),不再调用闭包绑定实时 `get()` 的 store action。

---

## 二、修改全景(按模块)

| 模块 | 文件 | 改动 |
|---|---|---|
| 数据路径解析 | [storeDataPath.ts](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeDataPath.ts) | 349 行大改,新增 Binding 体系与统一读取入口 |
| 页面运行时 | [pageRuntime.ts](file:///d:/workspace/web/packages/framework/src/stores/store/utils/pageRuntime.ts) | 防抖任务重写,新增范围提交/取消 |
| 读取 Hook | [useValue.ts](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useValue.ts) / [useReq.ts](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useReq.ts) / [useView.ts](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useView.ts) | 草稿机制重写、统一解析 |
| Store 定义 | [interface.ts](file:///d:/workspace/web/packages/framework/src/stores/store/interface.ts) / [storeBase.ts](file:///d:/workspace/web/packages/framework/src/stores/store/storeBase.ts) | 新增 `inputResetVersions` 与 3 个 action |
| 表格 | [viewTable.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/viewTable.tsx) / [useRowIdentityList.ts](file:///d:/workspace/web/packages/framework/src/comp/view/table/utils/useRowIdentityList.ts) / [boundTableCell.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/comp/basetable/boundTableCell.tsx) / [tableRow.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/comp/basetable/tableRow.tsx) | memo 隔离、快照复用修复、item.path 优先 |
| Handler | [handlerBase.ts](file:///d:/workspace/web/packages/framework/src/handler/handlerBase.ts) | 透传 5 个数据命令式接口 |
| 网络数据 | [netDataUtils.ts](file:///d:/workspace/web/packages/framework/src/utils/netUtils/netDataUtils.ts) | KeyAttr 数字键统一转字符串 |
| 小修 | [ctrlInput.tsx](file:///d:/workspace/web/packages/framework/src/comp/control/input/ctrlInput.tsx) / [SearchPanelTools.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/comp/searchPanel/SearchPanelTools.tsx) / demo [handler.ts](file:///d:/workspace/web/apps/demo/src/pages/base/table/handler.ts) | 受控 value 兜底、aria-label、演示显式提交 |
| 测试 | viewTable.test.tsx(新增 263 行)等 5 个测试文件 | 新增 9 个集成用例 + 多处更新 |
| 文档 | `.qoder/repowiki/` 下 15 个文件 | wiki 自动生成:渲染探针与日志系统说明 |

---

## 三、核心优化详解

### 1. 防抖写入:行身份绑定(DataBinding)取代路径下标缓存 ⭐

这是本次提交最重要的架构修正。

**旧行为**([pageRuntime.ts](file:///d:/workspace/web/packages/framework/src/stores/store/utils/pageRuntime.ts) 旧版):防抖任务入队时用 `getRealPath` 解析一次路径,**缓存解析后的数组下标**(如 `['table', 2, 'price']`)。若在 300ms 窗口内列表发生重排/删除,提交时仍按旧下标写入 → **写错行**;若目标行已被删除 → **写入悬空位置**。

**新行为**:
- 入队时 `captur段eBinding` 冻结"数据源 + 各层行身份":数组下标被替换为 `{ rowKey }`(取自记录的 `KeyAttr`),且要求该键在当前数组中真实存在,否则拒绝调度;
- 提交时 `resolveBinding` 按冻结的行身份**重新定位**下标——祖先列表重排也能写对行;目标记录已不存在则丢弃写入并告警;
- 注释明确设计意图:"入队时冻结行身份,提交时重新定位,不能缓存数组下标"、"祖先列表重排也不能让防抖任务串行"。

配套新增的 `bindingMatches(scope, exact)` 支持按**路径前缀**匹配待写任务,支撑下面的范围提交/取消能力。

### 2. 待写任务的范围提交与取消(新增 API)

store 新增三个 action(见 [interface.ts](file:///d:/workspace/web/packages/framework/src/stores/store/interface.ts#L159-L161)):

- `flushData(path?)` — 精确路径提交(保持原语义),不传则全部提交;
- `cancelData(path?)` — 精确路径取消;
- `flushDataScope(path)` / `cancelDataScope(path)` — **前缀范围**提交/取消所有匹配任务。

关键细节:
- 取消时对每个任务 key 递增 `inputResetVersions[key]`(store 新增字段),通知对应的输入草稿立即失效;
- 执行顺序为"先移除选中任务,再逐个提交"——防止提交触发的订阅回调又登记新任务被同一轮迭代消费。

### 3. 输入草稿重写:render 阶段即校验(useValue.ts)

**旧版 `useDataState`**:本地 `useState` 缓存 + `useEffect` 异步同步 store 值,存在"最长 300ms 双源不一致窗口",且回写可能覆盖他处并发写入;因此旧注释强制要求同一 path 不允许混用订阅方式。

**新版**:
- 草稿携带完整凭据 `{ identity, resetVersion, committed, value }`;
- `identity = bindingKey(..tauri.)`(冻结的行身份绑定),`resetVersion` 来自 `inputResetVersions`(外部取消即失效);
- 在 **render 阶段**直接校验:身份不符 / 版本不符 / 已提交值变化(`Object.is(draft.committed, value)`)任一不满足,立即回退显示提交值——注释强调"不能等 effect 才纠正已显示的值";
- 契约放宽为:"允许表格等只读组件订阅提交值;同一字段的写入由一个编辑者负责。切换身份、外部提交或取消时丢弃旧草稿"。

由此实现了"焦点行切换立即切换草稿、旧防抖任务仍写回原记录""搜索重置后草稿同步清空"等效果(有测试覆盖)。

### 4. 统一读取入口与快照一致性(storeDataPath.ts)

- 新增 `readData`(统一挂 `PerfTrackUtils('getData')` 统计,注释澄清"不代表 render 次数")、`readView`、`readReqNodeId`,全部**只使用传入快照**,不再调用绑定实时 `get()` 的 store action;
- [storeData.ts](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeData.ts) 的 `getData` 退化为 `readData` 的薄封装;
- 所有消费方统一迁移:`useData`/`useDataById`/`useDataStoreState`/`useReq`/`useView`、BoundTableCell、useRowIdentityList、TableRow(焦点行判断改为 `get(state.viewParams, [tableId, Active])` 直读);
- `resolvePath` 成为唯一解析契约:`@Active:`/`@Row:` 递归解析共用循环保护(visited 数组 + 32 层上限 + 自身重复检测);字面量路径保留 2000 上限缓存;
- `getArrayIndexByKey` 改为 `WeakMap<object, Map>` **引用级 O(1) 索引**,替代全量 `findIndex` 扫描;重复键直接记 `-1` 视为歧义(旧版靠兜底回扫重建索引)。

### 5. 搜索链路治理(useReq.ts + pageRuntime.ts)

- `refreshByViewId`(触发请求)前先 `flushDataScope([PathKey.Req, reqId, 'criteria'])` —— **点搜索前先把待写的搜索条件提交出去**,保证请求带上最新输入;
- 搜索重置改为:对每个条件字段 `cancelDataScope([PathKey.Req, reqId, 'criteria', item])`,**先取消待写任务再删除条件** —— 修复旧版"重置后 300ms 防抖任务复活、把已删除的条件写回去"的 bug;
- `reqId`/`params` 订阅改走 `readReqNodeId` 统一解析契约。

### 6. 表格渲染优化(viewTable.tsx + useRowIdentityList.ts)

- **TableShell 加 `memo`**:隔离"列定义/行组件/搜索面板装配"层,避免父级无关更新带动整个 antd Table 重渲染;
- `RecordTable` 取数从 `useDataById(view.dataId)` 改为 `useData(view.path ?? view.dataId)`,与单元格列取数约定对齐;
- `useRowIdentityList` 快照重构(151 行重写):
  - 类型改为判别联合 `{ fallback: false } | { fallback: true; rawData }`——正常模式**不再携带原始数组**,字段写入只更新内部缓存而不触碰 React 快照;
  - 关键修复:行键序列不变时**复用整个快照对象**(旧版只复用 `rows` 数组、外层快照仍是新对象),保证 `useSyncExternalStore` 快照引用真正稳定;
  - 身份对象池清理逻辑收敛为每次返回前统一重建。

### 7. 单元格取数优先级调整(boundTableCell.tsx)

`cellPath` 解析顺序改为:**显式 `item.path` 优先** → 未声明时才按 `field` + 行键/下标寻址。配合 `readView` 拆分订阅迁移。

### 8. Handler 能力补齐(handlerBase.ts)

业务 Handler 现在可直接调用 `flushData` / `flushDataScope` / `cancelData` / `cancelDataScope` / `setDataByFn`,语义约定写明:"需要最新输入的业务命令应显式提交,普通 getData 始终只读"。demo 的 `onPrintData` 即按此约定改为先 `flushDataScope(['@Active:table1'])` 再打印。

### 9. 数据规范化与小修

- [netDataUtils.ts](file:///d:/workspace/web/packages/framework/src/utils/netUtils/netDataUtils.ts):注入 `KeyAttr` 时数字键统一 `String()` 化(已有 key 和新生成 key 两条路径都处理),与 `@Row` 字符串键解析能力对齐,避免数字键让行身份失效;
- [ctrlInput.tsx](file:///d:/workspace/web/packages/framework/src/comp/control/input/ctrlInput.tsx):`value ?? ''`,修复受控 Input 收到 undefined 时的受控/非受控切换问题;
- [SearchPanelTools.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/comp/searchPanel/SearchPanelTools.tsx):两个圆形图标按钮补 `aria-label`(可访问性)。

---

## 四、测试保障

新增 [viewTable.test.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/viewTable.test.tsx)(263 行,9 个用例,主题"真实 Form + ViewTable 的防抖与结构隔离"):

1. 同值不同焦点行立即切换草稿,旧任务仍写回原记录
2. 取消同值提交前的草稿也能恢复输入,且不清空其他字段任务
3. 同值写入不触发 Table、结构订阅或字段控件
4. 列配置替换后使用新字段,不被旧内容缓存阻断
5. 未挂载的行字段在表格重新挂载时读取最新提交值
6. 同键整批替换不触发 Table,字段仍显示最新值
7. 增删重排触发结构更新,单元格仍按身份读取
8. 搜索重置取消待写条件,300ms 后不会复活
9. 草稿身份切换等基础行为

另更新:pageRuntime.test.ts(+109)、storeDataPath.test.ts(+57)、useRowIdentityList.test.tsx(+50)、boundTableCell.test.tsx(新增 29)、netDataUtils.test.ts(2)。

---

## 五、文档变更(.qoder/repowiki,自动生成)

- 核心工具函数库文档新增**渲染探针系统**说明(组件渲染追踪、React.memo 边界检测、Store 写入追踪、提交性能分析)与**统一日志系统**模块描述(日志级别配置及运行时调整);
- 新增 6 个知识页(处理体系/格式体系/配置系统/构建体系/依赖管理/日志系统:仅使用 console 与 stdout 输出),更新架构总览、性能考量等章节及 `_index.yaml` / `_module.yaml` / 元数据。

---

## 六、需要注意的点

1. **提交消息与实际内容不匹配**:消息只描述了文档更新,实际包含数据层核心重构,回溯排查时不能只信 commit message;
2. **行为变更影响面**:
   - 同一 path 混用订阅方式的历史限制放宽为"同字段单编辑者 + 只读组件可订阅提交值";
   - 防抖提交遇到目标记录已删除会**静默丢弃写入**(日志告警),业务方需知晓;
   - 未选中焦点行时防抖入队直接拒绝(旧版是解析失败拒绝,语义一致但更严格——要求行键真实存在);
   - 行键为数字的数据会被规范化为字符串,依赖数字键值的下游逻辑需留意;
3. `tsconfig.tsbuildinfo` 为构建缓存噪声,可忽略。
