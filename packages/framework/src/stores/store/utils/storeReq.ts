import { SysDataProps } from '@/data/interface';
import { get, isArray, isFunction, isString, isUndefined, set } from 'lodash';
import { IStoreBase, PathKey } from '../interface';
import { NetDataUtils } from '@/utils/netUtils/netDataUtils';
import NetUtils from '@/utils/netUtils';

/**
 * 数据请求类
 */
export default class StoreReq {
  static zGet: () => IStoreBase;
  static zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void;
  /**
   * @name 初始化请求工具
   */
  public static init = (
    zGet: () => IStoreBase,
    zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
  ) => {
    this.zGet = zGet;
    this.zSet = zSet;
  };

  /**
   * 根据ViewId获取Req请求参数
   */
  public static getReqByViewId = (viewId: string, store: IStoreBase): SysDataProps | undefined => {
    const view = store.getView(viewId);
    if (isUndefined(view)) {
      return;
    }
    const path = view.path;
    if (isString(path)) {
      return get(store.req, path);
    }

    if (isArray(path) && path.length > 0 && isString(path[0])) {
      return get(store.req, path[0]);
    }
  };

  /**
   * 获取指定视图的请求参数
   */
  public static getReqParams = (viewId: string) => {
    const req = StoreReq.getReqByViewId(viewId, this.zGet());

    if (isUndefined(req)) {
      return {};
    }

    return req.criteria;
  };

  /**
   * 触发所有的数据请求
   */
  public static fetchAllReq = () => {
    const req = this.zGet().req;

    // 遍历所有的请求,只触发没有父组件的请求
    Object.keys(req).forEach((dataId) => {
      const dataReq = req[dataId];
      if (isUndefined(dataReq.parentIds) || dataReq.parentIds.length === 0) {
        this.fetchData(dataId);
      }
    });
  };

  // 发送数据请求
  public static fetchData = async (reqId: string): Promise<any> => {
    const dataReq = get(this.zGet().req, reqId);

    if (isUndefined(dataReq)) {
      console.warn(`数据请求不存在`);
      return;
    }

    // 检查依赖关系
    if (dataReq.parentIds && dataReq.parentIds.length > 0) {
      const parentData = await this.checkDependencies(dataReq.parentIds);
      if (!parentData) {
        console.warn(`数据请求${dataReq.id}的依赖数据[${dataReq.parentIds}]未就绪`);
        return;
      }
    }

    // 构建请求参数
    const params = this.buildRequestParams(dataReq);

    // 发送请求
    return this.getReqData(dataReq, params);
  };

  /**
   * 检查依赖数据
   */
  public static checkDependencies = async (parentIds: string[]): Promise<boolean> => {
    const store = StoreReq.zGet();
    for (const parentId of parentIds) {
      const parentData = get(store.data, parentId);
      if (isUndefined(parentData)) {
        // 如果依赖数据不存在，尝试获取依赖数据
        await this.fetchData(parentId);
        const updatedParentData = get(store.data, parentId);
        if (isUndefined(updatedParentData)) {
          return false;
        }
      }
    }
    return true;
  };

  /**
   * 构建请求参数
   */
  private static buildRequestParams = (dataReq: SysDataProps): Record<string, any> => {
    const params: Record<string, any> = dataReq.criteria ?? {};
    const store = this.zGet();

    if (!isArray(dataReq.params)) {
      return {};
    }

    dataReq.params.forEach((item) => {
      if (isUndefined(get(params, item.field)) && !isUndefined(item.value)) {
        set(params, item.field, item.value);
        return;
      }
      if (!isUndefined(item.path)) {
        const val = store.getData(item.path);
        set(params, item.field, val);
      }
    });

    return params;
  };

  /**
   * 获取数据函数
   */
  public static getReqData = async (
    req: SysDataProps,
    params: Record<string, any>,
  ): Promise<any> => {
    // 发送网络请求获取数据
    if (isString(req.url) && req.url.length > 0) {
      try {
        const result = await NetUtils.get(req.url, params);

        // 处理数据格式化
        let data = get(result, 'data');
        if (isFunction(req.format)) {
          data = req.format(data);
        }

        // 提取关键数据
        const coreData = NetDataUtils.extractCoreData(data);

        // 存储数据
        const cData = NetDataUtils.initData(coreData.data, req);
        this.zGet().setData(req.id, cData);
        // 这里应该还要额外的数据信息到reqData数据中
        this.zGet().setData([PathKey.Req, req.id, 'params'], coreData.params);

        // 触发子节点请求
        if (req.childIds && req.childIds.length > 0) {
          await this.triggerRequests(req.childIds);
        }

        return cData;
      } catch (error) {
        console.error(`数据请求${req.id}失败:`, error);
        throw error;
      }
    }

    this.zGet().setData(req.id, NetDataUtils.initData(req.defaultData, req));
    return req.defaultData;
  };

  /**
   * 指定id的节点数据请求
   * @param childIds
   */
  private static triggerRequests = async (childIds: string[]): Promise<void> => {
    for (const childId of childIds) {
      await this.fetchData(childId);
    }
  };

  /**
   * 重新发送请求
   * @param viewId
   * @param zGet
   * @param zSet
   */
  public static send = (viewId: string) => {};
}
