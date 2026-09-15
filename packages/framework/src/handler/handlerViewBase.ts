import { type IStoreBase } from '@/stores/store/interface';

// 视图类控件的标记类型
export type HandlerViewInterface = object;

// 视图类控件
class HandlerViewBase {
  protected viewId: string;
  protected getStore!: () => IStoreBase;

  // 初始化操作
  constructor(viewId: string, getStore: () => IStoreBase) {
    this.viewId = viewId;
    this.getStore = getStore;
  }
}

export default HandlerViewBase;
