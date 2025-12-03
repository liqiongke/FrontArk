import { get, isArray, isObject, isString, isUndefined, set } from 'lodash';
import ViewBase from 'src/comp/viewBase';
import { DPath, IStoreBase, ParamKey, PathKey, ViewStore } from '../interface';
import { getActivePath } from './storeDataPath';

// 初始化视图
export const initView = (view: ViewBase<any, any>): ViewStore => {
  let viewStore = {};
  for (const key in view) {
    const v = initViewItem(get(view, key));
    if (!isUndefined(v)) {
      set(viewStore, get(v, 'id', key), v);
    }
  }
  return viewStore;
};

// 初始化元素组件
const initViewItem = (v: any) => {
  // 如果ID或者类型未被定义,则不加入组件中
  if (isUndefined(v?.type) || isUndefined(v?.id)) {
    return;
  }
  // 对于数组类型的路径,找到"@"引用类型,需要覆盖其之前的数组元素
  if (isArray(v.path) && v.path.length > 0) {
    const lastIndex = v.path.findLastIndex(
      (p: any) => isString(p) && p.startsWith(PathKey.SysHead),
    );
    if (lastIndex > 0) {
      v.path = v.path.slice(lastIndex);
    }
  }
  return v;
};

// 获取视图ID对应的视图信息
export const getView = (viewId: string | undefined, zGet: () => IStoreBase) => {
  if (!isString(viewId) || viewId.length == 0) {
    throw new Error(`未确认的viewId:${viewId}`);
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

export const getViewParams = (viewId: DPath, zGet: () => IStoreBase) => {
  if (isUndefined(viewId)) {
    return undefined;
  }
  const { viewParams } = zGet();
  return get(viewParams, viewId);
};

export const getViewParamByKey = (viewId: string, key: string, zGet: () => IStoreBase) => {
  if (isUndefined(viewId) || isUndefined(key)) {
    return;
  }
  const { viewParams } = zGet();
  return get(viewParams, [viewId, key]);
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
    // 如果设置了焦点参数,自动计算对应的焦点路径
    if (key === ParamKey.Active) {
      set(state.viewParams, [viewId, ParamKey.ActivePath], getActivePath(viewId, state, value));
    }

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
    // 如果焦点行不为空,
    const activeKey = get(values, ParamKey.Active);
    if (!isUndefined(activeKey)) {
      set(state.viewParams, [viewId, ParamKey.ActivePath], getActivePath(viewId, state, activeKey));
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
