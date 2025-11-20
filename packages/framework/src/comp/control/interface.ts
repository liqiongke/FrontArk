import { ViewType } from '@/framework';
import { DPath } from '@/framework/store/interface';
import { CtrlButtonProps } from './button/interface';
import { CtrlInputProps } from './input/interface';
import { CtrlTextProps } from './text/interface';

// 视图结构类型
export type CtrlStructType = CtrlTextProps | CtrlInputProps | CtrlButtonProps;

// 控件类型
export enum CtrlType {
  CTRL_TEXT = 'CTRL_TEXT',
  CTRL_INPUT = 'CTRL_INPUT',
  CTRL_BUTTON = 'CTRL_BUTTON',
}

// 基础视图结构
export interface CtrlBase {
  /**
   * @name 视图类型
   */
  type: CtrlType;
}

// 系统用视图传入的参数
export interface SysCtrlProps<T extends CtrlStructType> {
  ctrl?: T;

  /**
   * @name 取值路径
   */
  path?: DPath;

  /**
   * @name 来源组件，针对不同的组件有不同的显示方式
   */
  sourceView?: ViewType;
}
