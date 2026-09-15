import { type OptionItem } from '@/interface';
import { type CtrlBase, type Ctrl } from '../interface';

export interface CtrlLinkProps extends CtrlBase {
  type: Ctrl.Link;
  href?: OptionItem | (() => OptionItem);
}
