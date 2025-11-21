import fetch from 'axios';
import { get, isFunction, isString, isUndefined } from 'lodash';
import { DPath, IStoreBase } from 'src/stores/store/interface';

const BASE_URL = 'http://127.0.0.1:4523/m1/7233118-6959636-default';

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

  // 操作数据
  public setData(path: DPath, value: any) {
    this.getStore().setData(path, value);
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
    if (dataReq.url) {
      return this.sendRequest(dataReq.url, params, dataReq);
    }
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

  // 发送实际请求
  private async sendRequest(url: string, params: Record<string, any>, dataReq: any): Promise<any> {
    try {
      // 使用全局配置的fetch发送请求
      const result = await fetch({ url: `${BASE_URL}${url}`, method: 'GET', params });

      // 处理数据格式化
      let formattedData = get(result.data, 'data');
      if (isFunction(dataReq.format)) {
        formattedData = dataReq.format(formattedData);
      }

      // 存储数据
      this.setData(dataReq.id, formattedData);

      // 触发子节点请求
      if (dataReq.childIds && dataReq.childIds.length > 0) {
        await this.triggerChildRequests(dataReq.childIds);
      }

      return formattedData;
    } catch (error) {
      console.error(`数据请求${dataReq.id}失败:`, error);
      throw error;
    }
  }

  // 触发子节点请求
  private async triggerChildRequests(childIds: string[]): Promise<void> {
    for (const childId of childIds) {
      await this.fetchData(childId);
    }
  }
}
export default HandlerBase;
