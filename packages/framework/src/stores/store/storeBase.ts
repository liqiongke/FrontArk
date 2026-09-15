import type HandlerViewBase from '@/handler/handlerViewBase';
import { isString } from 'lodash';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { type DPath, type IStoreBase, PathKey } from './interface';
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
    devtools(
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
        /**
         * 获取视图ID对应的视图配置
         * 注意:返回值必须保持引用稳定(zustand v5 的 selector 依赖 useSyncExternalStore,
         * 要求快照可缓存),查不到时返回 undefined,不可返回新建对象,否则会导致无限重渲染
         */
        getView: (viewId?: string) => getView(viewId, get),
        setViewParams: (viewId: string, values: any, init?: boolean) =>
          setViewParams(viewId, values, init, set),
        setViewParamByKey: (viewId: string, key: string, value: string) =>
          setViewParamByKey(viewId, key, value, set),
        /**
         * 获取视图ID对应的参数集合
         * 注意:返回值必须保持引用稳定,查不到时返回 undefined,不可返回新建对象
         */
        getViewParams: (viewId: string | undefined) => getViewParams(viewId, get),
        /**
         * 获取视图ID指定key的参数
         * 注意:返回值必须保持引用稳定,查不到时返回 undefined,不可返回新建对象
         */
        getViewParamByKey: (viewId: string, key: string) => getViewParamByKey(viewId, key, get),

        // 工具栏
        getHandler: (viewId?: string) => getHandler(viewId, get),
        setHandler: (viewId: string, handler: HandlerViewBase) => setHandler(viewId, handler, set),

        // 数据类
        setData: (path: DPath, value: any) => setData(path, value, get, set),
        setDataByFn: (path: DPath, dataFn: (data: any) => any) => setDataByFn(path, dataFn, get, set),
        setDataDebounce: (path: DPath, value: any) => setDataDebounce(path, value, get),
        /**
         * 获取指定路径的数据
         * 注意:返回值必须保持引用稳定(zustand v5 的 selector 依赖 useSyncExternalStore,
         * 要求快照可缓存),路径无数据时返回 undefined,不可返回新建对象/数组,否则会导致无限重渲染
         */
        getData: (path: DPath) => getData(path, get),
        // 根据Data的id获取对应的数据路径
        getPathByDataId: (id?: string) => (isString(id) ? [PathKey.Data, id] : undefined),

        // 数据请求相关参数
        /**
         * 获取指定视图的请求参数
         * 注意:返回值必须保持引用稳定,查不到请求时返回 undefined,不可返回新建的空对象
         */
        getReqParams: (viewId: string) => StoreReq.getReqParams(viewId),
        // 重新发送请求
        refreshByViewId: (viewId: string) => StoreReq.send(viewId),
      })),
      {
        // 仅开发环境连接 Redux DevTools,生产构建 enabled=false 时中间件近似透传,无额外开销
        name: 'page-store',
        enabled: import.meta.env.DEV,
      },
    ),
  );
};

export default createBaseStore;
