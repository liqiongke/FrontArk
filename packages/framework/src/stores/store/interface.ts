import ViewBase from '@/comp/viewBase';
import DataBase from '@data/dataBase';
import HandlerBase from 'src/handler/handlerBase';
import { SysDataProps } from '../../data/interface';
import HandlerViewBase from '@/handler/handlerViewBase';
import { ViewStructType } from '@/comp/view/interface';

// 视图在store中的存储类型
export interface ViewStore {
  // 原始视图
  [PathKey.Root]?: ViewBase<any, any>;
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

// 页面请求中参数类型
export enum ParamKey {
  SysHead = '@',
  // 焦点键值
  Active = '@Active',
  // 焦点的路径
  ActivePath = '@ActivePath',
  // 选中项
  Select = '@Select',
  // 是否开启控制参数
  Open = '@Open',
  // 返回所有的参数
  All = '@All',
}

// 特殊路径分隔符
export const PathSplit: string = ':';

// 取值中的通用参数
export enum PathKey {
  SysHead = '@',
  // 焦点行数据
  Active = ParamKey.Active,
  // 路由
  Route = '@Route',
  // 数据
  Data = '@Data',
  // 请求
  Req = '@Req',
  // 视图
  View = '@View',
  // 视图参数
  ViewParam = '@ViewParam',
  // 根节点
  Root = '@Root',
}

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
  init: <H extends HandlerBase, D extends DataBase>(
    ViewClass: new (handler: H, data: D) => ViewBase<H, D>,
    DataClass: new () => D,
    HandlerClass: new () => H,
  ) => [ViewBase<H, D> | undefined, string[]];
  // 视图信息设置
  // 设置视图
  setView: (viewId: string, view: any) => void;
  // 获取视图
  getView: (viewId?: string) => ViewStructType;
  // 视图参数设置
  // 批量视图参数,init参数,设置是否初始化视图参数
  setViewParams: (viewId: string, values: any, init?: boolean) => void;
  // 设置视图参数
  setViewParamByKey: (viewId: string, key: string, value: any) => void;
  // 获取视图参数
  getViewParams: (viewId: string) => any;
  // 获取指定视图参数
  getViewParamByKey: (viewId: string, key: string) => any;

  // 获取视图handler
  getHandler: (viewId?: string) => HandlerViewBase | undefined;
  // 设置视图handler
  setHandler: (viewId: string, handler: HandlerViewBase) => void;

  // 数据源设置
  // 设置指定路径下的数据
  setData: (path: DPath, data: any) => void;
  // 使用函数方式设置数据
  setDataByFn: (path: DPath, dataFn: (data: any) => void) => void;
  // 设置指定路径下的数据,缓动触发
  setDataDebounce: (path: DPath, data: any) => void;
  // 获取指定路径下的数据
  getData: (path: DPath) => any;
  // 根据Data的id获取对应的请求路径,因为所有的dataPath都是存储在data中的
  getPathByDataId: (id?: string) => DPath;

  // 数据请求相关参数
  getReqParams: (viewId: string) => { [key: string]: any };
  // 刷新请求
  refreshByViewId: (viewId: string) => void;
}

export interface IStoreBase extends IStoreData, IStoreActions {}
