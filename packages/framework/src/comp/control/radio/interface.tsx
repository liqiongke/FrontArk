import { OptionItem } from '@/interface';
import { Ctrl, CtrlBase } from '../interface';

export interface CtrlRadioProps extends CtrlBase {
  type: Ctrl.Radio;
  items?: Array<OptionItem>;
}
