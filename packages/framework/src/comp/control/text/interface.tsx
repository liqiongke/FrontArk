import { CtrlBase, Ctrl } from '../interface';

export interface CtrlTextProps extends CtrlBase {
  type: Ctrl.Text;
  /**
   * @name 文字对齐方式
   * @default left
   */
  align?: 'left' | 'right' | 'center';
}
