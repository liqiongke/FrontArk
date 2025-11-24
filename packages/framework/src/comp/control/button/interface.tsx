import { CtrlBase, Ctrl } from '@ctrl/interface';

export interface CtrlButtonProps extends CtrlBase {
  type: Ctrl.Button;
  onClick?: () => void | Promise<void>;
}
