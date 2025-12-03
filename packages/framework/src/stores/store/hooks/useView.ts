import { ViewStructType } from '@/comp/view/interface';
import { useMemoizedFn } from 'ahooks';
import { get, isUndefined } from 'lodash';
import { useContext } from 'react';
import StoreContext from '../storeContext';
import { ParamKey } from '../interface';

// 获取读取值
export const useView = <V extends ViewStructType>(viewId: string): [V, (view: V) => void] => {
  const useStore = useContext(StoreContext);

  const view: V = useStore((state) => {
    return state.getView(viewId) as V;
  });

  const setView = useMemoizedFn((view: V) => {
    useStore((state) => state.setView(viewId, view));
  });

  return [view, setView];
};

// 自定义设置与视图相关联的参数
export const useParamByKey = (viewId: string, key?: ParamKey) => {
  const useStore = useContext(StoreContext);
  const param = useStore((state) => {
    const result = state.getViewParams(viewId);
    if (isUndefined(key) || key === ParamKey.All) {
      return result;
    }
    return get(result, [key]);
  });

  const setViewParams = useStore((state) => state.setViewParams);
  const setViewParamByKey = useStore((state) => state.setViewParamByKey);
  const setViewParam = useMemoizedFn((value: any) => {
    if (isUndefined(key) || key === ParamKey.All) {
      // 覆盖所有的参数
      setViewParams(viewId, value, true);
      return;
    }
    setViewParamByKey(viewId, key.toString(), value);
  });

  return [param, setViewParam];
};
