import { get, isFunction, isObject, isString, isUndefined, set } from 'lodash';
import ViewBase from 'src/comp/viewBase';
import { DPath, IStoreBase, ViewStore } from '../interface';

export const initView = (view: ViewBase<any>): ViewStore => {
  let viewStore = {};
  for (const key in view) {
    const v = get(view, key);
    if (!isFunction(v)) {
      set(viewStore, get(v, 'id', key), v);
    }
  }
  return viewStore;
};

// 获取视图ID对应的视图信息
export const getView = (viewId: string | undefined, zGet: () => IStoreBase) => {
  if (!isString(viewId) || viewId.length == 0) {
    return undefined;
  }
  const { view } = zGet();
  return get(view, viewId);
};

// 设置视图ID对应的视图信息
export const setView = (
  viewId: string,
  view: any,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (!isString(viewId) || viewId.length == 0) {
    return;
  }
  zSet((state: IStoreBase) => {
    set(state.view, viewId, view);
    return state;
  });
};

export const getViewParams = (id: DPath, zGet: () => IStoreBase) => {
  if (isUndefined(id)) {
    return undefined;
  }
  const { viewParams } = zGet();
  return get(viewParams, id);
};

// 设置指定项的参数
export const setViewParamByKey = (
  viewId: string,
  key: string,
  value: string,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (isUndefined(viewId)) {
    return;
  }
  zSet((state: IStoreBase) => {
    set(state.viewParams, [viewId, key], value);
    return state;
  });
};

// 批量设置参数
export const setViewParams = (
  viewId: string,
  values: any,
  init: boolean = false,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (isUndefined(viewId)) {
    return;
  }
  zSet((state: IStoreBase) => {
    if (!isObject(values)) {
      return state;
    }
    if (init) {
      set(state.viewParams, viewId, values);
      return state;
    }
    const params = get(state.viewParams, viewId, {});
    set(state.viewParams, viewId, { ...params, ...values });
    return state;
  });
};
