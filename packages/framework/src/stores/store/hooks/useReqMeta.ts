import { useContext } from 'react';
import { get, isString } from 'lodash';
import { readReqNodeId } from '../utils/storeDataPath';
import StoreContext from '../storeContext';
import { type ReqMetaInfo } from '../interface';

/**
 * 订阅指定视图对应数据节点的请求运行信息（运行状态 + 响应元信息）。
 *
 * 响应体的 `@pagination` 等视图参数由请求层写入 `reqMeta.responseParams`，
 * 需要读取分页/总数这类元信息时从这里取。
 *
 * 注意：返回值保持引用稳定（直接返回 store 内的 reqMeta 对象，查不到时为 undefined），
 * 不可在此新建对象，否则会因快照不稳定导致无限重渲染。
 */
export const useReqMeta = (viewId: string): ReqMetaInfo | undefined => {
  const useStore = useContext(StoreContext);
  return useStore((state) => {
    const reqId = readReqNodeId(state, viewId);
    return isString(reqId) ? get(state.reqMeta, reqId) : undefined;
  });
};
