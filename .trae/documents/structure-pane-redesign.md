# 左栏「结构」面板重构

## Context（为什么改）

Studio 前端左栏的「结构」树当前有 4 个体验问题：

1. **换页默认全展开**：`StructurePane.tsx:27-34` 的 `useEffect` 会把 `view`/`data`/`handler` 全部塞进 `expanded`，一进页面就是一大片展开，很吵。
2. **无法按类型过滤**：树里混着 视图/数据/处理器/属性/数组项，用户没法只看某一类。
3. **没有体现真实的引用关系**：`analysis.nodes` 只有单一 `page` 根（`analyze.mjs:823`），视图子树是按源码**词法嵌套**（`parentId`）渲染的。而布局里真正的父子关系是 `items` 数组里的 `this.X.id` **引用**——一个视图被多个布局引用时，当前界面完全看不出来。
4. **数据节点散落**：所有 `data.<member>` 直接挂在 `page` 下（`analyze.mjs:732-742`），没有统一入口。

**目标**：重写结构树的构建与渲染。**仅改前端**，不动 analyzer / Go 服务——因为需要的引用数据后端已经产出。

## 数据来源（已确认，无需改后端）

- `analysis.nodes`：扁平节点数组，字段见 [`types.ts`](file:///d:/workspace/web/packages/studio/web/src/types.ts#L27-L54)。
- `analysis.page.viewMembers[member] = { memberName, id, viewType, isRoot, layoutItems }`（[`types.ts:78`](file:///d:/workspace/web/packages/studio/web/src/types.ts#L78)）：
  - `layoutItems`：该视图 `items` 数组里引用到的**视图成员名**列表（由 [`analyze.mjs:981-994`](file:///d:/workspace/web/packages/studio/analyzer/src/analyze.mjs#L981-L994) + [`resolveRefMember:1021`](file:///d:/workspace/web/packages/studio/analyzer/src/analyze.mjs#L1021-L1028) 填充）。`null` = 非布局视图，有值（可能是空数组）= 布局视图。
  - `isRoot`：`getRootId()` 指向的根视图成员（[`analyze.mjs:999-1016`](file:///d:/workspace/web/packages/studio/analyzer/src/analyze.mjs#L999-L1016)）。
- `analysis.page.rootId` / `dataMembers` / `handlerMethods`。

## 目标树形（已与用户确认）

顶层**不显示**「页面」根节点，直接并列三类：

1. **视图树**
   - 隐藏根视图（`isRoot === true` 的成员），把它的 `layoutItems` 引用作为顶层视图节点。
   - 布局视图（`layoutItems !== null`）展开 → 显示它 `items` **引用**到的视图节点。
   - 普通视图（`layoutItems === null`）→ **叶子**，不展开。
   - 同一视图被多个布局引用 → 在各自父节点下**分别出现**（重复行，各自独立展开）。
   - 未被任何布局引用的视图 → **仍显示**，但标记为「孤悬节点」（独立图标 + tooltip）。
   - **环保护**：若某成员在其祖先路径中已出现，停止递归、按叶子渲染。
   - 兜底：找不到 `isRoot`（或根视图没有 `layoutItems`）时，直接以所有非根视图作为顶层。
2. **「数据」统一根**：合成节点，children = 所有 `data.<member>` 节点（其内部仍按现有词法结构展开，保留编辑能力）。
3. **「处理器」容器**：沿用真实 `handler` 节点及其 `handler.<method>` 子节点。

## 实现要点

### 1. 新增纯函数模块 `packages/studio/web/src/lib/structureTree.ts`

```ts
interface TreeItem {
  key: string;          // 路径：父 key + '/' + nodeId —— 同一 nodeId 会重复出现，key 必须唯一
  nodeId?: string;      // 真实节点；合成节点（如「数据」根）没有
  kind?: SemanticNode['kind'];
  label: string;
  orphan?: boolean;     // 孤悬视图
  synthetic?: boolean;  // 合成节点，不可选中
  children: TreeItem[];
}
buildStructureTree(analysis: Analysis): TreeItem[]
```

- 视图树：从根成员的 `layoutItems` 递归；用 `viewMembers` 判定布局/叶子；递归时维护 `referenced` 集合与祖先栈（环保护）。
- 遍历 `analysis.nodes` 收集 `referenced` 之外的视图成员 → 标记 `orphan: true`，追加到顶层。
- `data` 根 / `handler` 容器直接复用 `analysis.nodes` 里已有的 `data.<member>` / `handler` 节点，包装成 `TreeItem`。
- **非 L1 兜底**：`analysis.page.viewMembers` 为空（L2/L3 页面）时，回退到现有 `parentId === null` 的渲染路径，保证不退化。

### 2. 改造 `packages/studio/web/src/views/StructurePane.tsx`

- **默认折叠**：`expanded` 改成 `Set<path>`，初始为空；删除 `useEffect` 里的默认展开 seed（[`StructurePane.tsx:27-34`](file:///d:/workspace/web/packages/studio/web/src/views/StructurePane.tsx#L27-L34)）。
- **过滤菜单**：「结构」标题右侧加 `Button size="icon" variant="ghost"`（lucide `ListFilter`），点击弹出菜单，可勾选要显示的 kind（view/data/handler/prop/arrayItem）+「全选/清空」。仓库没有 Popover 基元（[`ui/index.tsx`](file:///d:/workspace/web/packages/studio/web/src/ui/index.tsx) 只有 Button/Input/Select/Switch/Badge/Panel/Tabs/Field/Empty/Spinner），用 `useRef` + `mousedown` 监听实现点击外部关闭。
- **渲染**：`TreeNode` 改为渲染 `TreeItem`（按 `key` 展开/收起）；选中仍调 `selectNode(nodeId)`；合成节点（`synthetic`）不可选中、只可展开；孤悬节点用独立图标（lucide `Unlink`）+ tooltip「未被任何布局引用」。
- **搜索**：keyword 时按新树过滤到「命中节点 + 其祖先路径」，命中路径自动展开（替代旧的 `parentId` 链逻辑，[`StructurePane.tsx:38-58`](file:///d:/workspace/web/packages/studio/web/src/views/StructurePane.tsx#L38-L58)）。
- 底部「根视图 / entryRel」状态栏**保留**（它是元信息，不是树节点）。若希望一并去掉，评审时告知。

## 验证

1. `pnpm --filter @jl/studio-web typecheck`（`tsc --noEmit`）通过。
2. `pnpm run studio` 起服务，打开 http://localhost:5174，选一个 L1 页面：
   - 初始所有节点折叠；
   - 点过滤按钮勾选类型，树即时增减；
   - 根视图不出现；展开布局视图显示被引用的视图；同一视图在多个父下各出现一行、展开互不影响；
   - 所有数据节点都在「数据」根下；孤悬视图有独立图标与提示；
   - 搜索能定位并自动展开；选中节点、源码跳转仍正常。
3. 切一个 L2/L3 页面，确认兜底路径没有报错、仍能浏览。