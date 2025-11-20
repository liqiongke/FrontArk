import { CtrlBase, CtrlType } from '../interface';

export interface CtrlButtonProps extends CtrlBase {
  type: CtrlType.CTRL_BUTTON;
  onClick?: () => void | Promise<void>;
}
