import { useMemoizedFn } from 'ahooks';
import { useContext } from 'react';
import { type DPath } from './interface';
import StoreContext from './storeContext';

// 获取读取值
const useValue = (path: DPath) => {
  const useStore = useContext(StoreContext);

  const value = useStore((state) => state.getData(path));

  const setValueBase = useStore((state) => state.setData);

  const setValue = useMemoizedFn((data: any) => {
    setValueBase(path, data);
  });

  return [value, setValue];
};

export default useValue;
