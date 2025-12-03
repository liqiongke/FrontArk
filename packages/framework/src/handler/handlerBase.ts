import { ViewHandlerMap } from '@/comp/compFactory';
import HandlerDrawerImpl from '@/comp/view/drawer/handler/handlerDrawer';
import HandlerModalImpl from '@/comp/view/modal/handler/handlerModal';
import NetUtils from '@/utils/netUtils';
import { isUndefined } from 'lodash';
import { DPath, IStoreBase } from 'src/stores/store/interface';
import HandlerViewBase from './handlerViewBase';

// 操作基类
abstract class HandlerBase {
  private getStore!: () => IStoreBase;

  // 初始化操作
  init(getStore: () => IStoreBase) {
    this.getStore = getStore;
  }

  // 触发所有的数据请求
  initDataReq() {}

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
  public setViewParam(viewId: string, key: string, value: any) {
    this.getStore().setViewParamByKey(viewId, key, value);
  }

  // 批量设置视图参数
  public setViewParams(viewId: string, values: any, init: boolean = false) {
    this.getStore().setViewParams(viewId, values, init);
  }

  // 网络请求方法
  async get(url: string, params?: Record<string, any>) {
    return NetUtils.get(url, params);
  }

  async post(url: string, params?: Record<string, any>) {
    return NetUtils.post(url, params);
  }

  public getView = (viewId: string) => {
    return this.getStore().getView(viewId);
  };

  // 关于Handler的方法
  // 获取视图对应的handler
  private getHandler = <T extends HandlerViewBase>(viewId: string): T => {
    const storeHandler = this.getStore().getHandler(viewId);
    if (!isUndefined(storeHandler)) {
      return storeHandler as T;
    }

    const view = this.getView(viewId);
    if (isUndefined(view)) {
      throw new Error(`${viewId}对应的handler不存在`);
    }
    const handlerClass = ViewHandlerMap.get(view.type);
    if (isUndefined(handlerClass)) {
      throw new Error(`${viewId}对应的handler不存在`);
    }
    const handler = new handlerClass(viewId, this.getStore);
    this.getStore().setHandler(viewId, handler);

    return handler as T;
  };

  // 返回弹出框的handler
  public getModalHandler = (viewId: string): HandlerModalImpl => {
    return this.getHandler<HandlerModalImpl>(viewId);
  };

  // 返回侧边栏弹出框
  public getDrawerHandler = (viewId: string): HandlerDrawerImpl => {
    return this.getHandler<HandlerDrawerImpl>(viewId);
  };
}
export default HandlerBase;
