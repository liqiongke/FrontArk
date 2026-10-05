import { useData } from '@/stores/store/hooks/useValue';
import { useView } from '@/stores/store/hooks/useView';
import { isArray, isObject, isString } from 'lodash';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/ui/lib/utils';
import { type DPath } from '@/stores/store/interface';
import SearchPanel from '../comp/searchPanel/SearchPanel';
import { type SysViewProps } from '../interface';
import { PANEL_PADDED } from '../panel';
import VirtualTable from './comp/basetable/virtualTable';
import TablePagination from './comp/tablePagination';
import TableTools from './comp/tableTools';
import TableIdContext from './tableContext';
import { RenderMode, type TableToolsConfig, type ViewTableProps } from './interface';
import {
  buildColumnOrder,
  filterVisibleColumns,
  moveColumn,
  orderColumns,
} from './utils/columnPrefs';
import { partitionColumnsByFixed } from './utils/fixedColumns';
import { filterDataColumns, resolveSelectionConfig } from './utils/selection';
import TableUtils from './utils/tableUtils';
import useRowIdentityList, { type IdentityRow } from './utils/useRowIdentityList';

// 稳定空列表:非数组数据按空表处理时保持 dataSource 引用稳定
const EMPTY_LIST: IdentityRow[] = [];

/**
 * 表格主体:列定义/搜索面板/虚拟表格装配,与 dataSource 来源(完整记录 or 行身份)无关
 *
 * 搜索面板与表格共用同一个统一面板:搜索区在上、表格在下，二者之间不再有各自的
 * 边框与卡片底，只保留间距（见 SearchPanel 的 mb-4），整体表现为一个数据区块。
 */
const TableShell = memo(function TableShell({ viewId, view, dataSource, dataPath }: {
  viewId: string;
  view: ViewTableProps;
  dataSource: IdentityRow[];
  dataPath?: DPath;
}) {
  // 行勾选配置：未开启时 undefined，勾选列也不会被合成出来
  const selection = useMemo(() => resolveSelectionConfig(view.selection), [view.selection]);
  // 生成表格列
  // 单元格取数路径由 BoundTableCell 内部按 view.path ?? view.dataId 约定解析
  const columns = useMemo(
    () => TableUtils.createColumns(viewId, view.items, selection),
    [viewId, view.items, selection],
  );
  // 数据列（不含勾选列）：列设置与 CSV 导出只认业务列，勾选列不该被隐藏/调序/导出
  const dataColumns = useMemo(() => filterDataColumns(columns), [columns]);
  const panelRef = useRef<HTMLDivElement>(null);
  // 列偏好：order 为 undefined、hiddenKeys 为空即"完全沿用配置"，
  // 只记用户改过的部分，业务侧新增列不会被偏好挡住
  const [columnOrder, setColumnOrder] = useState<string[] | undefined>(undefined);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  // tools 置为 false 关闭；对象则按字段单独关闭（未声明默认开启）
  const toolsConfig: TableToolsConfig | undefined =
    view.tools === false ? undefined : isObject(view.tools) ? view.tools : {};

  // 含被隐藏列在内的完整顺序：列设置面板按它列出全部列。
  // 固定列按「左固定在前、右固定在后」分区：这样列设置里的顺序与渲染顺序一致，
  // 且把固定列拖到中间也会被拉回本侧，偏移量始终等于本侧宽度累加
  const orderedColumns = useMemo(
    () => partitionColumnsByFixed(orderColumns(columns, columnOrder)),
    [columns, columnOrder],
  );
  // 实际渲染的列：表头、数据行、统计行、CSV 导出都只看它，四处天然一致
  const visibleColumns = useMemo(
    () => filterVisibleColumns(orderedColumns, hiddenKeys),
    [orderedColumns, hiddenKeys],
  );
  // 可见的数据列：工具区（CSV 导出）用，避免导出勾选列
  const visibleDataColumns = useMemo(() => filterDataColumns(visibleColumns), [visibleColumns]);

  const onToggleColumn = useCallback(
    (key: string, visible: boolean) => {
      setHiddenKeys((prev) => {
        if (visible) {
          return prev.includes(key) ? prev.filter((each) => each !== key) : prev;
        }
        if (prev.includes(key)) {
          return prev;
        }
        // 兜底保证至少一列可见（列设置里最后一列的勾选框已禁用）。
        // 按数据列计数：勾选列不能被当作「最后那一列」
        return dataColumns.length - prev.length - 1 < 1 ? prev : [...prev, key];
      });
    },
    [dataColumns.length],
  );

  const onMoveColumn = useCallback(
    (fromKey: string, toKey: string) => {
      setColumnOrder((prev) => {
        const current = buildColumnOrder(columns, prev);
        const next = moveColumn(current, fromKey, toKey);
        return next === current ? prev : next;
      });
    },
    [columns],
  );

  const onResetColumns = useCallback(() => {
    setColumnOrder(undefined);
    setHiddenKeys([]);
  }, []);

  const hasSearchItems = isArray(view.searchItems) && view.searchItems.length > 0;
  const toolsNode = toolsConfig ? (
    <TableTools
      // CSV 导出只含业务列：勾选列没有字段可导出
      columns={visibleDataColumns}
      dataPath={dataPath}
      fullscreenTargetRef={panelRef}
      config={toolsConfig}
      columnSettings={{
        // 列设置同样只列业务列：勾选列的显隐/顺序不由用户决定
        allColumns: filterDataColumns(orderedColumns),
        hiddenKeys,
        onToggle: onToggleColumn,
        onMove: onMoveColumn,
        onReset: onResetColumns,
      }}
    />
  ) : null;

  return (
    <div ref={panelRef} className={cn('view-table min-w-0', PANEL_PADDED)}>
      {/* 向行组件透传当前表格的 viewId,行组件据此订阅焦点高亮 */}
      <TableIdContext value={viewId}>
        {/* 搜索面板只承载搜索相关操作（搜索条 / 条件 Tag / 高级筛选） */}
        {hasSearchItems && <SearchPanel viewId={viewId} items={view.searchItems} />}
        <VirtualTable
          viewId={viewId}
          columns={visibleColumns}
          dataSource={dataSource}
          height={view.height}
          summaryItems={view.summaryItems}
          summaryText={view.summaryText}
          dataPath={dataPath}
          selection={selection}
        />
        {/* 底部行：左侧是表格工具（列设置/全屏/下载），右侧是分页条。
            工具落在表格左下角而不是搜索条右上角——那里是搜索的地盘，
            表格自身的操作跟表格数据收尾在一起更顺，也把左下角的空位用起来。
            二者同在滚动区之外：不随表格滚动，也不会被统计行压住 */}
        {(toolsNode || view.pagination) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1">{toolsNode}</div>
            {view.pagination && (
              <TablePagination
                viewId={viewId}
                config={isObject(view.pagination) ? view.pagination : {}}
              />
            )}
          </div>
        )}
      </TableIdContext>
    </div>
  );
});

