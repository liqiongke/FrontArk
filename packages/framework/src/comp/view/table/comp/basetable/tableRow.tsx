import { ParamKey } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { useMemoizedFn } from 'ahooks';
import { get, isUndefined } from 'lodash';
import React, { useContext, useMemo } from 'react';
import { useTableId } from '../../tableContext';
import { tableRenderProbes } from '../../utils/tableTestProbes';

interface TableRowProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}

// 渲染表格行(tr)：保留行点击写入焦点参数、布尔 selector 仅通知新旧焦点行的语义
const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>((props, ref) => {
  // 框架自有测试探针:行外壳执行计数(见迁移计划 5.3)
  tableRenderProbes.rowShell++;
  const rowKey = get(props, 'data-row-key');
  // viewId 来自表格视图上下文,不再硬编码业务 viewId;上下文缺失时不订阅焦点高亮
  const tableId = useTableId();
  const useStore = useContext(StoreContext);
  // 布尔 selector:焦点切换时仅新旧焦点行的行组件收到变更,避免全表行重渲染
  const isActive = useStore((state) => {
    if (isUndefined(tableId)) {
      return false;
    }
    return get(state.viewParams, [tableId, ParamKey.Active]) === rowKey;
  });
  const setViewParamByKey = useStore((state) => state.setViewParamByKey);
  // data-index/data-row-key 等测量与定位属性透传到 DOM(虚拟器按 data-index 定位被测元素)
  const { children, className, style, ...restProps } = props;

  const onClick = useMemoizedFn(() => {
    if (isUndefined(tableId)) {
      return;
    }
    setViewParamByKey(tableId, ParamKey.Active, rowKey);
  });

  // 行底色一律取不透明色：固定列单元格用 bg-inherit 跟随行状态，
  // 半透明底色会让横向滚动时从固定列下方滑过的单元格文字透出来
  const classText = useMemo(() => {
    return `view-table-row ${className ?? ''} cursor-pointer border-b bg-surface transition-colors ${
      isActive ? 'view-table-row-active bg-muted hover:bg-muted' : 'hover:bg-row-hover'
    }`;
  }, [className, isActive]);

  return (
    <tr ref={ref} className={classText} style={style} onClick={onClick} {...restProps}>
      {children}
    </tr>
  );
});

export default TableRow;
