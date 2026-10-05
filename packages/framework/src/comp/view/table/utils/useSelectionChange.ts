import StoreContext from '@/stores/store/storeContext';
import { type DPath, type IStoreBase } from '@/stores/store/interface';
import { useContext, useEffect, useRef } from 'react';
import { isArray, isUndefined } from 'lodash';
import { KeyAttr } from '@/interface';
import { type TableRowKey, type TableSelectionConfig } from '../interface';
import { readSelectedKeys } from './selection';

/** 按键从数据快照里取整行记录：行已不在数据里时跳过 */
const pickRows = (
  state: IStoreBase,
  keys: TableRowKey[],
  dataPath?: DPath,
): Array<Record<string, unknown>> => {
  if (keys.length === 0 || isUndefined(dataPath)) {
    return [];
  }
  const rows = state.getData(dataPath);
  if (!isArray(rows)) {
    return [];
  }
  const byKey = new Map<unknown, Record<string, unknown>>();
  rows.forEach((row) => {
    if (row !== null && typeof row === 'object') {
      byKey.set((row as Record<string, unknown>)[KeyAttr], row as Record<string, unknown>);
    }
  });
  return keys
    .map((key) => byKey.get(key))
    .filter((row): row is Record<string, unknown> => !isUndefined(row));
};

/**
 * 勾选变化通知（selection.onChange）
 *
 * 只做「变化时回调」，不参与渲染：用 store.subscribe 监听而不是 selector，
 * 因此不给表格结构层增加任何订阅，Subscription 模式的结构隔离契约不受影响
 * （勾选集合用字符串签名比对，没有变化就不回调）。
 */
const useSelectionChange = (
  viewId: string,
  config: TableSelectionConfig | undefined,
  dataPath?: DPath,
) => {
  const useStore = useContext(StoreContext);
  const onChange = config?.onChange;
  // null 表示「尚未初始化」：挂载时若已有勾选，只记签名、不回调
  const signatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (isUndefined(onChange)) {
      return;
    }
    const notify = () => {
      const state = useStore.getState();
      const keys = readSelectedKeys(state, viewId);
      const signature = keys.join('\u0001');
      if (signature === signatureRef.current) {
        return;
      }
      const initialized = signatureRef.current !== null;
      signatureRef.current = signature;
      if (!initialized) {
        return;
      }
      onChange(keys, pickRows(state, keys, dataPath));
    };
    // 先对齐当前签名，再开始监听
    notify();
    return useStore.subscribe(notify);
  }, [useStore, viewId, onChange, dataPath]);
};

export default useSelectionChange;
