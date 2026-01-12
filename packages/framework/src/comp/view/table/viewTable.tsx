import { KeyAttr } from '@/interface';
import { useData, useDataById } from '@/stores/store/hooks/useValue';
import { useView } from '@/stores/store/hooks/useView';
import { Table } from 'antd';
import { isArray } from 'lodash';
import { useMemo, useRef } from 'react';
import SearchPanel from '../comp/searchPanel/SearchPanel';
import { SysViewProps } from '../interface';
import TableRow from './comp/basetable/tableRow';
import { ViewTableProps } from './interface';
import './styles/index.less';
import TableUtils from './utils/tableUtils';

const ViewTable: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewTableProps>(props.viewId);
  const data = useDataById(view.path);

  // 生成表格列
  const colnums = useMemo(
    () => TableUtils.createColumns(view.items, view.path),
    [view.items, view.path],
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
    </div>
  );
};

export default ViewTable;
