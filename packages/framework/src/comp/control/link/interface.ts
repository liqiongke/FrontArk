import { OptionItem } from '@/interface';
import { CtrlBase, Ctrl } from '../interface';

export interface CtrlLinkProps extends CtrlBase {
  type: Ctrl.Link;
  href?: OptionItem | (() => OptionItem);
}
