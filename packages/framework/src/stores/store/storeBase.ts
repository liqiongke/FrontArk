import { create } from 'zustand';
import { DPath, IStoreBase } from './interface';
import { getData, setData } from './utils/data';
import { initStore } from './utils/init';
import { getView, getViewParams, setView, setViewParams } from './utils/view';
import { immer } from 'zustand/middleware/immer';

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
      setView: (path: DPath, view: any) => setView(path, view, set),
      getView: (path: DPath) => getView(path, get),
      setViewParams: (path: DPath, view: any) => setViewParams(path, view, set),
      getViewParams: (path: DPath) => getViewParams(path, get),
      setData: (path: DPath, value: any) => setData(path, value, set),
      getData: (path: DPath) => getData(path, get),
    })),
  );
};

export default createBaseStore;
