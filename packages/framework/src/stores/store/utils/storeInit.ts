import { ViewType } from '@/comp/view/interface';
import { get, isUndefined } from 'lodash';
import DataBase from 'src/data/dataBase';
import HandlerBase from 'src/handler/handlerBase';
import ViewBase from '../../../comp/viewBase';
import { IStoreBase, PathKey } from '../interface';
import { initDataAndReq } from './storeData';
import StoreReq from './storeReq';
import { initView } from './storeView';

// 预渲染类型,需要在初始化页面的时候,将组件渲染到视图上
const PreRenderType = [ViewType.LayoutModal, ViewType.LayoutDrawer];

// 初始化store,并返回视图实例
export const initStore = <H extends HandlerBase, D extends DataBase>(
  ViewClass: new (handler: H, data: D) => ViewBase<H, D>,
  DataClass: new () => D,
  HandlerClass: new () => H,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
  zGet: () => IStoreBase,
): [ViewBase<H, D> | undefined, string[]] => {
  const viewKeys = Object.getOwnPropertyNames(zGet().view);

  if (viewKeys.length > 0) {
    const sourceView = zGet().view[PathKey.Root];
    return [sourceView, getPreRenderIds(sourceView)];
  }

  const handler = new HandlerClass();
  handler.init(zGet);
  StoreReq.init(zGet, zSet);

  // 初始化视图
  const data = new DataClass();
  const view = new ViewClass(handler, data);
  const viewStore = initView(view);

  // 初始化数据源
  const [dataStore, dataReqStore] = initDataAndReq(data);
  zSet((state) => {
    state.req = dataReqStore;
    state.data = dataStore;
    state.view = viewStore;
    return state;
  });

  // 发送初始化数据的请求
  StoreReq.fetchAllReq();

  return [view, getPreRenderIds(view)];
};

const getPreRenderIds = (view?: ViewBase<any, any>) => {
  const preRenderIds: string[] = [];
  if (isUndefined(view)) {
    return preRenderIds;
  }
  // 遍历view自身的属性,找到所有类型符合PreRenderType的,并将其添加到preRenderIds中
  const viewKeys = Object.keys(view);
  for (const v of viewKeys) {
    const viewItem = get(view, v);
    if (isUndefined(viewItem.type) || isUndefined(viewItem.id)) {
      continue;
    }
    if (PreRenderType.includes(viewItem.type) && !preRenderIds.includes(viewItem.id)) {
      preRenderIds.push(viewItem.id);
    }
  }
  return preRenderIds;
};
