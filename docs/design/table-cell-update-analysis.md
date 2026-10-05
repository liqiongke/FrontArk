# 表格焦点行编辑：更新范围分析与修改方案

分析日期：2026-09-16。源码基线：`ec0b55a`。分析入口：`apps/demo/src/pages/base/table/index.tsx`。

本文交付诊断结果与修改方案，**未修改框架或页面实现**。浏览器实验仅使用当前框架源码、内存中的合成数据与临时 React 根，未调用业务接口。

## 1. 结论

现象确实存在，但必须分层描述：

1. **Ant Design 单元格外壳会出现全体已挂载单元格更新。** 一轮隔离实验中，108 个已挂载 `Cell` 外壳全部执行了更新；未修改行的 `additionalProps` 引用也发生变化。
2. **字段控件内容目前是行级隔离，不是字段级隔离。** 另一轮实验中，修改一个价格，焦点行的 12 个字段控件子树全部参与提交，其他已挂载行的字段控件子树没有参与。
3. **实际 DOM 文本不等于组件执行次数。** 内容实验中只有价格对应的 1 处表格文本变化，不是所有文本都重新写入。
4. **Context 和 Immer 不是这里失效的环节。** Context 分发的是稳定 store；Immer 保持了所有未修改记录的对象引用。
5. **根因是两条更新链路叠加：字段 selector 更新 + 订阅完整数组的表格父级更新。** 后者进入 Ant Design 虚拟表格，再通过新 props 和行级 `shouldCellUpdate` 扩大更新范围。

建议分两阶段：

- 第一阶段：增加表格专用的 memo 化字段绑定组件，阻断同一行中无关字段控件的父级更新。
- 第二阶段：增加可选的“结构订阅模式”，让 Ant Design 只接收稳定的行身份列表，字段值仍由控件自行订阅，从源头避免普通字段修改触发表格外壳更新。

**只调整 `shouldCellUpdate`，或者只给 `CtrlText` 加 `memo`，都不能同时解决上述两层问题。** 无需重写 View/Data/Handler，也无需替换 Zustand 或引入并行状态库。

## 2. 页面与实际写入链路

### 2.1 index.tsx 只是装配入口

