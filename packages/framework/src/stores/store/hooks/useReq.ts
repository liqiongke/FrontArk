import { useContext } from 'react';
import { isString } from 'lodash';
import { useMemoizedFn } from 'ahooks';
import StoreContext from '../storeContext';
import { PathKey } from '../interface';

/**
 * 设置请求相关数据
 * 返回 [请求参数(criteria), 发送请求, 重置请求参数]
 */
export const useReq = (
  viewId: string,
): [Record<string, any> | undefined, () => void, (items: string[]) => void] => {
  const useStore = useContext(StoreContext);
  const params = useStore((state) => state.getReqParams(viewId));
  // 从视图解析请求节点 id(不再由调用方硬编码节点名)
  const reqId = useStore((state) => state.getReqNodeId(viewId));
  const setDataByFn = useStore((state) => state.setDataByFn);
  const sendReqBase = useStore((state) => state.refreshByViewId);

  const sendReq = useMemoizedFn(() => {
    sendReqBase(viewId);
  });

  const resetReq = useMemoizedFn((items: string[] = []) => {
    if (items.length === 0 || !isString(reqId)) {
      return;
    }

    // 重置 = 删除 criteria 中的指定字段(恢复未设置状态,让声明的 value/path 重新生效),再重新请求
    setDataByFn([PathKey.Req, reqId, 'criteria'], (criteria: any) => {
      if (!criteria) {
        return;
      }
      items.forEach((item) => {
        delete criteria[item];
      });
    });
    sendReqBase(viewId);
  });

  return [params, sendReq, resetReq];
};
