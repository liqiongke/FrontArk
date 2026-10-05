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
import { type DPath } from '@/stores/store/interface';
import { cn } from '@/ui/lib/utils';
import OverlayScrollBar, { OVERLAY_SCROLL_CONTAINER_CLASS } from '@/ui/components/overlay-scrollbar';
import TableRow from './tableRow';
import BoundTableCell from './boundTableCell';
import TableSummaryRow from './tableSummaryRow';
import { type TableColumn, type TableSummaryItem } from '../../interface';
import { tableRenderProbes } from '../../utils/tableTestProbes';

// 行高估算值:动态测量(measureElement)前虚拟器使用的初始行高
const ROW_HEIGHT_ESTIMATE = 34;
// 视口外保留的渲染行数:保证滚动时不出现空白闪烁
const OVERSCAN = 8;
// 列宽下限:拖拽时不至于把列压到无法阅读
const MIN_COLUMN_WIDTH = 60;

interface VirtualTableProps {
  /** 所属表格视图 id(向行组件/单元格透传) */
  viewId: string;
  /** 框架列描述(TableUtils.createColumns 产物) */
  columns: TableColumn[];
  /** 行数据:Record 模式为完整记录,Subscription 模式为 IdentityRow 序列 */
  dataSource: unknown[];
  /** 表格高度:数字按像素,字符串按 CSS 值;未提供时默认 400px */
  height?: number | string;
  /** 底部统计行配置,为空时不渲染 */
  summaryItems?: TableSummaryItem[];
  /** 统计行首列文案 */
  summaryText?: string;
  /** 表格数据路径,供统计行独立订阅全量数据 */
  dataPath?: DPath;
}

// 列宽固定(table-layout: fixed):列宽只由配置与拖拽决定，不随内容变化,
// 表头/表体天然对齐,横向滚动由外层 overflow 容器承担
const VirtualTable: React.FC<VirtualTableProps> = (props) => {
  const { viewId, columns, dataSource, height, summaryItems, summaryText, dataPath } = props;
  // 框架自有测试探针:表格结构层执行计数(见迁移计划 5.3)
  tableRenderProbes.structure++;

  const scrollRef = useRef<HTMLDivElement>(null);
  // 吸顶表头/吸底统计行的实高决定覆盖式滚动条的可见区间，由滚动条自行读取
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const footerRef = useRef<HTMLTableSectionElement>(null);
  // 用户拖拽后的列宽覆盖值(仅存被拖过的列)，其余列按配置或容器均分
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const [containerWidth, setContainerWidth] = React.useState(0);
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

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

  // 容器宽度:未声明宽度且未被拖拽的列按它均分，保证首屏尽量不出现横向滚动
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columnWidthMap = useMemo(() => {
    const count = columns.length || 1;
    const defaultWidth = Math.max(
      MIN_COLUMN_WIDTH,
      Math.floor((containerWidth || MIN_COLUMN_WIDTH * count) / count),
    );
    const result: Record<string, number> = {};
    columns.forEach((col) => {
      result[col.key] = columnWidths[col.key] ?? col.width ?? defaultWidth;
    });
    return result;
  }, [columns, columnWidths, containerWidth]);

  // 列宽总和即表格最小宽度：超过容器时由外层滚动容器横向滚动
  const totalWidth = useMemo(
    () => columns.reduce((sum, col) => sum + (columnWidthMap[col.key] ?? 0), 0),
    [columns, columnWidthMap],
  );

  const onResizeStart = (key: string) => (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // 以渲染宽度为基准：容器比列宽总和更宽时，fixed 布局会把余量摊到各列，
    // 直接用 state 里的宽度会与用户看到的宽度不一致
    const rendered = event.currentTarget.parentElement?.offsetWidth;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: rendered && rendered > 0 ? rendered : (columnWidthMap[key] ?? MIN_COLUMN_WIDTH),
    };
  };

  const onResizeMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current;
    if (!drag) {
      return;
    }
    const next = Math.max(MIN_COLUMN_WIDTH, Math.round(drag.startWidth + event.clientX - drag.startX));
    setColumnWidths((prev) => (prev[drag.key] === next ? prev : { ...prev, [drag.key]: next }));
  };

  const onResizeEnd = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!resizeRef.current) {
      return;
    }
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    // 外层只作为覆盖式滚动条的定位上下文;边框/圆角/底色由统一面板承担,本层不套框
    <div className="relative min-w-0">
      <div
        ref={scrollRef}
        // 纵向滚动条改为自绘覆盖式;横向仍交给原生滚动条(见 OVERLAY_SCROLL_CONTAINER_CLASS)
        className={OVERLAY_SCROLL_CONTAINER_CLASS}
        style={{ height: height ?? 400 }}
      >
        <table
          className="w-full text-sm"
          data-slot="view-table"
          // fixed 布局 + 明确的列宽：内容再长也不会改变列宽；minWidth 保证列宽总和大于容器时横向滚动
          style={{ tableLayout: 'fixed', minWidth: totalWidth }}
        >
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={{ width: columnWidthMap[col.key] }} />
            ))}
          </colgroup>
          {/* 表头吸顶需要不透明底色,取统一面板的底色,滚动时不会漏出下方行内容 */}
          <thead ref={headerRef} className="sticky top-0 z-10 bg-surface">
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map((header, headerIndex) => {
                  const column = columns[headerIndex];
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'border-border text-muted-foreground relative h-10 border-b px-3 align-middle font-medium whitespace-nowrap',
                        // 标题对齐跟随本列内容：数字列标题右对齐，文本列左对齐
                        column?.align === 'right'
                          ? 'text-right'
                          : column?.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                      )}
                    >
                      <span className="block truncate">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {/* 列宽拖拽手柄：贴在本列表头右边界，拖动改变本列宽度 */}
                      {column && (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`调整「${column.title}」列宽`}
                          data-column-resizer={column.key}
                          className="group/resizer absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/10"
                          onPointerDown={onResizeStart(column.key)}
                          onPointerMove={onResizeMove}
                          onPointerUp={onResizeEnd}
                          onPointerCancel={onResizeEnd}
                        >
                          {/*
                            静止态：边界上留一段短横线作为「此处可拖拽」的常驻标识。
                            没有它时手柄只是 6px 透明热区，用户无法判断列宽能改。
                            悬停/拖动时短横线让位给贯穿表头的竖线，直接指示当前拖拽位置。
                          */}
                          <span
                            data-column-resizer-indicator="rest"
                            className="absolute top-1/2 left-1/2 h-px w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30 transition-opacity group-hover/resizer:opacity-0"
                          />
                          <span
                            data-column-resizer-indicator="active"
                            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-primary opacity-0 group-hover/resizer:opacity-100"
                          />
                        </span>
                      )}
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
                      className="border-border px-3 py-2 align-middle whitespace-nowrap"
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
          {/* 统计行:独立订阅数据,缺失数据路径或未配置统计列时不渲染 */}
          {summaryItems && summaryItems.length > 0 && dataPath !== undefined && (
            <TableSummaryRow
              ref={footerRef}
              columns={columns}
              items={summaryItems}
              summaryText={summaryText ?? '合计'}
              dataPath={dataPath}
            />
          )}
        </table>
      </div>
      {/* 覆盖式滚动条:轨道上端按表头内缩、下端按统计行内缩,只覆盖真实可滚动的行区域 */}
      <OverlayScrollBar
        scrollRef={scrollRef}
        insetTopElementRef={headerRef}
        insetBottomElementRef={footerRef}
      />
    </div>
  );
};

export default VirtualTable;
