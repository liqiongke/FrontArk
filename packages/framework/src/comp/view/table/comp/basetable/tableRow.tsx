import { useParamByKey } from '@/stores/store/hooks/useView';
import { useMemoizedFn } from 'ahooks';
import { get } from 'lodash';
import React, { useMemo } from 'react';
import './index.less';
import { ParamKey } from '@/stores/store/interface';

interface TableRowProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>((props, ref) => {
  const rowKey = get(props, 'data-row-key');
  const [activeKey, setActiveKey] = useParamByKey('table1', ParamKey.Active);
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
