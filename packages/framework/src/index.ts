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
export { ViewType as V } from '@view/interface';

// 控件类型
export { Ctrl as C } from '@ctrl/interface';

// 导出视图类型
export { default as ViewBase } from '@/comp/viewBase';
import type { ViewFormProps } from '@view/form/interface';
import type { ViewStructBase } from '@view/interface';
import type { ViewTableProps } from '@view/table/interface';
import { ViewTabProps } from './comp/view/tab/interface';
import { LayoutFlexProps } from './comp/view/flex/interface';
import { LayoutModalProps } from './comp/view/modal/interface';
export namespace VProps {
  export type Base = ViewStructBase;

  export type Form = ViewFormProps;

  export type Table = ViewTableProps;

  export type Tab = ViewTabProps;

  // 布局类型参数
  export type Flex = LayoutFlexProps;
  // 布局类型参数
  export type Modal = LayoutModalProps;
}
