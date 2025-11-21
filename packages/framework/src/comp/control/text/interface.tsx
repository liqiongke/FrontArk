import { TextAlign } from '../base/interface';
import { CtrlBase, CtrlType } from '../interface';


export interface CtrlTextProps extends CtrlBase {
  type: CtrlType.CTRL_TEXT;
  /**
   * @name 文字对齐方式
   * @default left
   */
  align?: TextAlign;
}
