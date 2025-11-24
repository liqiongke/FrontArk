import type { StoreApi, UseBoundStore } from 'zustand';
import ViewBase from './comp/viewBase';
import DataBase from './data/dataBase';
import HandlerBase from './handler/handlerBase';
import { type IStoreBase } from './stores/store/interface';

// 所有数据的键值
export const KeyAttr = '@key';

// 视图层传入参数
export interface ViewHooksProps {
  useStore: UseBoundStore<StoreApi<IStoreBase>>;
}

// 视图层传入参数
export interface ViewProps<H extends HandlerBase> {
  // useStore: UseBoundStore<StoreApi<IStoreBase>>;
  // 视图生成函数
  ViewClass: new (handler: H) => ViewBase<H>;
  // 数据生成函数
  DataClass: new () => DataBase;
  // 处理函数
  HandlerClass: new () => H;
}
