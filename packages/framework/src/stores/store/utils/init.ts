import ViewBase from '../../../comp/viewBase';
import { DataBase, HandlerBase } from '../../../interface';
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
  console.log('开始数据初始化工作');

  const handler = new HandlerClass();
  handler.init(zGet);

  // 初始化视图
  const view = new ViewClass(handler);
  const viewStore = initView(view);

  // 初始化数据
  const [dataStore, dataReqStore] = initDataReq(new DataClass());
  zSet((state) => {
    state.req = dataReqStore;
    state.data = dataStore;
    state.view = viewStore;
    return state;
  });
  return [view, handler];
};
