import { ValueType } from '@/interface';
import { Ctrl, CtrlBase } from '../interface';

export interface CtrlTimeBaseProps extends CtrlBase {
  // 时间格式，如 'HH:mm:ss'
  format?: string;
  // 是否显示秒
  showSecond?: boolean;
  // 禁用状态
  disabled?: boolean;
  // 默认值
  defaultValue?: ValueType;
}

export interface CtrlTimeProps extends CtrlTimeBaseProps {
  type: Ctrl.Time;
  // 占位符文本
  placeholder?: string;
}

export interface CtrlTimeRangeProps extends CtrlTimeBaseProps {
  type: Ctrl.TimeRange;
  // 占位符文本
  placeholder?: [string, string];
}
