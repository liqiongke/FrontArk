import { get, isFunction, isUndefined, set } from 'lodash';
import { DPath, IStoreBase, ViewStore } from '../interface';
import ViewBase from 'src/comp/viewBase';

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
export const getView = (id: DPath, zGet: () => IStoreBase) => {
  if (isUndefined(id)) {
    return undefined;
  }
  const { view } = zGet();
  return get(view, id);
};

export const setView = (
  id: DPath,
  view: any,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (isUndefined(id)) {
    return;
  }
  zSet((state: IStoreBase) => {
    set(state.data, id, view);
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

export const setViewParams = (
  id: DPath,
  params: any,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (isUndefined(id)) {
    return;
  }
  zSet((state: IStoreBase) => {
    set(state.viewParams, id, params);
    return state;
  });
};
