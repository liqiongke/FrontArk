import { useMemoizedFn, useSafeState } from 'ahooks';
import { useContext, useEffect } from 'react';
import { type DPath } from '../interface';
import StoreContext from '../storeContext';
import { get, isString } from 'lodash';

/**
 * 使用缓动更新界面数据,hooks中保存本地数据缓存
 */
export const useDataState = (path: DPath): [data: any, setData: (data: any) => void] => {
  const [state, setState] = useSafeState<any>();
  const useStore = useContext(StoreContext);
  const value = useStore((state) => state.getData(path));
  const setDataDebounce = useStore((state) => state.setDataDebounce);

  useEffect(() => {
    if (value !== state) {
      setState(value);
    }
  }, [value]);

  const setData = useMemoizedFn((data: any) => {
    setState(data);
    setDataDebounce(path, data);
  });

  return [state, setData];
};

/**
 * 立刻更新数据
 */
export const useDataStoreState = (path: DPath): [data: any, setData: (data: any) => void] => {
  const useStore = useContext(StoreContext);
  const data = useStore((state) => state.getData(path));
  const setDataBase = useStore((state) => state.setData);

  const setData = useMemoizedFn((data: any) => {
    setDataBase(path, data);
  });

  return [data, setData];
};

/**
 * 根据path获取数据
 */
export const useData = (path: DPath) => {
  const useStore = useContext(StoreContext);
  return useStore((state) => state.getData(path));
};

/**
 * 根据数据Id返回数据
 */
export const useDataById = (id?: string): [data: any, path?: string] => {
  if (!isString(id)) {
    return [];
  }
  const useStore = useContext(StoreContext);
  const data = useStore((state) => state.getData(id));
  return [data];
};
