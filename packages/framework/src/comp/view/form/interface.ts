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
   *
   * 三种排布的取舍(基于 Matteo Penzo 2006 眼动实验与 Luke Wroblewski 的归纳):
   * - vertical(标签在上):标签到控件只需一次眼动(约 50ms),最快、且不受标签长度/i18n 影响,
   *   代价是多占一行高度;
   * - horizontal(标签在左):只占一行高度,右对齐时标签到控件约 240ms;
   * 因此默认走 horizontal 压高度,标签过长或单元格过窄时再回落到 vertical。
   */
  labelLayout?: FormLabelLayout;
  /**
   * @name 标签列宽(horizontal 生效)
   * 数字按 px 处理,字符串原样作为 CSS 宽度;默认 88
   */
  labelWidth?: number | string;
  /**
   * @name 标签对齐方式(horizontal 生效)
   * 默认 right。
   *
   * 依据格式塔「接近性」原则：横向排布时标签必须紧靠它自己的控件。
   * left 会让短标签的文字贴在单元格左侧、远离自己的控件，反而更接近上一个控件的右边缘，
   * 用户容易把标签误读为前一个字段的说明（Smashing Magazine 亦指出左对齐完成时间最慢，
   * 原因正是「标签越短，离它的输入框越远」）。right 让标签文字右边缘紧贴自己的控件，
   * 与左侧相邻控件之间只隔着「列间距 + 标签列空白」，归属关系明确。
   *
   * 仅在需要用户逐条慢读、或需要用户上下扫读标签集合时（如偏好设置、高级设置）才用 left。
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