/**
 * 经典模式(默认):订阅完整数据数组,
 * 记录变化(任何字段修改)都会进入表格父级更新链路;行为与历史版本一致
 */
const RecordTable: React.FC<{ viewId: string; view: ViewTableProps; dataPath?: DPath }> = ({
  viewId,
  view,
  dataPath,
}) => {
  const data = useData(dataPath);
  return (
    <TableShell
      viewId={viewId}
      view={view}
      dataSource={isArray(data) ? data : EMPTY_LIST}
      dataPath={dataPath}
    />
  );
};

/**
 * 结构订阅模式:表格结构只依赖有序行键序列,字段值由单元格控件按 @Row 自行订阅;
 * 普通字段编辑不再带动表格结构层/单元格外壳更新(见 docs/design/table-cell-update-analysis.md 5.2)
 */
const SubscriptionTable: React.FC<{ viewId: string; view: ViewTableProps; dataPath?: DPath }> = ({
  viewId,
  view,
  dataPath,
}) => {
  const identity = useRowIdentityList(viewId);
  // 行身份不可靠(键缺失/重复/非字符串)时回退经典渲染,行为与 Record 模式一致
  const dataSource = identity.fallback
    ? isArray(identity.rawData)
      ? identity.rawData
      : EMPTY_LIST
    : identity.rows;
  return <TableShell viewId={viewId} view={view} dataSource={dataSource} dataPath={dataPath} />;
};

const ViewTable: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewTableProps>(props.viewId);
  // 表格实际读取的数据路径:统计行按同一路径独立订阅全量数据(含未进入虚拟窗口的行)
  const dataPath = useMemo<DPath>(
    () => view.path ?? (isString(view.dataId) ? [view.dataId] : undefined),
    [view.path, view.dataId],
  );
  // 按渲染模式分发,默认 Record 兼容;模式分发在视图层订阅内完成,不额外增加数据订阅
  if (view.renderMode === RenderMode.Subscription) {
    return <SubscriptionTable viewId={props.viewId} view={view} dataPath={dataPath} />;
  }
  return <RecordTable viewId={props.viewId} view={view} dataPath={dataPath} />;
};

export default ViewTable;
