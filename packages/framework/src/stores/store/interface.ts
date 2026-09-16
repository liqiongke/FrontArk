import type ViewBase from '@/comp/viewBase';
import type DataBase from '@data/dataBase';
import type HandlerBase from '@/handler/handlerBase';
import { type SysDataProps } from '../../data/interface';
import type HandlerViewBase from '@/handler/handlerViewBase';
import { type ViewStructType } from '@/comp/view/interface';

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

// 数据请求运行状态
export type ReqStatus = 'idle' | 'pending' | 'success' | 'error';

// 单个数据请求的运行信息(与请求声明 SysDataProps 分离,避免覆盖参数声明)
export interface ReqMetaInfo {
  status: ReqStatus;
  // 最近一次错误信息
  error?: string;
  // 响应元信息(如分页参数 @pagination/@active)
  responseParams?: any;
  // 最近一次状态变更时间戳
  updatedAt?: number;
}

export interface ReqMetaStore {
  [reqId: string]: ReqMetaInfo | undefined;
}

// 视图方法在store中的存储类型
export interface HandlerStore {
  [key: string]: any;
}

// 数据路径
export type DPath = string | number | (string | number)[] | undefined;

// store 更新函数类型
// action 参数用于在 Redux DevTools 中标注动作来源(如 'setData:@Data.table'),仅开发环境生效
export type ZSet = (
  state: IStoreBase | ((state: IStoreBase) => IStoreBase),
  replace?: false,
  action?: { type: string; [key: string]: unknown },
) => void;

// 取值中的通用参数
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
  // 按行键值定位数据行(与渲染下标无关,列表重排/翻页后仍指向同一记录)
  Row = '@Row',
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
  // 数据请求运行状态(与请求声明分离存储)
  reqMeta: ReqMetaStore;
  // 存储视图
  view: ViewStore;
  // 存储视图参数
  viewParams: ViewParamsStore;
  // 存储视图方法
  handler: HandlerStore;
}

export interface IStoreActions {
  // 初始化视图(纯初始化,不发起请求;请求由 startRequests 在提交后启动)
  init: <H extends HandlerBase, D extends DataBase>(
    ViewClass: new (handler: H, data: D) => ViewBase<H, D>,
    DataClass: new () => D,
    HandlerClass: new () => H,
  ) => [ViewBase<H, D> | undefined, string[]];
  // 启动初始数据请求(幂等,可在 StrictMode 效应重放时重复调用)
  startRequests: () => void;
  // 释放页面运行时:提交未落盘的防抖输入、取消进行中的请求
  dispose: () => void;
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
  // 获取视图参数(viewId 允许为空,为空时返回 undefined)
  getViewParams: (viewId: string | undefined) => any;
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
  // 设置指定路径下的数据,缓动触发(计时器按页面 store 隔离)
  setDataDebounce: (path: DPath, data: any) => void;
  // 立即提交指定路径(缺省为全部)的防抖待写数据
  flushData: (path?: DPath) => void;
  // 获取指定路径下的数据
  getData: (path: DPath) => any;
  // 根据Data的id获取对应的数据路径,因为所有的dataPath都是存储在data中的
  getPathByDataId: (id?: string) => DPath;

  // 数据请求相关参数,找不到对应请求时返回 undefined(需保持引用稳定,不可返回新建空对象)
  getReqParams: (viewId: string) => { [key: string]: any } | undefined;
  // 获取视图对应的请求节点 id(view.path 字符串/数组首段,未声明时回退 view.dataId)
  getReqNodeId: (viewId: string) => string | undefined;
  // 刷新请求(先提交防抖输入再发起;resolve 为请求数据,失败/取消/业务错误时为 undefined)
  refreshByViewId: (viewId: string) => Promise<any>;
}

export interface IStoreBase extends IStoreData, IStoreActions {}
