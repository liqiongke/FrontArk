import { DPath } from '@store/interface';
import { ViewType } from '@view/interface';
import { CtrlButtonProps } from './button/interface';
import { CtrlInputProps } from './input/interface';
import { CtrlSelectProps } from './select/interface';
import { CtrlTextProps } from './text/interface';
import { CtrlSwitchProps } from './switch/interface';
import { CtrlRadioProps } from './radio/interface';
import { CtrlCheckboxProps } from './checkbox/interface';
import { CtrlDateProps, CtrlDateRangeProps } from './date/interface';
import { CtrlTimeProps, CtrlTimeRangeProps } from './time/interface';
import { CtrlLinkProps } from './link/interface';
import { CtrlUploadProps } from './upload/interface';

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
