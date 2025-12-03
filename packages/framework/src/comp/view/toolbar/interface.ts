import { CtrlButtonProps } from '@/comp/control/button/interface';
import { ViewStructBase, ViewType } from '../interface';

export interface ViewToolBarProps extends ViewStructBase {
  type: ViewType.Toolbar;
  /**
   * @ 表格列
   */
  items?: Array<CtrlButtonProps>;
}
