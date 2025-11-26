import { ViewStructBase, ViewType } from '../interface';

export interface LayoutModalProps extends ViewStructBase {
  type: ViewType.LayoutModal;

  // 弹窗视图的Id
  viewId: string;

  // 当点击确定时:
  onOk?: () => void;
}
