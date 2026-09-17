import { KeyAttr } from '@/interface';
import { useDataById } from '@/stores/store/hooks/useValue';
import { useView } from '@/stores/store/hooks/useView';
import { Table } from 'antd';
import { isArray } from 'lodash';
import { useMemo, useRef } from 'react';
import SearchPanel from '../comp/searchPanel/SearchPanel';
import { type SysViewProps } from '../interface';
import TableRow from './comp/basetable/tableRow';
import TableIdContext from './tableContext';
import { RenderMode, type ViewTableProps } from './interface';
import './styles/index.less';
import TableUtils from './utils/tableUtils';
import useRowIdentityList, { type IdentityRow } from './utils/useRowIdentityList';

// 稳定空列表:非数组数据按空表处理时保持 dataSource 引用稳定
const EMPTY_LIST: IdentityRow[] = [];

/**
 * 表格主体:列定义/行组件/搜索面板装配,与 dataSource 来源(完整记录 or 行身份)无关
 */
const TableShell: React.FC<{
  viewId: string;
  view: ViewTableProps;
  dataSource: IdentityRow[];
}> = ({ viewId, view, dataSource }) => {
  // 生成表格列
  // 单元格取数路径由 BoundTableCell 内部按 view.path ?? view.dataId 约定解析
  const columns = useMemo(
    () => TableUtils.createColumns(viewId, view.items),
    [viewId, view.items],
  );

  // 设置自定义组件
  const components = useRef({
    body: {
      row: TableRow,
    },
  });

  // scroll 配置仅随 height 变化,useMemo 保证引用稳定
  const scroll = useMemo(() => ({ y: view.height ?? 400 }), [view.height]);

  return (
    <div className="view-table">
      {/* 向自定义行组件透传当前表格的 viewId,行组件据此订阅焦点高亮 */}
      <TableIdContext value={viewId}>
        <SearchPanel viewId={viewId} items={view.searchItems} />
        <Table
          scroll={scroll}
          virtual={true}
          // 关闭内部分页:antd 默认 pageSize=10 会切片 dataSource,导致渲染行下标与数据下标错位,
          // 框架列表数据由请求全量驱动,翻页应通过请求参数(如分页接口)实现
          pagination={false}
          rowHoverable={false}
          rowKey={KeyAttr}
          columns={columns}
          components={components.current}
          dataSource={dataSource}
        />
      </TableIdContext>
    </div>
  );
};

/**
 * 经典模式(默认):订阅完整数据数组,
 * 记录变化(任何字段修改)都会进入表格父级更新链路;行为与历史版本一致
 */
const RecordTable: React.FC<{ viewId: string; view: ViewTableProps }> = ({ viewId, view }) => {
  const [data] = useDataById(view.dataId);
  return (
    <TableShell
      viewId={viewId}
      view={view}
      dataSource={isArray(data) ? data : EMPTY_LIST}
    />
  );
};

/**
 * 结构订阅模式:表格结构只依赖有序行键序列,字段值由单元格控件按 @Row 自行订阅;
 * 普通字段编辑不再带动 Table/Cell 外壳更新(见 docs/design/table-cell-update-analysis.md 5.2)
 */
const SubscriptionTable: React.FC<{ viewId: string; view: ViewTableProps }> = ({
  viewId,
  view,
}) => {
  const identity = useRowIdentityList(viewId);
  // 行身份不可靠(键缺失/重复/非字符串)时回退经典渲染,行为与 Record 模式一致
  const dataSource = identity.fallback
    ? isArray(identity.rawData)
      ? identity.rawData
      : EMPTY_LIST
    : identity.rows;
  return <TableShell viewId={viewId} view={view} dataSource={dataSource} />;
};

const ViewTable: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewTableProps>(props.viewId);
  // 按渲染模式分发,默认 Record 兼容;模式分发在视图层订阅内完成,不额外增加数据订阅
  if (view.renderMode === RenderMode.Subscription) {
    return <SubscriptionTable viewId={props.viewId} view={view} />;
  }
  return <RecordTable viewId={props.viewId} view={view} />;
};

export default ViewTable;
