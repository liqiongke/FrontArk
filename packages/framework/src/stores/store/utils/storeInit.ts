import DataBase from 'src/data/dataBase';
import HandlerBase from 'src/handler/handlerBase';
import ViewBase from '../../../comp/viewBase';
import { IStoreBase } from '../interface';
import { initDataAndReq } from './storeData';
import { initView } from './storeView';

// 初始化store,并返回视图实例
export const initStore = <H extends HandlerBase, D extends DataBase>(
  ViewClass: new (handler: H, data: D) => ViewBase<H, D>,
  DataClass: new () => D,
  HandlerClass: new () => H,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
  zGet: () => IStoreBase,
): [ViewBase<H, D> | undefined, H | undefined] => {
  const handler = new HandlerClass();
  handler.init(zGet);

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

  return [view, handler];
};
