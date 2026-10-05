import { ParamKey } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { useMemoizedFn } from 'ahooks';
import React, { useContext } from 'react';
import { Checkbox } from '@/ui/components/checkbox';
import { type TableSelectionMode } from '../../interface';
import { useTableId } from '../../tableContext';
import { isKeySelected, readSelectedKeys, toggleSelectedKey } from '../../utils/selection';

interface SelectionCellProps {
  /** 行键：缺失时该行不可勾选（复选框禁用并说明原因） */
  rowKey?: string | number;
  mode?: TableSelectionMode;
}

/**
 * 行勾选单元格
 *
 * 与 TableRow 的焦点高亮同一套路：用布尔 selector 只订阅「本行是否被勾选」，
 * 勾选别的行不会让本行重渲染。
 *
 * 勾选语义一律「切换」而不看 Radix 给出的 next：状态以 store 为准，
 * 连续点击/受控回写都不会出现「点了没反应」或反向切换。
 * 点击勾选框不冒泡到行：勾选是独立意图，不该顺带改写焦点行。
 */
const SelectionCell: React.FC<SelectionCellProps> = (props) => {
  const { rowKey, mode } = props;
  const tableId = useTableId();
  const useStore = useContext(StoreContext);
  const selectable = rowKey !== undefined;
  const checked = useStore((state) =>
    tableId === undefined || !selectable ? false : isKeySelected(state, tableId, rowKey),
  );

  const onToggle = useMemoizedFn(() => {
    if (tableId === undefined || !selectable) {
      return;
    }
    const store = useStore.getState();
    store.setViewParamByKey(
      tableId,
      ParamKey.Select,
      toggleSelectedKey(readSelectedKeys(store, tableId), rowKey, mode),
    );
  });

  return (
    <div
      className="flex items-center justify-center"
      // 勾选不改变焦点行：与行点击（设置 @Active）互不干扰
      onClick={(event) => event.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        disabled={!selectable}
        aria-label={selectable ? `选择行 ${rowKey}` : '该行缺少行键，无法勾选'}
        onCheckedChange={onToggle}
      />
    </div>
  );
};

export default SelectionCell;
