import { type OptionItem } from '@/interface';
import { type Ctrl, type CtrlBase } from '../interface';

export interface CtrlSelectProps extends CtrlBase {
  type: Ctrl.Select;
  // 自定义数据
  items?: Array<OptionItem>;
}
