import { ValueType } from '@/interface';
import { Ctrl, CtrlBase } from '../interface';

export interface CtrlPickerDateBaseProps extends CtrlBase {
  // 日期格式，如 'YYYY-MM-DD'
  format?: string;
  // 是否显示时间
  showTime?: boolean;
  // 禁用状态
  disabled?: boolean;
  // 默认值
  defaultValue?: ValueType;
}

export interface CtrlDateProps extends CtrlPickerDateBaseProps {
  type: Ctrl.Date;
  // 占位符文本
  placeholder?: string;
}

export interface CtrlDateRangeProps extends CtrlPickerDateBaseProps {
  type: Ctrl.DateRange;
  // 占位符文本
  placeholder?: [string, string];
}
