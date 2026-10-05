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
import SelectionCell from './selectionCell';
import SelectionHeadCell from './selectionHeadCell';
import TableSummaryRow from './tableSummaryRow';
import { type TableColumn, type TableSelectionConfig, type TableSummaryItem } from '../../interface';
import { fixedCellStyle, hasFixedColumns, resolveFixedOffsets } from '../../utils/fixedColumns';
import { collectRowKeys } from '../../utils/selection';
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
  /** 行勾选配置;未开启时列里不会有勾选列 */
  selection?: TableSelectionConfig;
}

// 列宽固定(table-layout: fixed):列宽只由配置与拖拽决定，不随内容变化,
// 表头/表体天然对齐,横向滚动由外层 overflow 容器承担
const VirtualTable: React.FC<VirtualTableProps> = (props) => {
  const { viewId, columns, dataSource, height, summaryItems, summaryText, dataPath, selection } = props;
  // 框架自有测试探针:表格结构层执行计数(见迁移计划 5.3)
  tableRenderProbes.structure++;

  const tableRef = useRef<HTMLTableElement>(null);
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

  // 固定列偏移量必须按「实际渲染宽度」累加：容器比列宽总和更宽时，
  // fixed 布局会把余量摊给各列，声明宽度会比渲染宽度小，偏移量随之偏左。
  // 无固定列时完全不测量（不引入额外的布局读取）
  const hasFixed = useMemo(() => hasFixedColumns(columns), [columns]);
  const [measuredWidths, setMeasuredWidths] = React.useState<number[]>([]);
  React.useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    const tableEl = tableRef.current;
    if (!hasFixed || !scrollEl || !tableEl) {
      return;
    }
    const measure = () => {
      const headers = Array.from(tableEl.querySelectorAll('thead th'));
      // jsdom 无布局引擎时全部为 0：视为「测量不可用」，由调用方退回声明宽度
      const widths = headers.map((header) => header.getBoundingClientRect().width);
      setMeasuredWidths((prev) =>
        prev.length === widths.length && prev.every((width, index) => Math.abs(width - widths[index]) < 0.5)
          ? prev
          : widths,
      );
    };
    measure();
    // 列宽拖拽、容器缩放、列增减都会改变渲染宽度；表格自身宽度不变时（未溢出）观察不到，
    // 故除 ResizeObserver 外还把拖拽结果与容器宽度列为依赖
    const observer = new ResizeObserver(measure);
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [hasFixed, columns, columnWidths, containerWidth]);

  const fixedOffsets = useMemo(() => {
    if (!hasFixed) {
      return {};
    }
    const measured = measuredWidths.some((width) => width > 0);
    const widths = columns.map((col, index) =>
      measured ? measuredWidths[index] ?? 0 : columnWidthMap[col.key] ?? 0,
    );
    return resolveFixedOffsets(columns, widths);
  }, [hasFixed, columns, columnWidthMap, measuredWidths]);

  // 当前数据（当前页/已加载行）的行键：表头全选只覆盖这些行
  const pageKeys = useMemo(
    () => (selection ? collectRowKeys(dataSource) : []),
    [selection, dataSource],
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
          ref={tableRef}
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
              // 表头底色取不透明 token：固定列表头用 bg-inherit 跟随，半透明底色会透出下方行
              <tr key={headerGroup.id} className="bg-table-head">
                {headerGroup.headers.map((header, headerIndex) => {
                  const column = columns[headerIndex];
                  const fixedStyle = column ? fixedCellStyle(column, fixedOffsets) : undefined;
                  return (
                    <th
                      key={header.id}
                      // 固定列 sticky 在本列左/右边界；z-20 压过列宽手柄(handle 为 z-10)，
                      // 否则已滚到固定列下方的列的手柄会盖在固定列表头上
                      className={cn(
                        'border-border text-muted-foreground relative h-10 border-b px-3 align-middle font-medium whitespace-nowrap',
                        fixedStyle && 'sticky z-20 bg-inherit',
                        // 标题对齐跟随本列内容：数字列标题右对齐，文本列左对齐
                        column?.align === 'right'
                          ? 'text-right'
                          : column?.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                      )}
                      style={fixedStyle}
                    >
                      {column?.selection ? (
                        <SelectionHeadCell pageKeys={pageKeys} mode={selection?.mode} />
                      ) : (
                        <span className="block truncate">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                      {/* 列宽拖拽手柄：贴在本列表头右边界，拖动改变本列宽度；勾选列宽度由配置决定 */}
                      {column && !column.selection && (
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
                            静止态：边界上留一段短竖线作为「此处可拖拽」的常驻标识。
                            线随边界走 —— 列与列的分隔本身是竖向的，横线读起来像表头下方的下划线，
                            会被误认成装饰而不是分隔标记。
                            颜色取主题的 --divider：1px 细线需要比 --border 更实才看得见，
                            强弱由主题统一控制，组件里不写死透明度。
                            没有它时手柄只是 6px 透明热区，用户无法判断列宽能改。
                            悬停/拖动时短竖线让位给贯穿表头的整条竖线，直接指示当前拖拽位置。
                          */}
                          <span
                            data-column-resizer-indicator="rest"
                            className="absolute top-1/2 left-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-divider transition-opacity group-hover/resizer:opacity-0"
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
                  {columns.map((col) => {
                    // 固定列：sticky 定位 + 跟随行底色的不透明背景（行底色本身是不透明 token）
                    const fixedStyle = fixedCellStyle(col, fixedOffsets);
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'border-border px-3 py-2 align-middle whitespace-nowrap',
                          fixedStyle && 'sticky z-[1] bg-inherit',
                        )}
                        style={{ height: virtualRow.size, ...fixedStyle }}
                      >
                        {col.selection ? (
                          <SelectionCell rowKey={identityKey} mode={selection?.mode} />
                        ) : (
                          <BoundTableCell
                            viewId={viewId}
                            columnKey={col.key}
                            rowKey={identityKey}
                            // 原始数据下标,与虚拟窗口无关(行身份缺失时的兜底寻址)
                            fallbackIndex={isUndefined(identityKey) ? row.index : undefined}
                          />
                        )}
                      </td>
                    );
                  })}
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
              fixedOffsets={fixedOffsets}
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
