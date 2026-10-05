import { type CtrlBase, type Ctrl } from '../interface';

export interface CtrlTextProps extends CtrlBase {
  type: Ctrl.Text;
  /**
   * @name 文字对齐方式
   * @default 未声明时：表单内居右（Input 基线），表格单元格按列配置对齐
   */
  align?: 'left' | 'right' | 'center';
}
