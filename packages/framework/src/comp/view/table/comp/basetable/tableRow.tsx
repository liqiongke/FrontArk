import { ParamKey } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { useMemoizedFn } from 'ahooks';
import { get, isUndefined } from 'lodash';
import React, { useContext, useMemo } from 'react';
import './index.less';
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
  const useStore = useContext(StoreContext);
  // 布尔 selector:焦点切换时仅新旧焦点行的行组件收到变更,避免全表行重渲染
  const isActive = useStore((state) => {
    if (isUndefined(tableId)) {
      return false;
    }
    return state.getViewParamByKey(tableId, ParamKey.Active) === rowKey;
  });
  const setViewParamByKey = useStore((state) => state.setViewParamByKey);
  const { children, className, style } = props;

  const onClick = useMemoizedFn(() => {
    if (isUndefined(tableId)) {
      return;
    }
    setViewParamByKey(tableId, ParamKey.Active, rowKey);
  });

  const classText = useMemo(() => {
    return isActive ? `${className} view-table-row-active` : `${className} view-table-row`;
  }, [className, isActive]);

  return (
    <div ref={ref} key={rowKey} className={classText} style={style} onClick={onClick}>
      {children}
    </div>
  );
});

export default TableRow;
