import { create } from 'zustand';
import { DPath, IStoreBase } from './interface';
import { getData, setData } from './utils/data';
import { initStore } from './utils/init';
import { getView, setView } from './utils/view';
import { immer } from 'zustand/middleware/immer';

const createBaseStore = () => {
  return create<IStoreBase>()(
    immer((set, get) => ({
      data: {},
      req: {},
      view: {},
      handler: {},
      init: (ViewClass, DataClass, HandlerClass) =>
        initStore(ViewClass, DataClass, HandlerClass, set, get),
      setView: (path: DPath, view: any) => setView(path, view, set),
      getView: (path: DPath) => getView(path, get),
      setData: (path: DPath, value: any) => setData(path, value, set),
      getData: (path: DPath) => getData(path, get),
    })),
  );
};

export default createBaseStore;
