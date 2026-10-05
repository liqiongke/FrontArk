import { KeyAttr } from '@/interface';
import { ParamKey, type IStoreBase } from '@/stores/store/interface';
import { get, isArray, isBoolean, isNumber, isObject, isString, isUndefined } from 'lodash';
import {
  type TableColumn,
  type TableRowKey,
  type TableSelectionConfig,
  type ViewTableProps,
} from '../interface';

/**
 * 行勾选
 *
 * 选中态只记「行键」，不记 record：
 * - 落点与焦点行同源，都是视图参数（`viewParams[viewId][@Select]`），
 *   因此翻页/重排/字段编辑都不会丢，handler 也能按同一份数据读取；
 * - 只依赖行键，Subscription（结构订阅）模式同样可用；
 * - 行键缺失/非字符串的行无法被勾选（@Select 里放进去也没有意义），
 *   表头全选只覆盖这些合法行。
 */

/** 勾选列的列 key：固定值，避免与 `field_index` 形式的业务列冲突 */
export const SELECTION_COLUMN_KEY = '__selection__';

/** 勾选列默认宽度：勾选框 16px + 两侧留白 */
const DEFAULT_SELECTION_WIDTH = 48;

/** 把 selection 配置归一成配置对象；未开启时返回 undefined */
export const resolveSelectionConfig = (
  selection: ViewTableProps['selection'],
): TableSelectionConfig | undefined => {
  if (isUndefined(selection) || selection === false) {
    return undefined;
  }
  return isObject(selection) ? selection : {};
};

/** 合成勾选列：默认固定左侧（横向滚动时勾选列必须始终可点） */
export const createSelectionColumn = (config: TableSelectionConfig): TableColumn => ({
  title: '',
  width: config.width ?? DEFAULT_SELECTION_WIDTH,
  dataIndex: '',
  key: SELECTION_COLUMN_KEY,
  valueType: 'text',
  align: 'center',
  fixed: config.fixed === false ? undefined : 'left',
  selection: true,
});

/** 读取选中行键：始终保持数组形态，未选中时返回稳定空数组 */
const EMPTY_KEYS: TableRowKey[] = [];

export const readSelectedKeys = (state: IStoreBase, viewId: string): TableRowKey[] => {
  const keys = get(state.viewParams, [viewId, ParamKey.Select]);
  if (!isArray(keys)) {
    return EMPTY_KEYS;
  }
  return keys.filter((key) => isString(key) || isNumber(key));
};

/** 判断某个行键是否被勾选：按行键做布尔比较，便于行组件用布尔 selector 只订阅自己 */
export const isKeySelected = (state: IStoreBase, viewId: string, rowKey: unknown) => {
  if (!isString(rowKey) && !isNumber(rowKey)) {
    return false;
  }
  return readSelectedKeys(state, viewId).some((key) => key === rowKey);
};

/** 勾选/取消一行；单选模式下选中新行会顶掉上一行 */
export const toggleSelectedKey = (
  keys: TableRowKey[],
  rowKey: TableRowKey,
  mode: TableSelectionConfig['mode'],
): TableRowKey[] => {
  if (keys.includes(rowKey)) {
    return keys.filter((key) => key !== rowKey);
  }
  return mode === 'single' ? [rowKey] : [...keys, rowKey];
};

/** 取数据源里可勾选的行键（顺序与渲染顺序一致，同时用于表头全选判定） */
export const collectRowKeys = (dataSource: unknown[]): TableRowKey[] => {
  const keys: TableRowKey[] = [];
  const seen = new Set<TableRowKey>();
  dataSource.forEach((record) => {
    const key = get(record as object, KeyAttr);
    if (!isString(key) && !isNumber(key)) {
      return;
    }
    // 行键重复的数据无法用 @Row 安全寻址（表格已回退经典模式），勾选也只记一次
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    keys.push(key);
  });
  return keys;
};

/** 全选（并入当前页未选中的行）/ 取消全选（只移除当前页已选中的行） */
export const toggleAllKeys = (
  keys: TableRowKey[],
  pageKeys: TableRowKey[],
  selected: boolean,
): TableRowKey[] => {
  if (!selected) {
    return keys.filter((key) => !pageKeys.includes(key));
  }
  const merged = keys.slice();
  pageKeys.forEach((key) => {
    if (!merged.includes(key)) {
      merged.push(key);
    }
  });
  return merged;
};

/** 表头勾选框状态：全部选中 / 部分选中（半选）/ 未选中 */
export const resolveHeadCheckState = (
  keys: TableRowKey[],
  pageKeys: TableRowKey[],
): boolean | 'indeterminate' => {
  const selectedCount = pageKeys.filter((key) => keys.includes(key)).length;
  if (selectedCount === 0 || pageKeys.length === 0) {
    return false;
  }
  return selectedCount === pageKeys.length ? true : 'indeterminate';
};

/** 勾选开关的布尔归一：Radix Checkbox 的 onCheckedChange 会给出 'indeterminate' */
export const isCheckedTrue = (checked: boolean | 'indeterminate') => isBoolean(checked) && checked;

/**
 * 取出业务列（排除勾选列）
 * 列设置与 CSV 导出只认业务列：勾选列没有字段可导出，也不该由用户隐藏或调序
 */
export const filterDataColumns = (columns: TableColumn[]): TableColumn[] =>
  columns.filter((column) => !column.selection);
