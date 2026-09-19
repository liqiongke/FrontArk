import { type SysDataProps } from '@/data/interface';
import logger from '@/utils/sysUtils/logger';
import NetUtils from '@/utils/netUtils';
import { NetDataUtils } from '@/utils/netUtils/netDataUtils';
import { cloneDeep, get, isArray, isFunction, isString, isUndefined, set } from 'lodash';
import { type DPath, type IStoreBase, PathKey, type ReqMetaInfo, type ZSet } from '../interface';
import { bindingMatches, captureBinding, type DataBinding, readReqNodeId, resolveBinding } from './storeDataPath';

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

// 防抖待写任务
interface DebounceTask {
  timer: ReturnType<typeof setTimeout>;
  // 入队时冻结行身份，提交时重新定位，不能缓存数组下标
  binding: DataBinding;
  value: any;
}

/**
 * 页面运行时:每个页面 store 对应一个实例
 * 请求去重/竞态取消/重试的登记与防抖计时器均为实例成员,按页面隔离,
 * 杜绝多页面并存时的跨页面请求串扰与防抖互踩
 */
export default class PageRuntime {
  private readonly zGet: () => IStoreBase;
  private readonly zSet: ZSet;
  // 进行中的请求,按数据节点 id 登记
  private inflight = new Map<string, InflightRequest>();
  // 防抖待写任务，按被冻结的数据源和行身份字段登记
  private debounceTimers = new Map<string, DebounceTask>();
  // 页面是否已释放:释放后不再调度新请求/防抖写入
  private disposed = false;

  constructor(zGet: () => IStoreBase, zSet: ZSet) {
    this.zGet = zGet;
    this.zSet = zSet;
  }

  /** 视图对应的请求节点 id:view.path 字符串/数组首段,未声明时回退 view.dataId */
  public getReqNodeId = (viewId: string): string | undefined =>
    readReqNodeId(this.zGet(), viewId);

  /**
   * 获取指定视图的搜索条件(criteria)
   * 注意:返回值必须保持引用稳定(zustand v5 的 selector 依赖 useSyncExternalStore),
   * 找不到请求时返回 undefined,不可返回新建的空对象,否则会导致无限重渲染
   */
  public getReqParams = (viewId: string) => {
    const reqId = this.getReqNodeId(viewId);
    if (isUndefined(reqId)) {
      return undefined;
    }
    return get(this.zGet().req, [reqId, 'criteria']);
  };

  /**
   * 启动所有无父节点的初始请求(幂等:重复调用由 inflight 去重与 disposed 状态保证安全;
   * StrictMode 效应重放/重新挂载时重新激活运行时)
   */
  public startRequests = () => {
    this.disposed = false;
    const req = this.zGet().req;
    Object.keys(req).forEach((dataId) => {
      const dataReq = req[dataId];
      if (isUndefined(dataReq.parentIds) || dataReq.parentIds.length === 0) {
        this.fetchData(dataId);
      }
    });
  };

  /**
   * 释放页面运行时:
   * 1. 立即提交未落盘的防抖输入(避免输入丢失)
   * 2. 取消进行中的请求(竞态 abort)
   * 3. 不再调度新的请求/防抖写入
   */
  public dispose = () => {
    this.disposed = true;
    this.flushData();
    this.inflight.forEach((entry) => entry.controller.abort());
    this.inflight.clear();
  };

  /** 重新请求指定视图对应的数据 */
  public refreshByViewId = (viewId: string): Promise<any> => {
    const reqId = this.getReqNodeId(viewId);
    if (isUndefined(reqId)) {
      logger.warn(`视图${viewId}对应的请求节点不存在`);
      return Promise.resolve(undefined);
    }
    this.flushDataScope([PathKey.Req, reqId, 'criteria']);
    return this.fetchData(reqId);
  };

