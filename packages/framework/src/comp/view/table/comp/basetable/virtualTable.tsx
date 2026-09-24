import {
  createCoreRowModel,
  coreFeatures,
  flexRender,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { get, isNumber, isString, isUndefined } from 'lodash';
import React, { useMemo, useRef } from 'react';
import { KeyAttr } from '@/interface';
import TableRow from './tableRow';
import BoundTableCell from './boundTableCell';
import { type TableColumn } from '../../interface';
import { tableRenderProbes } from '../../utils/tableTestProbes';

// 行高估算值:动态测量(measureElement)前虚拟器使用的初始行高
const ROW_HEIGHT_ESTIMATE = 34;
// 视口外保留的渲染行数:保证滚动时不出现空白闪烁
const OVERSCAN = 8;

interface VirtualTableProps {
  /** 所属表格视图 id(向行组件/单元格透传) */
  viewId: string;
  /** 框架列描述(TableUtils.createColumns 产物) */
  columns: TableColumn[];
  /** 行数据:Record 模式为完整记录,Subscription 模式为 IdentityRow 序列 */
  dataSource: unknown[];
  /** 表格高度:数字按像素,字符串按 CSS 值;未提供时默认 400px */
  height?: number | string;
}

// table-layout 由浏览器 auto 布局处理;列宽通过 colgroup 提供建议值,
// 单个 table 内表头/表体天然对齐,横向滚动由外层 overflow 容器承担
const VirtualTable: React.FC<VirtualTableProps> = (props) => {
  const { viewId, columns, dataSource, height } = props;
  // 框架自有测试探针:表格结构层执行计数(见迁移计划 5.3)
  tableRenderProbes.structure++;

  const scrollRef = useRef<HTMLDivElement>(null);

  // TanStack Table v9:仅启用核心行模型(本框架不使用排序/过滤/分页)
  const features = useMemo(
    () =>
      tableFeatures({
        ...coreFeatures,
        coreRowModel: createCoreRowModel(),
      }),
    [],
  );

  // 列定义仅承载身份(id)/标题/建议宽度;单元格取数由 BoundTableCell 按 @Row 身份完成
  const tableColumns = useMemo(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: col.title,
        ...(isNumber(col.width) ? { size: col.width } : {}),
      })),
    [columns],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    // TanStack 泛型约束为 RowData(any);行数据由框架按 KeyAttr 身份解析,不经 TanStack 取值
    data: dataSource as never,
    getRowId: (row, index) => String(get(row, KeyAttr) ?? index),
  });

  const rows = table.getRowModel().rows;
  const columnCount = columns.length;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
    // 测量行高(支持长内容换行);虚拟下标仅用于窗口计算,业务寻址一律走行身份
  });
  const virtualRows = virtualizer.getVirtualItems();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const headerGroups = table.getHeaderGroups();

  return (
    <div ref={scrollRef} className="overflow-auto" style={{ height: height ?? 400 }}>
      <table className="w-full min-w-max text-sm" data-slot="view-table">
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={isNumber(col.width) ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-card">
              {headerGroup.headers.map((header, headerIndex) => {
                const width = columns[headerIndex]?.width;
                return (
                  <th
                    key={header.id}
                    className="border-border text-foreground h-10 border-b px-2 text-left align-middle font-medium whitespace-nowrap"
                    style={isNumber(width) ? { width } : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columnCount}
                className="text-muted-foreground py-8 text-center"
              >
                暂无数据
              </td>
            </tr>
          )}
          {paddingTop > 0 && (
            <tr aria-hidden style={{ height: paddingTop }}>
              <td colSpan={columnCount} style={{ height: paddingTop, padding: 0, border: 'none' }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const record = row.original as Record<string, unknown>;
            const rowKeyValue = get(record, KeyAttr);
            // 行键必须是字符串/数字才是合法 @Row 身份;其余情况仅使用下标兜底
            const identityKey: string | number | undefined =
              isString(rowKeyValue) || isNumber(rowKeyValue) ? rowKeyValue : undefined;
            return (
              <TableRow
                key={row.id}
                // v3 Virtual 通过 data-index 定位被测元素,统一由 virtualizer.measureElement 测量行高
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-row-key={identityKey ?? row.id}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="border-border p-2 align-middle whitespace-nowrap"
                    style={{ height: virtualRow.size }}
                  >
                    <BoundTableCell
                      viewId={viewId}
                      columnKey={col.key}
                      rowKey={identityKey}
                      // 原始数据下标,与虚拟窗口无关(行身份缺失时的兜底寻址)
                      fallbackIndex={isUndefined(identityKey) ? row.index : undefined}
                    />
                  </td>
                ))}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden style={{ height: paddingBottom }}>
              <td
                colSpan={columnCount}
                style={{ height: paddingBottom, padding: 0, border: 'none' }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default VirtualTable;
