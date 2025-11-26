import { DPath } from 'src/stores/store/interface';
import { CtrlStructType } from '../control/interface';
import { LayoutFlexProps } from './flex/interface';
import { ViewFormProps } from './form/interface';
import { ViewTableProps } from './table/interface';
import { ViewTabProps } from './tab/interface';

/**
 * 视图结构类型
 */
export type ViewStructType = LayoutFlexProps | ViewFormProps | ViewTableProps | ViewTabProps;

/**
 * 视图类型
 */
export enum ViewType {
  /**
   * @name 组件 表格
   */
  Table = 'VIEW_TABLE',
  /**
   * @name 组件 表单
   */
  Form = 'VIEW_FORM',

  /**
   * @name flex布局
   */
  LayoutFlex = 'LAYOUT_FLEX',

  /**
   * @name tab布局
   */
  LayoutTab = 'LAYOUT_TAB',

  /**
   * @name 弹出框
   */
  LayoutModal = 'LAYOUT_MODAL',

  /**
   * @name 侧边栏弹出框
   */
  LayoutDrawer = 'LAYOUT_DRAWER',
}

// 基础视图结构
export interface ViewStructBase {
  /**
   * @name ID
   * 每个组件需要有专门的id, 布局引用清晰:在layout中使用 this.form1.id 引用，语义明确
   */
  id: string;

  /**
   * @name 视图类型
   */
  type: ViewType;

  /**
   * @name 取值路径
   */
  path?: DPath;

  /**
   * @name 子节点组件id
   */
  children?: string[];
}

export interface ViewItem {
  /**
   * 标题名称
   */
  title?: string;

  /**
   * 字段名称
   */
  field: string;

  /**
   * 控件配置
   */
  ctrl?: CtrlStructType;

  /**
   * 取值路径
   */
  path?: DPath;
}

/**
 * 系统用视图传入的参数
 */
export interface SysViewProps {
  viewId: string;
}
