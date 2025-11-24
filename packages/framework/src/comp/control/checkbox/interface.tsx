import { OptionItem } from '@/interface';
import { Ctrl, CtrlBase } from '../interface';

export interface CtrlCheckboxProps extends CtrlBase {
  type: Ctrl.Checkbox;
  items?: Array<OptionItem>;
}
