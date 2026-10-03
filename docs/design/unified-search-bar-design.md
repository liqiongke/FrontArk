# 统一搜索框（Unified Search Bar）前端交互设计

设计日期：2026-10-03。设计对象：`/base/table` 页面（`apps/demo/src/pages/base/table`）的表格搜索面板。参考实现入口：`packages/framework/src/comp/view/comp/searchPanel/`。本文只交付设计，**未修改框架或页面实现**。

## 1. 结论

把当前「4+ 个字段并排的搜索表单」收敛为「一个搜索条 + 一组条件 Tag」：

- 单个搜索条内含 **类型选择器**、**随类型变化的输入控件**、**搜索按钮**、**高级筛选入口（逃生门）**。
- 输入即推断：系统按「显式语法 → 正则 → 值类型 → 别名 → 兜底」分层判定用户想搜什么，并在输入框左侧以标签回显当前类型。
- 回车提交，条件以 **Tag 形式追加**到搜索条下方，支持删除、编辑、折叠；Tag 即「联合搜索（AND）」的可视化载体。
- 右上角「高级筛选」按钮开合**完整搜索面板**（复用现有 `SearchPanelForm`），两种模式共享同一份 `criteria`，切换不丢条件。

数据结构上只需扩展 `SearchPlaneItem` 一处（补充别名、值类型、匹配方式等元信息），状态仍复用 zustand 的 `req[reqId].criteria` 作为**唯一数据源**，不引入新的全局状态、不破坏 `Subscription` 渲染模式的性能前提。

## 2. 业界案例与可借鉴点

