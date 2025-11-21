import useValue from '@store/useValue';
import { Table } from 'antd';
import { isArray } from 'lodash';
import { useMemo } from 'react';
import { SysViewProps } from '../interface';
import { ViewTableProps } from './interface';
import './styles/table.less';
import TableUtils from './utils/tableUtils';

const ViewTable: React.FC<SysViewProps<ViewTableProps>> = (props) => {
  const { view } = props;
  const [data] = useValue(view.path);

  const colnums = useMemo(
    () => TableUtils.createColumns(view.items, view.path),
    [view.items, view.path],
  );

  return (
    <div className="view-table">
      <Table rowKey={view.rowKey} columns={colnums} dataSource={isArray(data) ? data : []} />
    </div>
  );
};

export default ViewTable;
