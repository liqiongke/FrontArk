import { ViewStructBase, ViewType } from '../interface';

export interface LayoutDrawerProps extends ViewStructBase {
  type: ViewType.LayoutDrawer;

  // 抽屉视图的Id
  viewId: string;

  // 抽屉标题
  title?: string;

  // 抽屉位置
  placement?: 'left' | 'right' | 'top' | 'bottom';

  // 抽屉宽度
  width?: number;

  // 当点击关闭时:
  onClose?: () => void;
}
