import { useContext } from 'react';
import { get, isString } from 'lodash';
import { readReqNodeId } from '../utils/storeDataPath';
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
  const params = useStore((state) => {
    const id = readReqNodeId(state, viewId);
    return isString(id) ? get(state.req, [id, 'criteria']) : undefined;
  });
  const reqId = useStore((state) => readReqNodeId(state, viewId));
  const cancelDataScope = useStore((state) => state.cancelDataScope);
  const setDataByFn = useStore((state) => state.setDataByFn);
  const sendReqBase = useStore((state) => state.refreshByViewId);

  const sendReq = useMemoizedFn(() => {
    sendReqBase(viewId);
  });

  const resetReq = useMemoizedFn((items: string[] = []) => {
    if (items.length === 0 || !isString(reqId)) {
      return;
    }

    items.forEach((item) => cancelDataScope([PathKey.Req, reqId, 'criteria', item]));
    // 先取消待写任务，再删除条件；同值草稿也通过取消版本通知清空。
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
