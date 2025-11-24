import { OptionItem } from '@/interface';
import { Ctrl, CtrlBase } from '../interface';

export interface CtrlSelectProps extends CtrlBase {
  type: Ctrl.Select;
  // 自定义数据
  items?: Array<OptionItem>;
}
