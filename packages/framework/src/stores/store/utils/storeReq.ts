import { SysDataProps } from '@/data/interface';
import { get, isArray, isNumber, isString, isUndefined, set } from 'lodash';
import { IStoreBase } from '../interface';

const getReqByViewId = (viewId: string, store: IStoreBase): SysDataProps | undefined => {
  const view = store.getView(viewId);
  if (isUndefined(view)) {
    return;
  }
  const path = view.path;
  if (isString(path)) {
    return get(store.req, path);
  }

  if (isArray(path) && path.length > 0 && isString(path[0])) {
    return get(store.req, path[0]);
  }
};

// 获取指定视图的请求参数
export const getReqParams = (viewId: string, zGet: () => IStoreBase) => {
  const store = zGet();
  const req = getReqByViewId(viewId, store);

  if (isUndefined(req)) {
    return {};
  }

  return req.criteria;
};

// 重新发送请求
export const sendReq = (
  viewId: string,
  zGet: () => IStoreBase,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {};
