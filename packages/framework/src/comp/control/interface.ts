import { type DPath } from '@store/interface';
import { ViewType } from '@view/interface';
import { type CtrlButtonProps } from './button/interface';
import { type CtrlCheckboxProps } from './checkbox/interface';
import { type CtrlDateProps, type CtrlDateRangeProps } from './date/interface';
import { type CtrlInputProps } from './input/interface';
import { type CtrlLinkProps } from './link/interface';
import { type CtrlRadioProps } from './radio/interface';
import { type CtrlSelectProps } from './select/interface';
import { type CtrlSwitchProps } from './switch/interface';
import { type CtrlTextProps } from './text/interface';
import { type CtrlTimeProps, type CtrlTimeRangeProps } from './time/interface';
import { type CtrlUploadProps } from './upload/interface';

// 视图结构类型
export type CtrlStructType =
  | CtrlTextProps
  | CtrlInputProps
  | CtrlButtonProps
  | CtrlSelectProps
  | CtrlSwitchProps
  | CtrlRadioProps
  | CtrlCheckboxProps
  | CtrlDateProps
  | CtrlDateRangeProps
  | CtrlTimeProps
  | CtrlTimeRangeProps
  | CtrlLinkProps
  | CtrlUploadProps;

// 控件类型
export enum Ctrl {
  Text = 'TEXT',
  Input = 'INPUT',
  Button = 'BUTTON',
  Select = 'SELECT',
  Switch = 'SWITCH',
  Radio = 'RADIO',
  Checkbox = 'CHECKBOX',
  Date = 'DATE',
  DateRange = 'DATE_RANGE',
  Time = 'TIME',
  TimeRange = 'TIME_RANGE',
  Link = 'LINK',
  Upload = 'UPLOAD',
}

// 基础视图结构
export interface CtrlBase {
  /**
   * @name 视图类型
   */
  type: Ctrl;
}

// 系统用视图传入的参数
export interface SysCtrlProps<T extends CtrlStructType> {
  /**
   * @name 控件名称
   */
  name?: string;

  /**
   * @name 控件类型
   */
  ctrl?: T;

  /**
   * 默认的控件类型
   */
  defaultCtrlType?: Ctrl;

  /**
   * @name 取值路径
   */
  path?: DPath;

  /**
   * @name 来源组件，针对不同的组件有不同的显示方式
   */
  sourceView?: ViewType;
}

export type OnChangeCallback = (value: any, name?: string) => void;

// 带交互类型的控件
export interface SysInteractiveCtrlProps<T extends CtrlStructType> extends SysCtrlProps<T> {
  onChange?: OnChangeCallback;
}
