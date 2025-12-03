import { CtrlCheckboxProps } from '@/comp/control/checkbox/interface';
import { CtrlDateProps, CtrlDateRangeProps } from '@/comp/control/date/interface';
import { CtrlInputProps } from '@/comp/control/input/interface';
import { CtrlRadioProps } from '@/comp/control/radio/interface';
import { CtrlSelectProps } from '@/comp/control/select/interface';
import { CtrlSwitchProps } from '@/comp/control/switch/interface';
import { CtrlTimeProps, CtrlTimeRangeProps } from '@/comp/control/time/interface';

export interface SearchPlaneProps {
  viewId: string;
  items?: SearchPlaneItem[];
}

export interface SearchPlaneFormProps {
  viewId: string;
  // 每行有多少列搜索项
  colNum?: 3 | 4 | 6 | 8;

  items?: SearchPlaneItem[];
}

export interface SearchPlaneSelectProps {
  viewId: string;
  items?: SearchPlaneItem[];
}

export interface SearchPlaneItemProps {
  viewId: string;
  item: SearchPlaneItem;
}

// 搜索面板中支持的数据类型
export type CtrlSearchPlaneType =
  | CtrlInputProps
  | CtrlSelectProps
  | CtrlSwitchProps
  | CtrlRadioProps
  | CtrlCheckboxProps
  | CtrlDateProps
  | CtrlDateRangeProps
  | CtrlTimeProps
  | CtrlTimeRangeProps;

export interface SearchPlaneItem {
  // 标题
  title: string;

  // 搜索字段
  field: string;

  // 搜索栏的控件,默认是输入框
  ctrl?: CtrlSearchPlaneType;

  // 匹配的正则表达式,根据用户输入,可以快速匹配当前节点
  regExp?: RegExp;
}