  /**
   * 缓动写入:同一解析路径的连续写入合并为最后一次(默认300ms),
   * 计时器按页面实例隔离;引用未解析时拒绝调度,避免落错位置
   */
  public setDataDebounce = (path: DPath, value: any, delay: number = 300) => {
    if (this.disposed || isUndefined(path)) {
      return;
    }
    const binding = captureBinding(this.zGet(), path);
    if (isUndefined(binding)) {
      logger.warn(`防抖写入路径未解析,拒绝调度:${JSON.stringify(path)}`);
      return;
    }
    const key = JSON.stringify(binding);
    const prev = this.debounceTimers.get(key);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.commitEdit(binding, value);
    }, delay);
    this.debounceTimers.set(key, { timer, binding, value });
  };

  private commitEdit = (binding: DataBinding, value: any) => {
    const path = resolveBinding(this.zGet(), binding);
    if (isUndefined(path)) {
      logger.warn(`防抖目标记录已不存在,丢弃写入:${JSON.stringify(binding)}`);
      return;
    }
    this.zGet().setData(path, value);
  };

  /** 精确路径接口保持原语义，不传路径表示全部待写任务。 */
  public flushData = (path?: DPath) => this.finishEdits(path, true, false);
  public cancelData = (path?: DPath) => this.finishEdits(path, true, true);
  public flushDataScope = (path: DPath) => {
    if (!isUndefined(path)) this.finishEdits(path, false, false);
  };
  public cancelDataScope = (path: DPath) => {
    if (!isUndefined(path)) this.finishEdits(path, false, true);
  };

  private finishEdits = (path: DPath, exact: boolean, cancel: boolean) => {
    const scope = isUndefined(path) ? undefined : captureBinding(this.zGet(), path);
    if (!isUndefined(path) && isUndefined(scope)) return;
    const cancelled: string[] = [];
    // 先移除选中任务再提交，防止订阅回调登记的新任务被同一轮迭代消费。
    const tasks = [...this.debounceTimers].filter(([, task]) =>
      isUndefined(scope) || bindingMatches(task.binding, scope, exact),
    );
    tasks.forEach(([key, task]) => {
      clearTimeout(task.timer);
      this.debounceTimers.delete(key);
    });
    tasks.forEach(([key, task]) => {
      if (cancel) cancelled.push(key);
      else this.commitEdit(task.binding, task.value);
    });
    if (cancelled.length > 0) {
      this.zSet((state) => {
        cancelled.forEach((key) => {
          state.inputResetVersions[key] = (state.inputResetVersions[key] ?? 0) + 1;
        });
        return state;
      }, false, { type: 'cancelEdits' });
    }
  };

  /**
   * 请求入口:resolve-only(内部消化异常,不产生 unhandled rejection)
   * 返回请求数据;失败/取消/业务错误时 resolve undefined
   */
  public fetchData = (reqId: string, visited?: ReadonlySet<string>): Promise<any> => {
    return this.doFetchData(reqId, visited).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`数据请求${reqId}失败:${message}`);
      this.writeReqMeta(reqId, { status: 'error', error: message });
      return undefined;
    });
  };

  private doFetchData = async (reqId: string, visited?: ReadonlySet<string>): Promise<any> => {
    if (this.disposed) {
      return undefined;
    }
    // 等待环检测:依赖链上重复出现当前节点,说明声明存在循环(初始化期已报错,运行时兜底安全退出)
    if (visited?.has(reqId)) {
      logger.error(`数据请求${reqId}在依赖链中重复出现,疑似循环依赖,终止本次请求`);
      return undefined;
    }
    const dataReq = get(this.zGet().req, reqId);
    if (isUndefined(dataReq)) {
      logger.warn(`数据请求${reqId}不存在`);
      return undefined;
    }

    // 依赖就绪检查:父数据缺失时先等待父请求完成
    const nextVisited = new Set(visited);
    nextVisited.add(reqId);
    if (isArray(dataReq.parentIds) && dataReq.parentIds.length > 0) {
      const ready = await this.checkDependencies(dataReq.parentIds, nextVisited);
      if (!ready) {
        logger.warn(`数据请求${dataReq.id}的依赖数据[${dataReq.parentIds.join(',')}]未就绪`);
        return undefined;
      }
      // 依赖等待期间,本数据可能已由父请求完成时扇出的子请求写入,直接复用避免重复请求
      const existing = get(this.zGet().data, reqId);
      if (!isUndefined(existing)) {
        return existing;
      }
    }

    this.writeReqMeta(reqId, { status: 'pending', error: undefined });

    // 构建请求参数(拷贝 criteria,不修改 store 内的声明对象)
    const params = this.buildRequestParams(dataReq);
    return this.getReqData(dataReq, params);
  };

  /**
   * 检查依赖数据:已就绪的父节点直接通过(含本链上父请求刚写入的场景);
   * 未就绪时若在等待链上则判定为循环依赖,否则递归获取并取最新快照判定
   */
  private checkDependencies = async (
    parentIds: string[],
    visited: ReadonlySet<string>,
  ): Promise<boolean> => {
    for (const parentId of parentIds) {
      // 数据已就绪:正常父子链中父请求先完成并写入,到达此处即通过,不构成环
      if (!isUndefined(get(this.zGet().data, parentId))) {
        continue;
      }
      // 数据未就绪且父节点正在等待链上:父在等当前节点,循环依赖
      if (visited.has(parentId)) {
        logger.error(`数据依赖存在循环:${[...visited, parentId].join('→')}`);
        return false;
      }
      await this.fetchData(parentId, visited);
      if (isUndefined(get(this.zGet().data, parentId))) {
        return false;
      }
    }
    return true;
  };

  /**
   * 构建请求参数(深拷贝 criteria,不修改 store 内的声明/冻结对象)
   * 取值契约(同名字段冲突时):criteria(用户输入) > param.value(显式声明) > param.path(数据引用)
   */
  private buildRequestParams = (dataReq: SysDataProps): Record<string, any> => {
    const params: Record<string, any> = isUndefined(dataReq.criteria)
      ? {}
      : cloneDeep(dataReq.criteria);
    if (!isArray(dataReq.params)) {
      return params;
    }
    const store = this.zGet();
    dataReq.params.forEach((item) => {
      if (!isUndefined(get(params, item.field))) {
        return;
      }
      if (!isUndefined(item.value)) {
        set(params, item.field, item.value);
        return;
      }
      if (!isUndefined(item.path)) {
        set(params, item.field, store.getData(item.path));
      }
    });
    return params;
  };

  /**
   * 请求数据并提交:数据与请求运行状态(reqMeta)在同一事务中写入,
   * 响应元信息写入 reqMeta.responseParams,不再覆盖请求参数声明
   */
  private getReqData = async (req: SysDataProps, params: Record<string, any>): Promise<any> => {
    // 无 url 节点:以默认数据填充,并继续触发子请求
    if (!isString(req.url) || req.url.length === 0) {
      const defaultData = NetDataUtils.initData(req.defaultData, req);
      this.commitResponse(req.id, defaultData, undefined);
      await this.triggerChildren(req);
      return defaultData;
    }

    const result = await this.sendWithLifecycle(req, params);
    // 请求被新的同类请求取代(竞态取消),静默退出,不写数据/不触发子请求
    if (isUndefined(result)) {
      return undefined;
    }

    // 业务错误:统一结果封装中 code 非 200 视为失败,不写数据
    const code = get(result, 'code');
    if (!isUndefined(code) && code !== 200) {
      const message = get(result, 'message') ?? `code:${code}`;
      logger.error(`数据请求${req.id}业务错误:${message}`);
      this.writeReqMeta(req.id, { status: 'error', error: `业务错误:${message}` });
      return undefined;
    }

    let data = get(result, 'data');
    if (isFunction(req.format)) {
      data = req.format(data);
    }
    const coreData = NetDataUtils.extractCoreData(data);
    const cData = NetDataUtils.initData(coreData.data, req);
    this.commitResponse(req.id, cData, coreData.params);

    await this.triggerChildren(req);
    return cData;
  };

  /**
   * 触发子节点请求(并行):
   * 仅数据未就绪的子节点参与(已就绪的跳过,避免重复提交);
   * 子请求以空等待链开始(父节点已完成,不携带父的 visited,避免正常父子链误判为环)
   */
  private triggerChildren = async (req: SysDataProps) => {
    if (!isArray(req.childIds) || req.childIds.length === 0) {
      return;
    }
    const pending = req.childIds.filter((childId) =>
      isUndefined(get(this.zGet().data, childId)),
    );
    if (pending.length === 0) {
      return;
    }
    await Promise.all(pending.map((childId) => this.fetchData(childId)));
  };

  /** 单次提交:数据 + 请求运行状态(同一事务,订阅方不会观察到中间态) */
  private commitResponse = (reqId: string, data: any, responseParams: any) => {
    this.zSet(
      (state: IStoreBase) => {
        set(state.data, reqId, data);
        state.reqMeta[reqId] = {
          status: 'success',
          responseParams,
          updatedAt: Date.now(),
        };
        return state;
      },
      false,
      { type: 'reqCommit', reqId },
    );
  };

  /** 更新请求运行状态(与请求声明 SysDataProps 分离存储,不覆盖参数声明) */
  private writeReqMeta = (reqId: string, info: ReqMetaInfo) => {
    this.zSet(
      (state: IStoreBase) => {
        state.reqMeta[reqId] = { ...state.reqMeta[reqId], ...info };
        return state;
      },
      false,
      { type: 'reqMeta', reqId },
    );
  };

  /**
   * 请求生命周期:登记进行中状态 -> 去重/取消旧请求 -> 带重试发送 -> 注销登记
   * 被取消时返回 undefined;其余情况返回响应数据或抛出异常
   */
  private sendWithLifecycle = async (
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
  private attemptSend = async (
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
}
