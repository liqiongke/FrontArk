import { ViewStructBase, ViewType } from '@view/interface';

export enum FlexDirection {
  ROW = 'row',
  COLUMN = 'column',
}

export interface LayoutFlexProps extends ViewStructBase {
  type: ViewType.LAYOUT_FLEX;
  /**
   * @name 布局方向
   * @default row
   */
  direction?: FlexDirection;
  /**
   * @name 布局间距
   * @default 12
   */
  gutter?: number;
}
