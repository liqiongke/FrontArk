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
  // 单元格取数路径 = 基础路径 + 行下标 + 字段名;基础路径优先取显式 path,
  // 未声明时回退 dataId(数据节点 id 即数据树路径首段),否则单元格路径会退化为 [下标, 字段] 而取不到数据
  const colnums = useMemo(
    () => TableUtils.createColumns(view.items, view.path ?? view.dataId),
    [view.items, view.path, view.dataId],
  );

  // 设置自定义组件
  const components = useRef({
    body: {
      row: TableRow,
    },
  });

  const scroll = useRef({
    y: view.height ?? 400,
  });

  return (
    <div className="view-table">
      {/* 向自定义行组件透传当前表格的 viewId,行组件据此订阅焦点高亮 */}
      <TableIdContext value={props.viewId}>
        <SearchPanel viewId={props.viewId} items={view.searchItems} />
        <Table
          scroll={scroll.current}
          virtual={true}
          rowHoverable={false}
          rowKey={KeyAttr}
          columns={colnums}
          components={components.current}
          dataSource={isArray(data) ? data : []}
        />
      </TableIdContext>
    </div>
  );
};

export default ViewTable;
