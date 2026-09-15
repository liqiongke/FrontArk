import { type CtrlButtonProps } from '@/comp/control/button/interface';
import { type ViewStructBase, type ViewType } from '../interface';

export interface ViewToolBarProps extends ViewStructBase {
  type: ViewType.Toolbar;
  /**
   * @ 表格列
   */
  items?: Array<CtrlButtonProps>;
}
