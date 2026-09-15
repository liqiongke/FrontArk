import { useContext } from 'react';
import StoreContext from '../storeContext';
import { useMemoizedFn } from 'ahooks';
import { PathKey } from '../interface';

/**
 * 设置请求相关数据
 */
export const useReq = (
  viewId: string,
): [Record<string, any> | undefined, () => void, (items: string[]) => void] => {
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

    // TODO: 重置指定字段对应的请求参数
    setDataByFn([PathKey.Req], () => {
      // items.forEach((item) => {
      //   params[item] = undefined;
      // });
    });
    // sendReq();
  });

  return [params, sendReq, resetReq];
};
