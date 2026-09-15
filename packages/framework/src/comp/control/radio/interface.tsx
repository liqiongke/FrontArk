import { type OptionItem } from '@/interface';
import { type Ctrl, type CtrlBase } from '../interface';

export interface CtrlRadioProps extends CtrlBase {
  type: Ctrl.Radio;
  items?: Array<OptionItem>;
}
