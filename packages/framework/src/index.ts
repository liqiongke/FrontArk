// store 数据
// store 用户类型
export { default as createUserStore } from '@/stores/user/userStore';

// 工具类型
export { default as NetUtils } from '@utils/netUtils';
export { default as ViewPathUtils } from '@utils/viewPathUtils';

// 请求返回的数据类型
export type { Result } from '@utils/netUtils/interface';

// 根视图
export { default as ViewRoot } from '@/ViewRoot';

// handler类
export { default as HandlerBase } from '@handler/handlerBase';

// 数据类型
export { default as DataBase } from '@data/dataBase';
export type { default as DataProps } from '@data/interface';

// 组件类型
export { ViewType as VType } from '@view/interface';
export { PathKey } from '@store/interface';

// 控件类型
export { Ctrl } from '@ctrl/interface';

// 导出视图类型
export { default as ViewBase } from '@/comp/viewBase';
import type { ViewFormProps } from '@view/form/interface';
import type { ViewStructBase } from '@view/interface';
import type { ViewTableProps } from '@view/table/interface';
import { type LayoutDrawerProps } from './comp/view/drawer/interface';
import { type LayoutFlexProps } from './comp/view/flex/interface';
import { type LayoutModalProps } from './comp/view/modal/interface';
import { type ViewTabProps } from './comp/view/tab/interface';
import { type ViewToolBarProps } from './comp/view/toolbar/interface';

export namespace VProps {
  export type Base = ViewStructBase;

  export type Form = ViewFormProps;

  export type Table = ViewTableProps;

  export type Tab = ViewTabProps;

  export type ToolBar = ViewToolBarProps;

  /**
   * Flex布局结构
   */
  export type Flex = LayoutFlexProps;

  /**
   *  弹出框
   */
  export type Modal = LayoutModalProps;

  /**
   * 侧边弹出栏
   */
  export type Drawer = LayoutDrawerProps;
}

// 测试与性能
export { printStats, resetStats } from '@utils/sysUtils/perfTrackerUtils';
