import { type OptionItem } from '@/interface';
import { Ctrl, type CtrlBase } from '../interface';

export interface CtrlCheckboxProps extends CtrlBase {
  type: Ctrl.Checkbox;
  items?: Array<OptionItem>;
}
