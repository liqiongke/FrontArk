import { ParamKey } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { useMemoizedFn } from 'ahooks';
import React, { useContext } from 'react';
import { Checkbox } from '@/ui/components/checkbox';
import { useTableId } from '../../tableContext';
import { readSelectedKeys, resolveHeadCheckState, toggleAllKeys } from '../../utils/selection';

interface SelectionHeadCellProps {
  /** 当前数据（当前页/已加载行）的全部行键 */
  pageKeys: Array<string | number>;
  /** 单选模式没有「全选」语义，不渲染表头勾选框 */
  mode?: 'single' | 'multiple';
}

/**
 * 表头全选
 *
 * 只订阅当前页各行的勾选情况，算出全选/半选/未选三态；
 * 全选只覆盖当前已加载的行（服务端分页时即当前页），翻页后已选行保留在 @Select 上。
 */
const SelectionHeadCell: React.FC<SelectionHeadCellProps> = (props) => {
  const { pageKeys, mode } = props;
  const tableId = useTableId();
  const useStore = useContext(StoreContext);
  const allSelected = useStore((state) =>
    tableId === undefined ? false : resolveHeadCheckState(readSelectedKeys(state, tableId), pageKeys));

  const onToggleAll = useMemoizedFn(() => {
    if (tableId === undefined) {
      return;
    }
    // 半选（部分选中）时点击是「补齐」，只有全选状态才取消全选
    const store = useStore.getState();
    store.setViewParamByKey(
      tableId,
      ParamKey.Select,
      toggleAllKeys(readSelectedKeys(store, tableId), pageKeys, allSelected !== true),
    );
  });

  // 单选没有全选语义：留空占位，保持列结构与表体一致
  if (mode === 'single') {
    return null;
  }

  return (
    <div className="flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
      <Checkbox
        checked={allSelected}
        disabled={pageKeys.length === 0}
        aria-label={allSelected === true ? '取消全选' : '全选当前页'}
        onCheckedChange={onToggleAll}
      />
    </div>
  );
};

export default SelectionHeadCell;
