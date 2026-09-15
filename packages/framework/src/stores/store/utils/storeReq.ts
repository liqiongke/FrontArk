import { type SysDataProps } from '@/data/interface';
import logger from '@/utils/sysUtils/logger';
import { get, isArray, isFunction, isString, isUndefined, set } from 'lodash';
import { type IStoreBase, PathKey, type ZSet } from '../interface';
import { NetDataUtils } from '@/utils/netUtils/netDataUtils';
import NetUtils from '@/utils/netUtils';

// 重试基础延迟(毫秒),按重试次数线性递增:300ms、600ms、900ms...
const RETRY_BASE_DELAY = 300;

// 进行中的请求登记:用于请求去重与竞态取消
interface InflightRequest {
  // 共享的请求 Promise(相同参数的并发请求复用)
  promise: Promise<any>;
  // 取消控制器:新请求取代旧请求时 abort
  controller: AbortController;
  // 请求参数序列化结果,用于判断并发请求是否相同
  serialized: string;
}

/**
 * 数据请求类
 */
export default class StoreReq {
  static zGet: () => IStoreBase;
  static zSet: ZSet;
  // 进行中的请求,按数据节点 id 登记
  static inflight = new Map<string, InflightRequest>();

  /**
   * @name 初始化请求工具
   */
  public static init = (zGet: () => IStoreBase, zSet: ZSet) => {
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
   * 注意:返回值必须保持引用稳定(zustand v5 的 selector 依赖 useSyncExternalStore,
   * 要求快照可缓存),找不到请求时返回 undefined,不可返回新建的空对象,否则会导致无限重渲染
   */
  public static getReqParams = (viewId: string) => {
    const req = StoreReq.getReqByViewId(viewId, this.zGet());

    if (isUndefined(req)) {
      return;
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
      logger.warn(`数据请求不存在`);
      return;
    }

    // 检查依赖关系
    if (dataReq.parentIds && dataReq.parentIds.length > 0) {
      const parentData = await this.checkDependencies(dataReq.parentIds);
      if (!parentData) {
        logger.warn(`数据请求${dataReq.id}的依赖数据[${dataReq.parentIds}]未就绪`);
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
   * 包含:请求去重(相同参数的并发请求共享同一 Promise)、
   * 竞态取消(新请求取代未完成的旧请求)、失败重试(按 dataReq.retry 配置)
   */
  public static getReqData = async (
    req: SysDataProps,
    params: Record<string, any>,
  ): Promise<any> => {
    // 发送网络请求获取数据
    if (isString(req.url) && req.url.length > 0) {
      const result = await this.sendWithLifecycle(req, params);
      // 请求被新的同类请求取代(竞态取消),静默退出,不再写数据/触发子请求
      if (isUndefined(result)) {
        return;
      }

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
    }

    this.zGet().setData(req.id, NetDataUtils.initData(req.defaultData, req));
    return req.defaultData;
  };

  /**
   * 请求生命周期:登记进行中状态 -> 去重/取消旧请求 -> 带重试发送 -> 注销登记
   * 被取消时返回 undefined;其余情况返回响应数据或抛出异常
   */
  private static sendWithLifecycle = async (
    req: SysDataProps,
    params: Record<string, any>,
  ): Promise<any> => {
    const key = req.id;
    const serialized = JSON.stringify(params ?? {});
    const prev = this.inflight.get(key);

    // 去重:进行中且参数相同的请求,直接复用同一个 Promise
    if (prev && prev.serialized === serialized) {
      return prev.promise;
    }

    // 竞态取消:新请求(参数不同)取代未完成的旧请求
    prev?.controller.abort();

    const controller = new AbortController();
    const promise = this.attemptSend(req, params, controller.signal).finally(() => {
      // 仅当登记未被更新的请求覆盖时才注销
      if (this.inflight.get(key)?.promise === promise) {
        this.inflight.delete(key);
      }
    });
    this.inflight.set(key, { promise, controller, serialized });

    return promise;
  };

  /**
   * 带重试的请求发送
   * @returns 响应数据;请求被取消时返回 undefined
   */
  private static attemptSend = async (
    req: SysDataProps,
    params: Record<string, any>,
    signal: AbortSignal,
  ): Promise<any> => {
    const maxRetry = Math.max(0, req.retry ?? 0);

    for (let attempt = 0; ; attempt++) {
      try {
        return await NetUtils.get(req.url as string, params, { signal });
      } catch (error) {
        // 请求被取消(竞态取消),静默退出
        if (NetUtils.isCancel(error)) {
          logger.debug(`数据请求${req.id}已被新请求取代,取消当前请求`);
          return;
        }
        if (attempt >= maxRetry) {
          logger.error(`数据请求${req.id}失败:`, error);
          throw error;
        }
        logger.warn(`数据请求${req.id}第${attempt + 1}次请求失败,准备重试`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY * (attempt + 1)));
      }
    }
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
   * @param viewId 视图ID
   */
  public static send = async (viewId: string): Promise<any> => {
    const store = this.zGet();
    const req = this.getReqByViewId(viewId, store);

    if (isUndefined(req)) {
      logger.warn(`视图${viewId}对应的请求不存在`);
      return;
    }

    // 使用现有的fetchData方法发送请求
    return this.fetchData(req.id);
  };
}
