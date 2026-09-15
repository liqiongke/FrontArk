import { useParamByKey } from '@/stores/store/hooks/useView';
import { useMemoizedFn } from 'ahooks';
import { get } from 'lodash';
import React, { useMemo } from 'react';
import './index.less';
import { ParamKey } from '@/stores/store/interface';
import { useTableId } from '../../tableContext';

interface TableRowProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>((props, ref) => {
  const rowKey = get(props, 'data-row-key');
  // viewId 来自表格视图上下文,不再硬编码业务 viewId;上下文缺失时不订阅焦点高亮
  const tableId = useTableId();
  const [activeKey, setActiveKey] = useParamByKey(tableId, ParamKey.Active);
  const { children, className, style } = props;

  const onClick = useMemoizedFn(() => {
    setActiveKey(rowKey);
  });

  const classText = useMemo(() => {
    return activeKey === rowKey
      ? `${className} view-table-row-active`
      : `${className} view-table-row`;
  }, [className, activeKey === rowKey]);

  return (
    <div ref={ref} key={rowKey} className={classText} style={style} onClick={onClick}>
      {children}
    </div>
  );
});

export default TableRow;
