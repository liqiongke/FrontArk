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
import { type ViewTableProps } from './interface';
import './styles/index.less';
import TableUtils from './utils/tableUtils';

const ViewTable: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewTableProps>(props.viewId);
  const [data] = useDataById(view.dataId);

  // 生成表格列
  // 单元格取数路径 = @Row 行引用 + 字段名(按行键值身份寻址,与渲染下标无关);
  // 基础路径优先取显式 path,未声明时回退 dataId,供行键值缺失时下标寻址兜底
  const columns = useMemo(
    () => TableUtils.createColumns(props.viewId, view.items, view.path ?? view.dataId),
    [props.viewId, view.items, view.path, view.dataId],
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
      <TableIdContext value={props.viewId}>
        <SearchPanel viewId={props.viewId} items={view.searchItems} />
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
          dataSource={isArray(data) ? data : []}
        />
      </TableIdContext>
    </div>
  );
};

export default ViewTable;
