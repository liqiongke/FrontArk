import { useContext } from 'react';
import StoreContext from '../storeContext';
import { useMemoizedFn } from 'ahooks';
import { PathKey } from '../interface';

/**
 * 设置请求相关数据
 */
export const useReq = (
  viewId: string,
): [Record<string, any>, () => void, (items: string[]) => void] => {
  const useStore = useContext(StoreContext);
  const params = useStore((state) => state.getReqParams(viewId));
  const setDataByFn = useStore((state) => state.setDataByFn);
  const sendReqBase = useStore((state) => state.refreshByViewId);

  const sendReq = useMemoizedFn(() => {
    sendReqBase(viewId);
  });

  const resetReq = useMemoizedFn((items: string[] = []) => {
    if (items.length === 0) {
      return;
    }

    setDataByFn([PathKey.Req], (params) => {
      // items.forEach((item) => {
      //   params[item] = undefined;
      // });

      console.log('resetReq', params);
    });
    // sendReq();
  });

  return [params, sendReq, resetReq];
};
