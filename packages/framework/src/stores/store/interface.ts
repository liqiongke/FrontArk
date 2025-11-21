import HandlerBase from 'src/handler/handlerBase';
import { SysDataProps } from '../../data/interface';
import DataBase from '@data/dataBase';
import ViewBase from '@/comp/viewBase';

// 视图在store中的存储类型
export interface ViewStore {
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
  // 设置视图
  setView: (path: DPath, view: any) => void;
  // 获取视图
  getView: (path: DPath) => any;
  // 设置指定路径下的数据
  setData: (path: DPath, data: any) => void;
  // 获取指定路径下的数据
  getData: (path: DPath) => any;
}

export interface IStoreBase extends IStoreData, IStoreActions {}
