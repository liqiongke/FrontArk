import DataBase from 'src/data/dataBase';
import HandlerBase from 'src/handler/handlerBase';
import ViewBase from '../../../comp/viewBase';
import { IStoreBase } from '../interface';
import { initDataReq } from './data';
import { initView } from './view';

// 初始化store,并返回视图实例
export const initStore = <H extends HandlerBase>(
  ViewClass: new (handler: H) => ViewBase<H>,
  DataClass: new () => DataBase,
  HandlerClass: new () => H,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
  zGet: () => IStoreBase,
): [ViewBase<H> | undefined, H | undefined] => {

  const handler = new HandlerClass();
  handler.init(zGet);

  // 初始化视图
  const view = new ViewClass(handler);
  const viewStore = initView(view);

  // 初始化数据源
  const [dataStore, dataReqStore] = initDataReq(new DataClass());
  zSet((state) => {
    state.req = dataReqStore;
    state.data = dataStore;
    state.view = viewStore;
    return state;
  });

  return [view, handler];
};
