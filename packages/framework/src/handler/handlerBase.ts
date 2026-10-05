import { ViewHandlerMap } from '@/comp/compFactory';
import type HandlerDrawerImpl from '@/comp/view/drawer/handler/handlerDrawer';
import type HandlerModalImpl from '@/comp/view/modal/handler/handlerModal';
import { KeyAttr } from '@/interface';
import NetUtils from '@/utils/netUtils';
import { get, isArray, isNumber, isString, isUndefined } from 'lodash';
import { type DPath, type IStoreBase, ParamKey } from '@/stores/store/interface';
import type HandlerViewBase from './handlerViewBase';

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

  // 需要最新输入的业务命令应显式提交，普通 getData 始终只读。
  public flushData(path?: DPath) { this.getStore().flushData(path); }
  public flushDataScope(path: DPath) { this.getStore().flushDataScope(path); }
  public cancelData(path?: DPath) { this.getStore().cancelData(path); }
  public cancelDataScope(path: DPath) { this.getStore().cancelDataScope(path); }
  public setDataByFn(path: DPath, update: (data: any) => void) {
    this.getStore().setDataByFn(path, update);
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

  // ---- 表格行勾选 ----
  // 勾选态由表格视图写在视图参数 @Select 上（与焦点行 @Active 同一机制），
  // 这里只做读取/回写，表格未开启 selection 时读取结果为空数组。

  // 获取表格勾选行的行键（按勾选先后顺序）
  public getSelectedKeys = (viewId: string): Array<string | number> => {
    const keys = this.getStore().getViewParamByKey(viewId, ParamKey.Select);
    return isArray(keys) ? keys.filter((key) => isString(key) || isNumber(key)) : [];
  };

  // 获取表格勾选行的完整记录（按勾选顺序；行已不在当前数据里时跳过）
  public getSelectedRows = (viewId: string): Array<Record<string, unknown>> => {
    const keys = this.getSelectedKeys(viewId);
    if (keys.length === 0) {
      return [];
    }
    const view = this.getView(viewId);
    const dataId = get(view, 'dataId');
    const path = get(view, 'path') ?? (isString(dataId) ? [dataId] : undefined);
    const rows = this.getData(path);
    if (!isArray(rows)) {
      return [];
    }
    const byKey = new Map<unknown, Record<string, unknown>>();
    rows.forEach((row) => {
      if (row !== null && typeof row === 'object') {
        byKey.set(get(row, KeyAttr), row as Record<string, unknown>);
      }
    });
    return keys
      .map((key) => byKey.get(key))
      .filter((row): row is Record<string, unknown> => !isUndefined(row));
  };

  // 设置表格勾选行（行键数组）；传空数组即清空勾选
  public setSelectedKeys = (viewId: string, keys: Array<string | number>) => {
    this.getStore().setViewParamByKey(viewId, ParamKey.Select, isArray(keys) ? keys : []);
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
