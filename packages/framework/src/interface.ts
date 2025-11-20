import type { StoreApi, UseBoundStore } from 'zustand';
import type { ViewItem } from './comp/view/interface';
import ViewBase from './comp/viewBase';
import DataBase from './data/dataBase';
import HandlerBase from './handler/handlerBase';
import { type DPath, type IStoreBase } from './stores/store/interface';
import StoreContext from './stores/store/storeContext';
import PathUtils from './utils/pathUtils';
import CtrlFactory from './comp/ctrlFactory';
import { CtrlType } from './comp/control/interface';
import useValue from './stores/store/useStoreValue';

export type { DPath, IStoreBase };

export { HandlerBase };

export { StoreContext, useValue };

export { ViewBase };
export type { ViewItem };

export { PathUtils };

export { CtrlFactory, CtrlType };

export { DataBase };

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
