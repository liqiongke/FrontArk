import { get, isString, set } from 'lodash';
import { IStoreBase } from '../interface';

export const getHandler = (viewId: string | undefined, zGet: () => IStoreBase) => {
  if (!isString(viewId) || viewId.length == 0) {
    return undefined;
  }
  const { handler } = zGet();
  return get(handler, viewId);
};

export const setHandler = (
  viewId: string,
  view: any,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (!isString(viewId) || viewId.length == 0) {
    return;
  }
  zSet((state: IStoreBase) => {
    set(state.handler, viewId, view);
    return state;
  });
};
