import { useData } from '@/stores/store/hooks/useValue';
import { useView } from '@/stores/store/hooks/useView';
import { isArray, isString } from 'lodash';
import { memo, useMemo } from 'react';
import { cn } from '@/ui/lib/utils';
import { type DPath } from '@/stores/store/interface';
import SearchPanel from '../comp/searchPanel/SearchPanel';
import { type SysViewProps } from '../interface';
import { PANEL_PADDED } from '../panel';
import VirtualTable from './comp/basetable/virtualTable';
import TableIdContext from './tableContext';
import { RenderMode, type ViewTableProps } from './interface';
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
  // 生成表格列
  // 单元格取数路径由 BoundTableCell 内部按 view.path ?? view.dataId 约定解析
  const columns = useMemo(
    () => TableUtils.createColumns(viewId, view.items),
    [viewId, view.items],
  );

  return (
    <div className={cn('view-table min-w-0', PANEL_PADDED)}>
      {/* 向行组件透传当前表格的 viewId,行组件据此订阅焦点高亮 */}
      <TableIdContext value={viewId}>
        <SearchPanel viewId={viewId} items={view.searchItems} />
        <VirtualTable
          viewId={viewId}
          columns={columns}
          dataSource={dataSource}
          height={view.height}
          summaryItems={view.summaryItems}
          summaryText={view.summaryText}
          dataPath={dataPath}
        />
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
