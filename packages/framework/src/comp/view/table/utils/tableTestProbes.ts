/**
 * 框架自有的表格渲染探针（测试探针迁移,见迁移计划 5.3）
 *
 * 原测试依赖 Ant Design 内部模块(@rc-component/table Cell)与 .ant-table DOM 查询,
 * 移除 Ant 后改由框架拥有的各层组件自带计数:
 * - structure: 表格结构层(VirtualTable,含列装配与虚拟窗口)
 * - rowShell: 行/单元格外壳层(TableRow 行外壳)
 * - cellShell: 单元格容器(BoundTableCell,memo 身份隔离层)
 * 字段订阅层(useData/useDataState)仍由测试通过 hook mock 计数,
 * 不把外壳调用次数当成真实字段更新次数。
 */
export const tableRenderProbes = {
  structure: 0,
  rowShell: 0,
  cellShell: 0,
};

export function resetTableRenderProbes(): void {
  tableRenderProbes.structure = 0;
  tableRenderProbes.rowShell = 0;
  tableRenderProbes.cellShell = 0;
}