[index.tsx](file:///d:/workspace/web/apps/demo/src/pages/base/table/index.tsx#L1-L9) 只负责向 `ViewRoot` 提供 View、Data、Handler 三个类，没有本地表格状态，也没有编辑后整表替换的逻辑。

[view.tsx](file:///d:/workspace/web/apps/demo/src/pages/base/table/view.tsx#L6-L43) 的关系为：

- `table1.dataId = 'table'`，12 个展示字段，默认通过 `CtrlText` 展示。
- `form1.path = ['@Active:table1']`，价格、产品类别、品牌、库存四个字段默认使用 `CtrlInput`。
- 焦点行绑定指向视图 `table1`，不是数据节点 `table`，当前声明正确。
- `mainForm` 是另外的数据节点，不参与这四个字段的焦点行绑定。

### 2.2 从输入到 store

```text
顶部价格输入
  → CtrlInput / useDataState
  → 立即更新输入框本地 state
  → setDataDebounce(['@Active:table1', 'price'], value)
  → 解析并登记当前实际路径，300ms 后 setData
  → Immer 修改 data.table[rowIndex].price
  → data.table 数组变成新引用
  → 仅被修改记录变成新引用，其余记录保持引用
```

依据：

- [CtrlInput](file:///d:/workspace/web/packages/framework/src/comp/control/input/ctrlInput.tsx#L9-L21)
- [useDataState](file:///d:/workspace/web/packages/framework/src/stores/store/hooks/useValue.ts#L15-L32)
- [防抖写入](file:///d:/workspace/web/packages/framework/src/stores/store/utils/pageRuntime.ts#L117-L143)
- [setData](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeData.ts#L148-L170)
- [Zustand + Immer](file:///d:/workspace/web/packages/framework/src/stores/store/storeBase.ts#L20-L26)

这里没有克隆所有行。不能通过让数组引用保持不变来“修复”，那会破坏不可变状态和订阅一致性。

### 2.3 一次写入产生两条渲染路径

```text
store 更新
  ├─ 字段订阅：CtrlText → useData(['@Row:table1:行键', 'price'])
  │    → 只有该 selector 的结果改变才由订阅触发更新
  │
  └─ 容器订阅：ViewTable → useDataById('table')
       → 整个数组引用改变
       → ViewTable / Ant Design Table 更新
       → 虚拟行与单元格外壳参与更新
       → 被修改行的12列 shouldCellUpdate 全部为 true
       → 重新创建12个 CtrlFactory 节点
       → 该行所有字段控件跟随父级更新
```

**selector 的结果比较只控制“这条订阅是否触发更新”，不会自动拦住父组件带来的更新。**

## 3. 浏览器验证结果

### 3.1 实验范围与限制

真实业务路由 `/base/table` 被重定向到登录页，没有执行登录，也没有绕过鉴权。因此，下述数字不是登录后的完整页面端到端采样。

在本地 Vite 的公开开发页面中，直接加载当前框架源码，创建独立 React 根和 `createBaseStore()`，填入与该页相同的 12 列及焦点行表单配置，使用 30 条合成记录。未调用 `ViewRoot`、`init`、`startRequests`，未修改磁盘源码。

实验不加 `StrictMode`，等初始虚拟列表调整结束后再清空基线。实验后的函数包装、临时根和容器均已清理。生产模式耗时、真实页面主题及布局下的精确次数仍需后续回归。

### 3.2 实验 A：字段控件内容与 DOM

测量方式：临时包装列 `render` 计数，并在其返回的 `CtrlFactory` 节点外添加 React `Profiler`；另用 DOM 观察记录表格文本变化。

稳定时实际挂载 **7 行 × 12 列 = 84 格**，其余 23 条记录未挂载。

| 操作 | columns.render 调用 | 内容 Profiler 的 update 回调 | 其他已挂载行内容 update | 表格文本变化 |
| --- | ---: | ---: | ---: | ---: |
| `setData` 修改 r0.price：100 → 321.5 | 12 | 12 | 0 | 1 |
| 顶部输入：321.5 → `"456.75"`，等待防抖 | 12 | 12 | 0 | 1 |

两次均只涉及 r0 的全部 12 列，每列 render、Profiler update 各一次。12 个 update 回调属于**同一个 commit 批次**，不是 12 次独立 React 提交。

引用检查：数组和 r0 记录引用改变，其余 **29/29 条记录保持原引用**。

输入用例还确认：输入框先显示新值，store 稍后写入；当前通用文本输入写入字符串。该数据类型行为不是本次更新范围问题的原因。

Profiler 回调描述的是所包裹控件子树参与提交，不应当作其每一个内部函数的调用次数。

### 3.3 实验 B：Ant Design Cell 外壳

第二轮独立实验稳定后挂载 **9 行 × 12 列 = 108 格**。其布局与第一轮不同，不能把两轮挂载数或计数混为同一轮结果。

当前依赖的开发版 `Cell` 开头调用 `useRenderTimes`。通过测试根的最新 `root.current` 遍历对应 Fiber，读取其首个 ref 计数，比较修改 r0.price 前后：

| 指标 | 结果 |
| --- | --- |
| 计数增加的 Cell 外壳 | 108 / 108 |
| 每格计数 | 3 → 5，即 +2 |
| r0 外壳执行增量 | 12 × 2 = 24 |
| r1～r8 外壳执行增量 | 每行同样为 24 |
| 总函数执行增量 | 216 |
| 未修改行记录的 props 差异 | `additionalProps` |

这证明“所有已挂载单元格外壳执行”可以在当前代码下出现。`+2` 是该开发实验观测值，**不是每次业务编辑必须执行两次的框架契约，也不是 DOM 更新次数**。

此测量使用依赖的 DEV 私有实现。`keysRef` 仅保存最近一次非空 props 差异，不代表所有执行期间的完整差异集合，不能直接作为长期自动化测试 API。

### 3.4 现有测试基线

执行 `pnpm --filter @jl/framework test`：**4 个测试文件，66 项通过**。

但当前 [Vitest 配置](file:///d:/workspace/web/packages/framework/vitest.config.ts#L4-L12) 是 Node 环境，已有测试没有验证表格组件渲染次数；[storeData.test.ts](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeData.test.ts#L7-L35) 的更新桩也不使用真实 Immer，不能代替结构共享回归测试。

## 4. 根因与证据

### 4.1 表格容器订阅了整个数组

[ViewTable](file:///d:/workspace/web/packages/framework/src/comp/view/table/viewTable.tsx#L15-L25)：

```tsx
const [data] = useDataById(view.dataId);
```

随后直接把 `data` 传给 Ant Design 的 `dataSource`。任意行的任意字段改变，数组引用都会改变，表格父级更新不可避免。

`columns`、`components` 和 `scroll` 已有稳定引用措施，应保留。问题不是这些缓存完全缺失，而是 `dataSource` 自身就是宽粒度依赖。

### 4.2 shouldCellUpdate 目前只精确到行

[tableUtils.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/utils/tableUtils.tsx#L22-L31)：

```tsx
shouldCellUpdate: (record, prevRecord) => record !== prevRecord
```

修改价格后，该行的所有列看到的 `record` 都是新对象，因此 12 列全部返回 true。

该判断有效保护了其他记录的**列内容 render**，所以不能说现有优化完全无效；它只是没有达到字段级隔离。

### 4.3 shouldCellUpdate 不等于禁止 Cell 函数执行

本地安装版本为 `antd@6.0.0`、`@rc-component/table@1.8.2`，不是依据其他版本推测。

- [Ant Design Table](file:///d:/workspace/web/node_modules/antd/es/table/Table.js#L9-L16) 更新时增加 `_renderTimes`。
- [RcVirtualTable](file:///d:/workspace/web/node_modules/antd/es/table/RcTable/VirtualTable.js#L7-L15) 使用这个变化标记驱动内部更新。
- [BodyLine](file:///d:/workspace/web/node_modules/@rc-component/table/es/VirtualTable/BodyLine.js#L83-L106) 遍历列创建 `VirtualCell`。
- [VirtualCell](file:///d:/workspace/web/node_modules/@rc-component/table/es/VirtualTable/VirtualCell.js#L97-L117) 向 `Cell` 传入新建的 `additionalProps` 和样式对象。
- [Cell](file:///d:/workspace/web/node_modules/@rc-component/table/es/Cell/index.js#L28-L75) 在组件内部调用 `useCellRender`。
- [useCellRender](file:///d:/workspace/web/node_modules/@rc-component/table/es/Cell/useCellRender.js#L42-L58) 用 `shouldCellUpdate` 决定是否重算缓存的子节点。

因此，即使某格 `shouldCellUpdate` 返回 false，其 `Cell` 外壳仍可能因 props 或内部上下文变化执行，只是复用了之前的内容节点。该区别与两轮实验一致。

### 4.4 控件边界没有隔离父级更新

[tableUtils.tsx](file:///d:/workspace/web/packages/framework/src/comp/view/table/utils/tableUtils.tsx#L37-L51) 每次列 render 都重新生成：

- `cellPath` 数组；
- 未配置 ctrl 时的 `{ type: Ctrl.Text }` 对象；
- `CtrlFactory` 元素。

[CtrlFactory](file:///d:/workspace/web/packages/framework/src/comp/ctrlFactory.ts#L35-L44) 和 [CtrlText](file:///d:/workspace/web/packages/framework/src/comp/control/text/ctrlText.tsx#L8-L29) 当前都没有 memo 边界。

即使某个 `CtrlText` 的字段值没有改变，父级依然会带它执行。直接加默认浅比较的 `memo` 也不充分，因为新路径数组和默认 ctrl 对象仍会打破比较。

### 4.5 getData 调用次数不是组件渲染次数

[Zustand vanilla](file:///d:/workspace/web/node_modules/zustand/vanilla.js#L3-L12) 在有效更新后遍历全部 listeners；[React 适配](file:///d:/workspace/web/node_modules/zustand/react.js#L6-L14) 通过 `useSyncExternalStore` 读取 selector 快照。

因此，无关字段也可能重新执行 selector / `getData`，然后因结果相同而不触发组件更新。

页面的“获取 getData 使用情况”按钮记录的是取数函数调用，且 `@Row` 解析内部还会读取列表，存在嵌套调用；它不能用作“所有控件都渲染了”的计数器。

此外，[行索引缓存](file:///d:/workspace/web/packages/framework/src/stores/store/utils/storeDataPath.ts#L123-L165) 以数组引用为键。字段修改产生新数组后，需要对该新数组重新建索引：首次 O(N)，之后可复用。不能把整个编辑过程描述成完全 O(1)。

### 4.6 不属于根因的环节

- [ViewRoot](file:///d:/workspace/web/packages/framework/src/ViewRoot.tsx#L16-L18) 保持 store 实例稳定，没有每次输入通过 Context 广播整份新数据。
- [TableRow](file:///d:/workspace/web/packages/framework/src/comp/view/table/comp/basetable/tableRow.tsx#L16-L36) 已使用布尔焦点 selector；它解决焦点切换的订阅范围，不负责阻止表格父级重渲染。
- 真实入口有 `StrictMode`，它可能放大开发环境计数，但本次不加 StrictMode 的隔离实验仍然复现，因此不是根本原因。
- demo 的 Vite alias 直接指向框架源码，此问题不需要靠重建 framework 的 dist 才能修复。

## 5. 修改方案

### 5.1 第一阶段：隔离字段控件内容，保留现有表格行为

目标：修改一个价格时，只有价格等**实际声明了相关依赖**的字段控件更新。Ant Design 外壳仍允许执行，本阶段不承诺消除它。

推荐在表格模块内部增加 `BoundTableCell`，由列 render 返回它，不扩大为所有控件的全局行为变更。

组件契约：

1. 使用 `React.memo`，props 只传稳定身份：`viewId`、`columnKey`、`rowKey`；无行键的现有兼容分支才传 `fallbackIndex`。
2. 不传整条 `record`，不把每次新建的 `path`、默认 ctrl 对象作为 memo 的输入。
3. `columnKey` 第一阶段沿用现有 `field + '_' + index` 规则。组件按该键从当前视图列配置选取对应项；selector 返回 store 内已有对象或 undefined。
4. 组件内部独立订阅所需列配置、基础 `path` 和 `dataId`，不要为方便而订阅整份 data 或整个 view。这样列 ctrl、字段绑定发生变化时，即使 rc-table 复用旧内容元素，也能正确刷新。
5. 在组件内部用 `useMemo` 构造路径，保留 `@Row` 身份寻址；缺键分支保留现有 `PathUtils.itemPath` 行为。不要把虚拟渲染下标引入有行键的主路径。
6. 默认 Text 配置使用模块级常量，或交给 `CtrlFactory` 现有默认逻辑处理。
7. `CtrlText` 等原有控件继续通过 `useData` / 对应输入 hook 订阅实际值。memo 不会阻止其内部订阅驱动的更新。
8. 第一阶段保留现有行级 `shouldCellUpdate`，优先保持第三方表格兼容性。

结构示意，非直接可粘贴补丁：

```text
columns.render(record)
  → <BoundTableCell viewId columnKey rowKey />   // props 身份稳定
      → 订阅本列配置，内部构造稳定字段路径
      → <CtrlFactory ... />
          → CtrlText / CtrlInput 自行订阅字段值
```

预期收益：当前“被修改行 12 个内容子树参与提交”收敛为“该字段及真实关联控件参与提交”。列 render 回调可能仍有 12 次，表格外壳仍可能全体执行；必须按层验收，不能把它宣称为整表零更新。

修改范围：

| 文件 | 计划变化 |
| --- | --- |
| `packages/framework/src/comp/view/table/utils/tableUtils.tsx` | 列 render 返回身份绑定组件，传递 columnKey，不再直接构造控件 props |
| `packages/framework/src/comp/view/table/comp/basetable/boundTableCell.tsx`（拟新增） | memo 边界、局部配置订阅、稳定路径与 CtrlFactory 装配 |
| 表格组件测试（拟新增） | 真实组件子树的执行计数、绑定与配置变更回归 |

`index.tsx`、业务 View/Data/Handler、全局 store 结构不需要为第一阶段调整。

#### 为什么不直接改成字段值比较

对于本页简单 Text，比较新旧 `record[item.field]` 能减少同一行的内容 render，适合验证思路。但不宜直接作为全框架规则：

- `shouldCellUpdate` 不能阻止外壳执行。
- 同值但身份不同的行必须重新绑定，不能只比较值。
- 控件可能订阅多个字段，或者有自定义路径、选项、校验、显示依赖。
- 当前 rc-table 在有 `shouldCellUpdate` 时优先使用该判断，单纯比较值可能忽略 render 闭包与 schema 变化，使旧控件配置被缓存。

字段控件已经拥有订阅机制，增加稳定身份边界更符合当前架构。跨字段计算需在控件中显式订阅真实依赖，不能依赖父级偶然重渲染“顺便刷新”。

### 5.2 第二阶段：分离表格结构与字段值，减少外壳更新

目标：普通字段编辑不进入 Ant Design 表格的父级数据更新链路。

增加明确的可选模式，例如 `renderMode: 'record' | 'subscription'`，默认保持 `record` 兼容模式；本页完成回归后显式启用 `subscription`。这是未来方案，当前接口尚不存在该属性。

`subscription` 模式的职责：

```text
表格结构组件：订阅有序 rowKeys + 必要结构配置
  → Ant Design dataSource = 稳定的行身份描述对象

字段控件：按 @Row:<viewId>:<rowKey> + field 订阅真实 store 数据
  → 字段改变只触发实际依赖该值的控件
```

实现要求：

1. 从当前表格基础路径取得真实数组，提取有序行键序列，使用 Zustand `useShallow` 或等价的稳定快照机制；禁止 selector 每次裸返回新数组。
2. 对输入数组引用未变化的读取复用提取结果；数组变化但行键序列相同，返回上次序列引用。不在全局跨页面共享可变缓存。
3. 按行键缓存稳定的 `{ [KeyAttr]: rowKey }` 描述对象，并在行键序列不变时保持整个 `dataSource` 引用不变；删除记录时清理不再需要的描述对象。
4. 结构组件不再同时保留 `useDataById` 的全数组订阅，否则仍会把值更新传播给 Table。
5. 字段取值继续读取真正的数据数组，不能从身份描述对象读取 price 等业务值，也不能把旧 record 保存为“稳定快照”造成陈旧读取。
6. 有序行键变更时才因数据结构触发表格更新：新增、删除、重排、换页、替换为不同键的集合。同键新记录的字段值由控件订阅接收。
7. 表头、列宽、布局、主题等依然是合法结构依赖，需要允许正常更新。
8. 空数据使用稳定空数组；仅绑定 `path` 或仅绑定 `dataId` 的取数口径保持一致。优先级采用 `view.path ?? view.dataId`，避免容器与 `@Row` 读取不同数据源。
9. 缺失、重复或身份类型不受当前路径解析支持的 rowKey 不启用该模式，应诊断并回退 `record` 模式。不得静默以不稳定下标冒充身份。

兼容边界：

- 当前页没有声明本地排序、过滤、树形展开或合并单元格，适合作为首个使用者；搜索通过请求更新列表。
- 不向 Ant Design 的本地 sorter/filter、rowSpan、expandedRowRender、rowSelection record 回调直接提供只有 key 的假 record。凡依赖完整 record 的行为，先保持 `record` 模式。
- 未来要支持这些能力，应把它们依赖的数据纳入结构派生，或提供读取最新真实 record 的明确适配层；不能假定它们自动兼容。
- 补充（行勾选已落地）：表格的 `selection` 按**行键**记账，选中态写在视图参数 `@Select` 上、不读 record，因此 `Subscription` 模式同样可用；handler 侧用 `getSelectedKeys / getSelectedRows` 读取（后者按需从数据快照里按键捞行，不新增订阅）。因此「行选择」不再是必须退回 `record` 模式的能力。

增加的修改点：`viewTable.tsx`、表格 `interface.ts`、一个表格局部的结构订阅 hook，以及 demo 的 `table1` 模式声明。继续复用第一阶段的身份绑定单元格，不改变业务数据存储形状。

预期：普通字段修改时，表格结构组件、Table、Cell 外壳不再被**这次数据写入**带动；字段控件仍正常更新。不能承诺主题切换、虚拟滚动、测量和布局变化下外壳也永远不执行。

### 5.3 第三阶段：按实测决定是否优化通知与查找成本

第一、二阶段解决的是 React 渲染传播，不等于全部 selector 都不执行。

设 N 为数据行数、V 为已挂载行数、C 为列数、S 为页面全部订阅数：

- 当前有效写入仍有约 O(S) 的订阅通知检查。
- `@Row` 索引在新数组上首次构建有 O(N) 成本。
- 第二阶段的行键序列派生在源数组改变时也有 O(N) 比较成本。
- 虚拟化降低 V，不会把这些所有成本变成 O(1)。

只有大数据量下这些成本经测量成为瓶颈，再评估维护独立结构版本、规范化 `rowKeys + rowsByKey`，或路径索引通知机制。这些改动会影响写入 API、请求提交、引用解析与一致性，应另立专项，不作为本次性能修复的前置条件。

## 6. 验证与验收方案

### 6.1 分层计数

分别记录以下指标，不再用同一个“更新次数”指代所有事情：

1. store 通知、selector / getData 调用次数。
2. `ViewTable` / 结构组件执行次数。
3. Ant Design 行与 Cell 外壳执行情况。
4. columns.render 调用次数。
5. BoundTableCell、CtrlFactory、CtrlText / 输入控件实际函数执行次数。
6. React Profiler commit 批次及耗时。
7. 真实 DOM 文本变化。

稳定的自动化用例应在字段组件内部用测试探针计数，避免把包在 memo 组件外层的 Profiler update 直接等同于 memo 内部函数执行。第三方 Cell 私有 ref 仅用于本次诊断，长期测试优先使用公开 Profiler 与自有结构组件探针。

### 6.2 回归矩阵

| 场景 | 第一阶段验收 | 第二阶段额外验收 |
| --- | --- | --- |
| 修改焦点行 price | 仅 price 及真实依赖控件执行；同一行其他字段控件不执行 | 表格结构不因值写入执行，外壳无该写入导致的更新 |
| 修改未挂载行字段 | 当前可见无关字段控件不执行 | 行键序列不变，结构不更新 |
| 写入完全相同值 | 使用真实 store 验证无无效业务更新 | 行身份与结构引用保持稳定 |
| 切换焦点行 | 表单更新；高亮只影响相关行；表格字段值不变 | 不重建身份列表 |
| 行重排、插入、删除 | 按 rowKey 读取，不能串行 | 有序 rowKeys 正确变化并更新结构 |
| 同键整批数据替换 | 控件显示最新字段值 | 结构可复用，但字段不可陈旧 |
| 无焦点或焦点行被删 | 安全读取，拒绝错误写入 | 不出现幽灵记录或错误索引 |
| 虚拟滚动后重新挂载 | 显示最新 store 值 | 描述对象与真实行身份匹配 |
| 列 ctrl、field、绑定路径变化 | 缓存节点不阻止配置更新 | 结构与内容配置同步生效 |
| 两个表格、多页面实例 | 无跨表、跨页面订阅和缓存串扰 | 结构缓存按实例隔离 |
| 依赖 price 和 stock 的计算控件 | 任一依赖修改都刷新，不依赖父级碰巧执行 | 相同行为 |
| record 型排序、过滤、展开回调 | 既有行为不退化 | 未适配能力保持 record 模式 |

还应覆盖：真实表单连续输入、防抖提交期间切换焦点、待写期间数据重排、数字/字符串键、空数据、动态路径、列增删、不同主题及 StrictMode。

### 6.3 工程落地顺序

1. 先增加真实 `createBaseStore` 的结构共享测试与浏览器组件测试，固定“当前整行内容更新”的基线。
2. 实施第一阶段，验证同一行无关字段函数不执行，同时通过配置变更和跨字段依赖测试。
3. 增加第二阶段 opt-in 模式，仅在本页启用，记录结构组件和 Cell 外壳的前后对比；不向全部表格自动推广。
4. 保留现有 66 项回归，并运行框架/demo 类型检查与 lint；组件测试必须使用真实 DOM/浏览器环境，不能只用当前 Node 测试桩。
5. 使用 30、1000、10000 行与固定列数采样，报告实际 mounted 行数、开发/生产模式、StrictMode、commit 耗时和输入延迟；不根据函数次数直接推算性能倍数。

## 7. 相邻问题与本次边界

- `useDataState` 的注释限制同一路径混用缓动输入和直接 store 读取，但该页恰好通过两种路径别名访问同一字段。实验已确认 300ms 内输入值与表格值存在时间差。后续应明确“本地草稿 + 提交后同步”的契约；若产品要求逐键即时联动，再单独决定改成直接 store 写入、只对请求防抖。它不是全表外壳更新的根因。
- 防抖任务保存的是调度时的实际数组下标路径，期间重排的正确性应单列回归，不能因为读取侧已采用 `@Row` 就认为延迟写入也自动安全。
- 全部记录替换、新请求响应、列配置变化、主题变化可能合法扩大更新范围，不能与“只改一个字段”混用同一验收条件。
- 本次未测登录后的真实页面完整调用栈，未给出毫秒级性能收益，也未实现任何修复。

最终建议：**先用稳定身份的 memo 边界实现字段内容隔离，再按需用结构/值订阅分离减少 Ant Design 外壳更新。** 这与框架“无关数据不应带动无关组件”的目标一致，同时保留现有 schema、数据绑定和 View/Data/Handler 资产。
