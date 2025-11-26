import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { DPath, IStoreBase } from './interface';
import { getData, setData } from './utils/data';
import { initStore } from './utils/init';
import { getView, getViewParams, setView, setViewParamByKey, setViewParams } from './utils/view';

const createBaseStore = () => {
  return create<IStoreBase>()(
    immer((set, get) => ({
      data: {},
      req: {},
      view: {},
      viewParams: {},
      handler: {},
      init: (ViewClass, DataClass, HandlerClass) =>
        initStore(ViewClass, DataClass, HandlerClass, set, get),
      setView: (viewId: string, view: any) => setView(viewId, view, set),
      getView: (viewId?: string) => getView(viewId, get),
      setViewParams: (viewId: string, values: any, init?: boolean) =>
        setViewParams(viewId, values, init, set),
      setViewParamByKey: (viewId: string, key: string, value: string) =>
        setViewParamByKey(viewId, key, value, set),
      getViewParams: (viewId: string) => getViewParams(viewId, get),
      setData: (path: DPath, value: any) => setData(path, value, set),
      getData: (path: DPath) => getData(path, get),
    })),
  );
};

export default createBaseStore;