| 案例 | 交互做法 | 对本设计的借鉴 |
| --- | --- | --- |
| **Sentry Issues 搜索** | 搜索由 `key:value` token 序列组成，末尾允许裸文本。每个 token 是一个可视单元，非法写法会告警。（[docs.sentry.io/concepts/search](https://docs.sentry.io/concepts/search)） | L1 显式语法层（`tr:` / `tr=`）；token 可视化 = 我们的 Tag；非法输入必须**显性报错而非静默猜测** |
| **GitHub Issue/PR 搜索限定符** | `is:issue repo:facebook/react label:bug`；输入过程中动态提示可用限定符与取值，并对问题写法给出警告。 | 打字时即时提示；**限定符 + 值** 分离建模，映射到我们的「类型 Tag + 值控件」 |
| **Grafana 面板 Filter Chips** | 表格/图表上方以可删除 chip 展示已生效筛选，每个 chip 对应一组 `算子 + 字段 + 值`，可增删改。（[Filter and group by](https://grafana.org/docs/grafana/latest/visualizations/dashboards/build-dashboards/filter-group-by/)） | Tag 的信息结构（字段名 + 值 + 删除）与「新增筛选」入口的位置 |
| **Chrome / 浏览 Omnibox** | 输入 URL、书签名、搜索词时按「输入形状」决定回车行为（跳转 / 搜索），并在输入过程中给出「将按…执行」的提示 | 「按形状推断 + 推断结果前置回显」；回车语义随推断结果变化 |
| **Retool / Airtable 的全局搜索字段** | 单一输入框内输入任意关键字，后端做跨字段匹配；旁边放「筛选器」按钮进入结构化条件编辑 | 逃生门与主动搜索的职责切分：主动搜索管高频、筛选器管长尾 |
| **Elastic Search UI** | `SearchBox` 独占输入，与筛选面板解耦，筛选状态由外部管理并可回填 | 搜索条与筛选面板**双向同步**而非单向跳转 |

**共同结论**：主流做法是「主动搜索做意图识别（token 化）+ 结构化筛选做精确表达」，二者并存，识别失败时**平滑降级**到结构化表单，而不是强制用户学习语法。

## 3. 现状盘点

### 3.1 挂载与链路

- 挂载点：`packages/framework/src/comp/view/table/viewTable.tsx:35` → `<SearchPanel viewId={viewId} items={view.searchItems} />`
- 容器：`SearchPanel.tsx`（回车提交 `sendReq()`、重置 `reset(fields)`、items 为空返回 `null`）
- 布局：`SearchPanelForm.tsx`（容器查询 + `--search-columns` 栅格，`colNum` 默认 4）
- 单项：`SearchPanelItem.tsx` → `CtrlFactory` + `path={[PathKey.Req, reqId, 'criteria', item.field]}`
- 半成品：`SearchPanelSelect.tsx` 已有「左侧类型下拉 + 右侧控件 + 搜索图标」的骨架，但 `CtrlFactory` 传了空 props（第 47 行），且未被任何地方引用。
- 声明处：`apps/demo/src/pages/base/table/view.tsx:13-18`，4 个字段（`id` / `name` / `price` / `category`），全部未传 `ctrl`，因此**全部退化为文本输入框**。
- 提交链路：`refreshByViewId` → `flushDataScope(criteria)` → `buildRequestParams` → `criteria` 平铺为 query params。
- mock 后端 `packages/mock/src/routes/demo/demoBase.ts` 原先只解析 `page` / `pageSize`；本次已补 criteria 过滤（模糊/数值/区间/多值）与按条件分页。

### 3.2 现有类型定义

`searchPanel/interface.ts:48-60`：

```ts
export interface SearchPlaneItem {
  title: string;
  field: string;
  ctrl?: CtrlSearchPlaneType;   // 已支持 9 种控件
  regExp?: RegExp;              // 已存在，注释写明「根据用户输入可快速匹配当前节点」
}
```

`regExp` 字段的存在说明「输入驱动匹配」的思路在框架里已有预留，本次设计是对它的兑现。

### 3.3 缺口

1. `SearchPlaneItem` 缺少别名、值类型、匹配方式（精确/模糊/区间）、示例值等推断所需元信息。
2. `SearchPlaneItem` 的 `ctrl` 在 demo 页面全部缺省，日期/枚举字段没有声明控件。
3. UI 原子组件缺 `tag.tsx`（Tag 展示必需）与 `pagination.tsx`（与本设计无关，但同属表格能力缺口）。
4. `useReq().reset(fields)` 按字段名清空 criteria，天然支持「按 Tag 删除」；但 **Tag 顺序** 与「类型锁定态」没有落脚点。

## 4. 交互设计

### 4.1 整体布局

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [运输单号 ▾][ TR2024▌            ] [🔍 搜索] [⚙ 高级筛选] │ 重置    │  ← 搜索条(simple)
│ ⟨运输单号：TR2024001 ×⟩ ⟨状态：待收货 ×⟩ ⟨创建时间：10-01 ~ 10-03 ×⟩     │  ← 已生效条件 Tag 区
└──────────────────────────────────────────────────────────────────────┘
        ↓ 点击「高级筛选」就地展开（原 SearchPanelForm，不跳页、不弹窗）
┌──────────────────────────────────────────────────────────────────────┐
│  产品ID [      ]  产品名称 [      ]  价格 [  ]  类别 [  ]  [搜索][重置] │
└──────────────────────────────────────────────────────────────────────┘
```

规则：

- 两种模式**同位替换**（in-place），不新开 Dialog/抽屉，避免上下文跳转。
- Tag 区仅在有已提交条件时出现，容器高度变化用 `h` 过渡，避免表格抖动。
- Tag 顺序 = 添加顺序；`AND` 语义在 Tag 上以分隔符 `且` 表达，字段支持 `OR` 时在同一字段 Tag 内表达多值。

### 4.2 搜索条内元素

| 位置 | 元素 | 行为 |
| --- | --- | --- |
| 左 | **类型选择器** | 下拉列出全部可搜字段（`SearchTypeSelect` + Radix `DropdownMenu`，带 `example` 副标题）。选中后即「锁定」该类型，右侧输入控件立即换成对应形态 |
| 中 | **动态值输入区** | 按字段 `valueKind` 渲染：`text` → `Input`；`number` → 数字 `Input`；`date` → `CtrlDate`；`dateRange` → `CtrlDateRange`；`enum` → `CtrlSelect`（选项来自 `ctrl.items`）；`bool` → `CtrlSwitch` |
| 右 | **搜索按钮** | 提交并把当前值转成 Tag |
| 右 | **高级筛选按钮** | `SlidersHorizontal` 图标，切换 simple/advanced 模式 |
| 极右 | **重置** | 清空全部 Tag 与 `criteria`（沿用 `reset(items.map(i => i.field))`） |

### 4.3 类型推断引擎（核心）

输入时实时推断，规则按优先级从高到低（**实现顺序 = 可靠性顺序，高优先级先命中即返回**）：

| 级别 | 规则 | 示例 | 命中后控件 |
| --- | --- | --- | --- |
| **P0** | 用户从下拉显式选择且已锁定 | 点「运输单号」后输入任意文本 | 锁定为该字段的 `valueKind` |
| **P1** | 显式语法 `key:` / `key=`（复刻 Sentry / GitHub） | `tr:`、`date=` | 锁定 key 对应字段，值取冒号后内容 |
| **P2** | 值类型形状匹配（比正则可靠，故优先于正则） | `2026-10-01` / `今天` / `近7天` / `199.5` | 锁定对应字段并把文本无损转成控件值 |
| **P3** | 字段 `regExp` 精确命中 | `TR2024001` 命中 `^TR\d{6,}$` | 锁定「运输单号」+ `Input` |
| **P4** | 正则的**字面量前缀**命中（从 source 提取字母/汉字前缀） | `tr` → 运输单号 | 锁定「运输单号」+ `Input` |
| **P5** | 枚举值匹配 | 输入「待收货」命中 `status` 的选项 label | 锁定「状态」+ `Select`，并回填该选项值 |
| **P6** | 别名/关键词匹配 | `名称` / `品名` / `name` → `name` 字段 | 锁定该字段 |
| **P7** | 兜底 | 无命中且声明了 `primary` | 按 `primary` 字段提交，`confidence='none'` |

判定算法（纯函数，可单测）：

```ts
// packages/framework/src/comp/view/comp/searchPanel/searchBar/infer/inferSearchType.ts
export const inferSearchType = (
  raw: string,
  items: SearchPlaneItem[],
  options: { lockedField?: string } = {},
): SearchInferResult => {
  // P0 锁定 -> P1 显式语法 -> P2 值形状 -> P3 正则精确 -> P4 正则字面量前缀
  // -> P5 枚举 label -> P6 标题/别名 -> P7 primary 兜底(置信度 none)
};
```

`confidence` 三档与反馈：

- `exact`（P0–P3）：静默锁定，输入框左侧标签实心显示，不打扰。
- `inferred`（P4–P6）：锁定并**高亮标签 + 显示「已识别为『创建时间』」** 2s，同时提供一次「撤销」。
- `none`（P7）：不锁定，输入框左侧显示虚线下划线的「选择搜索类型 ▾」，输入内容原样保留。

**误推断防护（必须实现）**：

1. 推断**不修改用户原始文本**。只有当新控件能无损承载当前文本时才允许切换控件（如 `2026-10-01` → `CtrlDateRange` 的首日）；否则只锁定类型，控件仍为文本，由用户补全。
2. 推断只改「类型」，不改「值」。值在回车提交时才落到 `criteria`。
3. 任何时候按 `Esc` 立即解除锁定并回到 `none` 状态，把文本交还用户。
4. 若推断出的字段最终查不到结果，Tag 上提供「在全部字段中查找 `xxx`」的二次入口，把误推断的代价降到一次点击。

### 4.4 提交与 Tag 生命周期

```text
输入 → 推断(锁定类型) → Enter/点搜索 → 值规范化 → 写入 criteria → 追加 Tag → 清空输入区并解锁
                                                        ↓ 校验失败
                                                输入区标红 + 提示，Tag 不落地
```

- **值规范化**（`normalizeValue.ts`）：文本 `trim`；数字转数值并校验；日期归一为 `YYYY-MM-DD`；区间文本（`2026-10-01 ~ 2026-10-03`，起止颠倒自动交换）展开为 `[start, end]`；布尔识别 `true/false/是/否/1/0`；枚举按 label 反查为业务值。
  - 区间分隔符**不含 `-`**（否则 `2026-10-01` 会被误切），支持 `~`、`～`、`至`、`到`、`...`。
  - 日期一律序列化为 `YYYY-MM-DD`（与 `CtrlDateRange` 的 `format` 契约一致）；补时分（`00:00:00` / `23:59:59`）交由服务端或含时间的 `format` 处理，避免前后端格式不一致。
- **联合搜索**：Tag 集合即 `criteria` 全集，天然 AND。同字段重复添加：合并为多值（`criteria[field] = [v1, v2]`，语义 OR），Tag 显示为 `运输单号：TR1 / TR2`。
- **删除**：Tag 上的 `×` **删除整条条件**（`AND` 语义下一个字段即一条条件），并立即刷新表格。
- **编辑**：点击 Tag（非删除区）→ 值回填输入区并锁定原类型，`Enter` 覆盖原 Tag（`Esc` 取消）。
- **溢出**：Tag 数 > 6 时显示 `+N 更多…`，点击展开 `Popover` 批量查看/删除。
- **顺序持久化**：`criteria` 是平铺对象、无序，故在请求节点下新增 `searchOrder: string[]` 存放字段顺序，保证刷新/翻页后 Tag 顺序稳定。
- **草稿隔离**：输入过程中的值存于请求节点的 `searchDraft`，**不写入 `criteria`**；提交前 `flushDataScope` 立即落盘再读取最新值，避免防抖导致取到旧值。文本形态的值由搜索条受控持有（推断需要零延迟），提交时以 `override` 参数传入。

### 4.5 逃生门：高级筛选面板

- 入口：搜索条右侧「高级筛选」按钮 + 输入框右下角 `⌘K` 之外的显式入口（不使用快捷键作为唯一入口，避免误触）。
- 行为：切换的是**同一组件内的渲染分支**，`mode` 为组件本地 state（默认 `simple`，可 `localStorage` 记忆，按 `viewId` 维度），不写入 store、不触发请求。
- **双向同步是硬性要求**：
  - simple 模式加 Tag → advanced 模式对应字段控件立即显示该值。
  - advanced 模式改值/搜索 → simple 模式 Tag 区同步出对应 Tag。
  - 实现方式：以 `criteria` 为唯一数据源，Tag 列表由 `criteria` 派生（`buildConditionTags`），顺序由 `searchOrder` 补齐。**不维护第二份状态**。
  - 切换不触发请求：`mode` 只影响渲染分支；仅在 simple 模式提交条件、或高级面板点「搜索/重置」时才发请求。
- 高级面板是**长尾能力的唯一入口**：区间、多选组合、复杂枚举、本地自定义选项、字段级 `OR` 组合等一律留在高级面板，simple 模式不做等价实现，只做「常用 80%」的快路径。

### 4.6 键盘流

| 按键 | 行为 |
| --- | --- |
| `Enter` | 提交并生成 Tag（`CtrlDate` 未选完时先关闭选择器） |
| `Esc` | 解除类型锁定 / 关闭下拉 / 退出 simple→advanced 切换中间态（优先级由近到远） |
| `Backspace`（输入区为空） | 删除最后一个已生效条件（与 Tag 的删除键一致，不做「载入编辑」，避免误删） |
| `Tab` | 在「类型 → 值 → 搜索 → 高级」间移动；类型下拉内用方向键选择并自动锁定 |
| `⌘/Ctrl + K` | 聚焦搜索条（补充入口，非唯一） |
| `↑ / ↓`（输入区有值） | 唤起类型候选列表（候选项按推断优先级排序，当前推断项置顶） |

> 未识别到类型时**仍然保留输入框**（已输入文本不丢），提示「选择搜索类型」，回车则提示先选类型；这样「推断失败」不会退化成「无法输入」。识别成功但置信度为 `inferred` 时，搜索条下方以 `aria-live` 提示「已识别为『X』，回车确认」。

## 5. 数据模型扩展

```ts
// packages/framework/src/comp/view/comp/searchPanel/interface.ts

// 值形态：决定推断层行为 + 值区渲染何种控件
export type SearchValueKind =
  | 'text' | 'number' | 'bool'
  | 'date' | 'dateRange' | 'timeRange'
  | 'enum';

export interface SearchPlaneItem {
  title: string;
  field: string;
  ctrl?: CtrlSearchPlaneType;

  // 现有：正则快速匹配（本次作为 P2/P3 规则正式启用）
  regExp?: RegExp;

  // 新增：推断元信息
  keywords?: string[];             // 别名/中文名/英文名，如 ['品名','名称','name']
  valueKind?: SearchValueKind;     // 缺省按 ctrl.type 推断，再缺省 'text'
  match?: 'exact' | 'fuzzy' | 'range';  // 传给后端的比较语义，默认 fuzzy
  operator?: 'and' | 'or';         // 同字段多值语义，默认 or
  weight?: number;                 // 同级竞争权重，大者优先，默认 0
  example?: string;                // 输入区占位符，如 'TR 开头的运输单号'
  primary?: boolean;               // 兜底字段，页面最多一个
}
```

声明处示例（`view.tsx`）：

```tsx
searchItems: [
  { title: '产品ID',   field: 'id',       keywords: ['编号'],      valueKind: 'text', regExp: /^PRD\d+$/i, match: 'exact' },
  { title: '产品名称', field: 'name',     keywords: ['品名', '名称'], valueKind: 'text', primary: true },
  { title: '价格',     field: 'price',    keywords: ['金额'],      valueKind: 'number', match: 'range' },
  { title: '产品类别', field: 'category', keywords: ['分类'],      valueKind: 'enum',  operator: 'or' },
  { title: '状态',     field: 'status',   keywords: ['单据状态'],  valueKind: 'enum',
    ctrl: { type: Ctrl.Select, items: [{ label: '待收货', value: 'pending' }] } },
  { title: '创建时间', field: 'createTime', keywords: ['日期', '时间'], valueKind: 'dateRange',
    ctrl: { type: Ctrl.DateRange, format: 'YYYY-MM-DD' } },
],
```

> 注意：高级面板由 `searchItems` 自动渲染，因此上面的 `ctrl` 声明**同时修正了当前 4 个字段全部退化为文本框的问题**，无需为高级面板另写配置。

## 6. 组件划分

```text
packages/framework/src/comp/view/comp/searchPanel/
  SearchPanel.tsx                  # 改造：mode 切换 + 组合 + 提交/重置（对外 props 不变，新增可选 mode）
  SearchPanelForm.tsx              # 保留：完整搜索面板（advanced 分支）
  SearchPanelItem.tsx              # 保留：原样复用
  SearchPanelSelect.tsx            # 保留：原样复用（新的类型下拉另建 SearchTypeSelect）
  searchBar/
    SearchBar.tsx                  # 单行搜索条：类型选择器 + 值区 + 按钮组 + Tag 区 + 推断/锁定状态
    SearchTypeSelect.tsx           # 类型下拉（Radix DropdownMenu，含 example 副标题与未识别态样式）
    SearchValueInput.tsx           # 文本走受控 Input，其余 valueKind 分发到 CtrlFactory
    SearchTagBar.tsx               # Tag 区容器（溢出折叠 + 更多 Popover + 清空条件）
    SearchTagItem.tsx              # 单个 Tag：字段名 + 值 + 删除 + 点击编辑
    useSearchCriteria.ts           # criteria/searchDraft/searchOrder 的读写、提交、删除、重置
    utils/
      searchItemUtils.ts           # valueKind 推导、控件配置合成、值展示
      buildConditionTags.ts        # criteria + order -> 条件 Tag（唯一数据源派生）
    infer/
      inferSearchType.ts           # 纯函数推断引擎（P0~P7）
      parseTypedQuery.ts           # 解析 `key:` / `key=` 显式语法
      valueShape.ts                # 值形状判定 + 日期/区间文本解析
      normalizeValue.ts            # 值规范化
      inferSearchType.test.ts      # 单测：7 级规则 + 显式语法 + 值规范化（19 例）
```

需要新增的 UI 原子组件：
- `ui/components/tag.tsx`（已新增，并从 `@jl/framework/ui` 导出）
- 类型下拉直接复用既有 `ui/components/dropdown-menu.tsx`（Radix），无需新组件

挂载点与对外接口保持兼容（`viewTable.tsx:35` 不动；`SearchPlaneProps` 仅新增可选 `mode`），页面 `view.tsx` 只需补充 `searchItems` 的元信息声明。
挂载点与对外接口保持兼容（`viewTable.tsx:35` 不动；`SearchPlaneProps` 仅新增可选 `mode`），页面 `view.tsx` 只需补充 `searchItems` 的元信息声明。

## 7. 与现有数据链路的关系

1. **唯一数据源**：仍是 `req[reqId].criteria`。Tag 列表由 `criteria` + `searchOrder` 派生，**不引入镜像 state**，避免两处状态不一致。
2. **写入方式**：值控件沿用 `CtrlFactory` + `path` 的受控数据路径，但 simple 模式绑定的是草稿路径 `[PathKey.Req, reqId, 'searchDraft', field]`，**只有提交时才落到 `criteria`**，避免「打一字就写一次条件」。
3. **重置**：`useReq().reset(fields)` 已支持按字段删除，删除单个条件与「重置」直接复用。
4. **请求参数**：`buildRequestParams` 直接 `cloneDeep(criteria)` 平铺为 query params，simple 模式不产生新结构，**后端零改动**（多值字段序列化为重复 key）。
5. **日期区间**：`CtrlDateRange` 产出 `[start, end]`；mock `demoBase.ts` 已补 criteria 过滤（含区间与多值）并按条件分页，便于验证。
6. **渲染模式**：该页声明使用 `RenderMode.Subscription`，前提是「无本地排序/过滤」。本设计**不引入任何本地过滤/排序**，只影响请求参数，前提不受影响。

## 8. 边界与降级

| 场景 | 处理 |
| --- | --- |
| 输入无法推断 | 不锁定，输入框仍然保留（文本不丢），提示手动选类型；回车时若无类型则提示先选类型。声明了 `primary` 的页面按 `primary` 字段提交 |
| 误推断导致查不到 | 提交时把该条件标记为低置信度，Tag 用虚线边框弱化显示，便于一眼识别可疑条件 |
| Tag 过多导致 URL 超长 | 超过 8 个条件时提示「条件过多，建议使用高级筛选/后端分页」；参数超过阈值时改用 POST 查询体（需后端配合，二期） |
| 值校验失败（日期非法、枚举不存在） | 输入区标红 + 就地提示，Tag 不落地，不发请求 |
| 同一字段多次添加 | 合并为多值数组（默认 OR 语义），Tag 明确展示 `A / B` |
| 高级面板残留草稿 | 高级面板只写 `criteria`；`searchDraft` 仅服务 simple 模式，切换模式不影响已生效条件 |
| 与 `Subscription` 模式冲突 | 无冲突。本设计只写 `criteria`，不改表格数据结构 |
| 移动端 | 单列布局；Tag 换行；高级筛选改为 Sheet 承载（复用 `ui/components/sheet.tsx`） |

## 9. 可访问性与国际化

- 类型选择器使用 `DropdownMenu`（Radix），自带焦点管理与 `aria` 语义；值区按 `valueKind` 切换控件时需保持焦点在同一容器内并播报类型变更（`aria-live="polite"`：「已切换为日期选择器」）。
- Tag 的删除按钮需可聚焦、带 `aria-label="删除条件：运输单号 TR2024001"`。
- 全部文案走中文硬编码先行（当前项目 `searchPanel` 无 i18n 接入），但组件内不散落文案字面量，集中在 `interface.ts` 与常量表，便于后续接 i18n。

## 10. 实施计划

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| **P0 ✅ 元信息** | 扩展 `SearchPlaneItem`；补 `tag.tsx`；`view.tsx` 为 4 个字段声明 `valueKind` / `keywords` / `regExp` / `ctrl` | 高级面板中 4 个字段分别呈现为文本/数字/下拉，日期为区间选择器；mock 支持 criteria 过滤 |
| **P1 ✅ 搜索条骨架** | `SearchBar` + `SearchTypeSelect` + `SearchValueInput`（新增 `SearchTypeSelect`，`SearchPanelSelect` 保持原样未动） | 选类型 → 控件正确切换 → Enter 写入 `criteria` 并发请求 |
| **P2 ✅ 推断引擎** | `inferSearchType` + `parseTypedQuery` + 单测；类型标签回显与 `confidence` 反馈 | 7 级规则单测通过；`tr` / `TR2024001` / `2026-10-01` / `最近7天` / `待收货` 五个用例均正确锁定 |
| **P3 ✅ Tag 联合搜索** | `SearchTagBar` / `SearchTagItem` + `searchOrder` + 多值合并 + 溢出折叠 | 添加 3 个条件后 criteria 含 3 键；删除中间 Tag 不影响其余；刷新后顺序稳定 |
| **P4 ✅ 逃生门** | `mode` 切换 + 双向同步 | 两种模式互切条件不丢；advanced 改值后 simple Tag 同步更新 |
| **P5 🔶 打磨（部分）** | 键盘流、空态/错误态、低置信度 Tag 弱化已实现；**待做**：移动端 Sheet 承载高级面板、埋点上报 | 键盘全流程可完成一次联合搜索；埋点覆盖识别准确率与高级面板打开率 |

## 11. 埋点与验证指标

- **识别准确率**：提交时 `inferred.field` 与后端实际命中字段的一致率（需后端回传命中字段）。
- **主动搜索占比**：simple 模式发起的请求数 / 总搜索请求数。
- **逃生门使用率**：打开 advanced 的会话占比；打开前 3 次搜索的 Tag 数（若 ≥ 4，说明推断覆盖不足）。
- **Tag 编辑率**：Tag 被删除/编辑的比例；删除占比高说明推断或默认值有误。
- **零结果率**：识别为 `inferred` 的查询 vs 用户手动选类型的查询，两者零结果率对比，作为推断质量的持续校准依据。

## 12. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 推断歧义导致查不到数据 | 用户信任度下降 | 推断只在 P0–P6 命中时锁定；Tag 明示字段名；提供「全字段查找」二次入口；`confidence='inferred'` 视觉降级 |
| 条件数膨胀 | 请求参数过长、后端压力 | 单表字段数上限 + 条件数上限提示；superfluous 条件由 Tag 一目了然，天然抑制堆叠 |
| 简单/高级双模式一致性 | 认知负担 | 单一数据源 + Tag 派生；模式选择持久化；切换时不发请求，仅在提交时发 |
| 破坏现有 `searchPanel` 扩展点 | 其他页面回归 | `SearchPanelProps` 与挂载点不变，`SearchPanelForm` 原样保留为 advanced 分支；`SearchPanelSelect` 重构后仍导出兼容默认结构 |
| mock 未实现 criteria 过滤 | 无法验证 | P0 阶段同步补 `packages/mock/src/routes/demo/demoBase.ts` 的过滤逻辑（含区间与多值） |
