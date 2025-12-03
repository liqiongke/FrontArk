import { type CtrlBase, Ctrl } from '@ctrl/interface';

export interface CtrlButtonProps extends CtrlBase {
  type: Ctrl.Button;
  text?: string;
  onClick?: () => void | Promise<void>;
}
