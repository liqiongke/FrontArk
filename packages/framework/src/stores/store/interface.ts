import ViewBase from '@/comp/viewBase';
import DataBase from '@data/dataBase';
import HandlerBase from 'src/handler/handlerBase';
import { SysDataProps } from '../../data/interface';

// 视图在store中的存储类型
export interface ViewStore {
  [key: string]: any;
}

export interface ViewParamsStore {
  [key: string]: any;
}

// 数据在store中的存储类型
export interface DataStore {
  [key: string]: any;
}

// 数据请求在store中的存储类型
export interface DataReqStore {
  [key: string]: SysDataProps;
}

// 视图方法在store中的存储类型
export interface HandlerStore {
  [key: string]: any;
}

// 数据路径
export type DPath = string | number | (string | number)[] | undefined;

export interface IStoreData {
  // 数据
  data: DataStore;
  // 数据请求
  req: DataReqStore;
  // 存储视图
  view: ViewStore;
  // 存储视图参数
  viewParams: ViewParamsStore;
  // 存储视图方法
  handler: HandlerStore;
}

export interface IStoreActions {
  // 初始化视图
  init: <H extends HandlerBase>(
    ViewClass: new (handler: H) => ViewBase<H>,
    DataClass: new () => DataBase,
    HandlerClass: new () => H,
  ) => [ViewBase<H> | undefined, H | undefined];
  // 视图信息设置
  // 设置视图
  setView: (viewId: string, view: any) => void;
  // 获取视图
  getView: (viewId?: string) => any;

  // 视图参数设置
  // 批量视图参数,init参数,设置是否初始化视图参数
  setViewParams: (viewId: string, values: any, init?: boolean) => void;
  // 设置视图参数
  setViewParamByKey: (viewId: string, key: string, value: any) => void;
  // 获取视图参数
  getViewParams: (viewId: string) => any;

  // 数据源设置
  // 设置指定路径下的数据
  setData: (path: DPath, data: any) => void;
  // 获取指定路径下的数据
  getData: (path: DPath) => any;
}

export interface IStoreBase extends IStoreData, IStoreActions {}
