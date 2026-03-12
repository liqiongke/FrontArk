import HandlerViewBase from '@/handler/handlerViewBase';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { type DPath, IStoreBase } from './interface';
import { getData, setData, setDataByFn, setDataDebounce } from './utils/storeData';
import { getHandler, setHandler } from './utils/storeHandler';
import { initStore } from './utils/storeInit';
import {
  getView,
  getViewParamByKey,
  getViewParams,
  setView,
  setViewParamByKey,
  setViewParams,
} from './utils/storeView';
import StoreReq from './utils/storeReq';

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

      // 视图请求
      setView: (viewId: string, view: any) => setView(viewId, view, set),
      getView: (viewId?: string) => getView(viewId, get),
      setViewParams: (viewId: string, values: any, init?: boolean) =>
        setViewParams(viewId, values, init, set),
      setViewParamByKey: (viewId: string, key: string, value: string) =>
        setViewParamByKey(viewId, key, value, set),
      getViewParams: (viewId: string) => getViewParams(viewId, get),
      getViewParamByKey: (viewId: string, key: string) => getViewParamByKey(viewId, key, get),

      // 工具栏
      getHandler: (viewId?: string) => getHandler(viewId, get),
      setHandler: (viewId: string, handler: HandlerViewBase) => setHandler(viewId, handler, set),

      // 数据类
      setData: (path: DPath, value: any) => setData(path, value, get, set),
      setDataByFn: (path: DPath, dataFn: (data: any) => any) => setDataByFn(path, dataFn, get, set),
      setDataDebounce: (path: DPath, value: any) => setDataDebounce(path, value, get),
      getData: (path: DPath) => getData(path, get),

      // 数据请求相关参数
      getReqParams: (viewId: string) => StoreReq.getReqParams(viewId),
      // 重新发送请求
      refreshByViewId: (viewId: string) => StoreReq.send(viewId),
    })),
  );
};

export default createBaseStore;
