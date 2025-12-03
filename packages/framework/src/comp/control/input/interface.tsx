import { type CtrlBase, Ctrl } from '@ctrl/interface';

export interface CtrlInputProps extends CtrlBase {
  type: Ctrl.Input;

  /**
   * @name 文本对齐方式
   */
  textAlign?: 'left' | 'center' | 'right';
}
