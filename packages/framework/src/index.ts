// store 数据
// store 用户类型
export { default as createUserStore } from '@/stores/user/userStore';

// 工具类型
export { default as NetUtils } from '@utils/netUtils';

// 请求返回的数据类型
export type { Result } from '@utils/netUtils/interface';

// 根视图
export { default as ViewRoot } from '@/view';

// handler类
export { default as HandlerBase } from '@handler/handlerBase';

// 数据类型
export { default as DataBase } from '@data/dataBase';
export type { default as DataProps } from '@data/interface';

// 组件类型
export { ViewType } from '@view/interface';

// 导出视图类型
export { default as ViewBase } from '@/comp/viewBase';
import type { ViewStructBase } from '@view/interface';
import type { ViewFormProps } from '@view/form/interface';
import type { ViewTableProps } from '@view/table/interface';

export namespace V {
  export type Base = ViewStructBase;

  // 使用 View.FormProps
  export type Form = ViewFormProps;

  // 使用 View.TableProps
  export type Table = ViewTableProps;
}

// 控件类型
export { CtrlType } from '@ctrl/interface';
