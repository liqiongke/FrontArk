import { useMemoizedFn, useSafeState } from 'ahooks';
import { useContext, useEffect } from 'react';
import { type DPath } from '../interface';
import StoreContext from '../storeContext';
import { isString } from 'lodash';
import { bindingKey, readData } from '../utils/storeDataPath';

interface InputDraft {
  identity: string | undefined;
  resetVersion: number;
  committed: any;
  value: any;
}

/**
 * 输入本地即时反馈，300ms 后提交共享数据。允许表格等只读组件订阅提交值；
 * 同一字段的写入由一个编辑者负责。切换身份、外部提交或取消时丢弃旧草稿。
 */
export const useDataState = (path: DPath): [data: any, setData: (data: any) => void] => {
  const useStore = useContext(StoreContext);
  const value = useStore((snapshot) => readData(snapshot, path));
  const identity = useStore((snapshot) => bindingKey(snapshot, path));
  const resetVersion = useStore((snapshot) =>
    identity ? snapshot.inputResetVersions[identity] ?? 0 : 0,
  );
  const setDataDebounce = useStore((snapshot) => snapshot.setDataDebounce);
  const [draft, setDraft] = useSafeState<InputDraft>();

  useEffect(() => {
    setDraft(undefined);
  }, [identity, value, resetVersion, setDraft]);

  const setData = useMemoizedFn((data: any) => {
    setDraft({ identity, resetVersion, committed: value, value: data });
    setDataDebounce(path, data);
  });
  // render 阶段即排除旧身份草稿，不能等 effect 才纠正已显示的值。
  const current = draft && draft.identity === identity && draft.resetVersion === resetVersion &&
    Object.is(draft.committed, value) ? draft.value : value;
  return [current, setData];
};

/** 直接读写提交值；高频输入需要防抖时使用 useDataState。 */
export const useDataStoreState = (path: DPath): [data: any, setData: (data: any) => void] => {
  const useStore = useContext(StoreContext);
  const data = useStore((snapshot) => readData(snapshot, path));
  const setDataBase = useStore((snapshot) => snapshot.setData);
  const setData = useMemoizedFn((data: any) => setDataBase(path, data));
  return [data, setData];
};

export const useData = (path: DPath) => {
  const useStore = useContext(StoreContext);
  return useStore((snapshot) => readData(snapshot, path));
};

export const useDataById = (id?: string): [data: any] => {
  const useStore = useContext(StoreContext);
  const data = useStore((snapshot) => isString(id) ? readData(snapshot, id) : undefined);
  return [data];
};
