import { type CtrlButtonProps } from '@ctrl/button/interface';
import { type ViewItem, type ViewStructBase, type ViewType } from '@view/interface';

/**
 * 表单标签布局
 * - horizontal:标签在左、控件在右,桌面端后台表单的通行做法,纵向空间利用率高、可横向扫描
 * - vertical:标签在上、控件在下,适合长标签或窄容器
 */
export type FormLabelLayout = 'horizontal' | 'vertical';

export interface ViewFormProps extends ViewStructBase {
  type: ViewType.Form;
  /**
   * @name 是否显示外层卡片边框
   * 默认 true;置为 false 时面板不带边框、圆角、背景与内边距,内容与页面留白由外层布局统一提供
   */
  bordered?: boolean;
  /**
   * @name 标签布局
   * 默认 horizontal;单个表单项所在单元格宽度不足时自动回落为 vertical
   */
  labelLayout?: FormLabelLayout;
  /**
   * @name 标签列宽(horizontal 生效)
   * 数字按 px 处理,字符串原样作为 CSS 宽度;默认 88
   */
  labelWidth?: number | string;
  /**
   * @name 标签对齐方式(horizontal 生效)
   * 默认 left;标签长短差异明显时用 right 视觉更整齐
   */
  labelAlign?: 'left' | 'right';
  toolList?: CtrlButtonProps[];
  items?: FormItemProps[];
}

export interface FormItemProps extends ViewItem {
  /**
   * @name 栅格跨度,按 24 列计算
   * 不填时按容器宽度自适应(窄屏 24、中屏 12、宽屏 6)
   */
  span?: number;
  /**
   * @name 覆盖表单级 labelWidth
   */
  labelWidth?: number | string;
  /**
   * @name 覆盖表单级 labelLayout
   */
  labelLayout?: FormLabelLayout;
}
