import type { StoreApi, UseBoundStore } from 'zustand';
import ViewBase from './comp/viewBase';
import DataBase from './data/dataBase';
import HandlerBase from './handler/handlerBase';
import { type IStoreBase } from './stores/store/interface';

// 通用键值
// 所有数据的键值
export const KeyAttr = '@key';

// 通用值类型类型
export type ValueType = string | number | boolean | undefined;

// 通用的option选项
export interface OptionItem {
  label: string;
  value: ValueType;
}

// 视图层传入参数
export interface ViewHooksProps {
  useStore: UseBoundStore<StoreApi<IStoreBase>>;
}

// 视图层传入参数
export interface ViewProps<H extends HandlerBase, D extends DataBase> {
  // useStore: UseBoundStore<StoreApi<IStoreBase>>;
  // 视图生成函数
  ViewClass: new (handler: H, data: D) => ViewBase<H, D>;
  // 数据生成函数
  DataClass: new () => D;
  // 处理函数
  HandlerClass: new () => H;
}
