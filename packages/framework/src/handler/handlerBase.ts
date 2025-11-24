import { SysDataProps } from '@/data/interface';
import NetUtils from '@/utils/netUtils';
import { DataUtils } from '@/utils/netUtils/dataUtils';
import { get, isFunction, isString, isUndefined } from 'lodash';
import { DPath, IStoreBase } from 'src/stores/store/interface';

// 操作基类
abstract class HandlerBase {
  private getStore!: () => IStoreBase;

  // 初始化操作
  init(getStore: () => IStoreBase) {
    this.getStore = getStore;
  }

  initDataReq() {
    const store = this.getStore();

    // 遍历所有的请求,只触发没有父组件的请求
    for (const dataId in store.req) {
      const dataReq = store.req[dataId];
      if (isUndefined(dataReq.parentIds) || dataReq.parentIds.length === 0) {
        this.fetchData(dataId);
      }
    }
  }

  // 获取数据
  public getData(path?: DPath) {
    return this.getStore().getData(path);
  }

  // 获取所有数据
  public getAllData() {
    return this.getStore().data;
  }

  // 保存数据
  public setData(path: DPath, value: any) {
    this.getStore().setData(path, value);
  }

  // 设置视图参数
  public setViewParams(path: DPath, value: any) {
    this.getStore().setViewParams(path, value);
  }

  // 发送数据请求
  async fetchData(dataId: string): Promise<any> {
    const store = this.getStore();
    const dataReq = get(store.req, dataId);
    if (isUndefined(dataReq)) {
      console.warn(`数据请求${dataId}不存在`);
      return;
    }

    // 检查依赖关系
    if (dataReq.parentIds && dataReq.parentIds.length > 0) {
      const parentData = await this.checkDependencies(dataReq.parentIds);
      if (!parentData) {
        console.warn(`数据请求${dataId}的依赖数据未就绪`);
        return;
      }
    }

    // 构建请求参数
    const params = await this.buildRequestParams(dataReq);

    // 发送请求
    return this.getReqData(dataReq, params);
  }

  // 检查依赖数据
  private async checkDependencies(parentIds: string[]): Promise<boolean> {
    const store = this.getStore();
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
  }

  // 构建请求参数
  private async buildRequestParams(dataReq: any): Promise<Record<string, any>> {
    const params: Record<string, any> = {};
    const store = this.getStore();

    if (dataReq.params) {
      for (const param of dataReq.params) {
        if (param.path && isString(param.path)) {
          const value = get(store.data, param.path);
          if (!isUndefined(value)) {
            params[param.field] = value;
          }
        }
      }
    }

    return params;
  }

  // 获取数据函数
  private async getReqData(req: SysDataProps, params: Record<string, any>): Promise<any> {
    // 1.如果path不为空,则根据path获取数据
    if (!isUndefined(req.path)) {
      const result = this.getData(req.path);
      this.setData(req.id, DataUtils.initData(result, req));
      return result;
    }

    // 2.发送网络请求获取数据
    if (isString(req.url) && req.url.length > 0) {
      try {
        const result = await NetUtils.get(req.url, params);

        // 处理数据格式化
        let data = get(result, 'data');
        if (isFunction(req.format)) {
          data = req.format(data);
        }

        // 提取关键数据
        const coreData = DataUtils.extractCoreData(data);

        // 存储数据
        const cData = DataUtils.initData(coreData.data, req);
        this.setData(req.id, cData);
        this.setViewParams(req.id, coreData.params);

        // 触发子节点请求
        if (req.childIds && req.childIds.length > 0) {
          await this.triggerChildRequests(req.childIds);
        }

        return cData;
      } catch (error) {
        console.error(`数据请求${req.id}失败:`, error);
        throw error;
      }
    }

    this.setData(req.id, DataUtils.initData(req.defaultData, req));
    return req.defaultData;
  }

  // 触发子节点请求
  private async triggerChildRequests(childIds: string[]): Promise<void> {
    for (const childId of childIds) {
      await this.fetchData(childId);
    }
  }
}
export default HandlerBase;
