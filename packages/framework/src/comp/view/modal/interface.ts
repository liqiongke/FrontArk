import { type ViewStructBase, type ViewType } from '../interface';

export interface LayoutModalProps extends ViewStructBase {
  type: ViewType.LayoutModal;

  // 弹窗视图的Id
  viewId: string;

  // 弹窗标题（用于可访问标题与头部展示）
  title?: string;

  // 当点击确定时:
  onOk?: () => void;
}
