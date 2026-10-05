import React from 'react';
import { cn } from '@/ui/lib/utils';
import { type FormLabelLayout } from './interface';

export interface FormItemLayoutProps {
  /** 标签文案；为空则不渲染标签列 */
  title?: string;
  /** 标签布局，默认 horizontal */
  labelLayout?: FormLabelLayout;
  /** 标签列宽（horizontal 生效），数字按 px 处理，默认 88 */
  labelWidth?: number | string;
  /** 标签对齐（horizontal 生效），默认 right */
  labelAlign?: 'left' | 'right';
  /** 栅格跨度（24 列制）；不传则按容器宽度自适应列数 */
  span?: number;
  /** 区间类控件：占半行，不参与「一行四列」的排布 */
  isRange?: boolean;
  /** 控件内容 */
  children: React.ReactNode;
}

/**
 * 表单项布局（表单与搜索面板共用）
 *
 * 布局取舍（对齐桌面端后台表单的通行做法）：
 * - 默认「标签在左 + 控件在右」的横向排布，标签列定宽保证多字段纵向对齐，
 *   单行高度只等于控件高度（36px），相比上下排布可显著压缩占位高度；
 * - 外层是 24 列栅格，宽屏每行 4 项（span 6）、中屏 2 项、窄屏 1 项，可用 span 覆盖；
 * - 以栅格单元格自身为容器做查询：单元格宽度不足以容纳「标签列 + 控件」时
 *   自动回落为「标签在上」的纵向排布，避免窄容器（弹窗、窄栅格、窄屏）里控件被压扁。
 *
 * 表单与搜索面板从这里取同一套实现，样式不会各写一份而走偏。
 */
const FormItemLayout: React.FC<FormItemLayoutProps> = (props) => {
  const {
    title,
    labelLayout = 'horizontal',
    labelWidth = 88,
    labelAlign = 'right',
    span,
    isRange,
    children,
  } = props;
  const isHorizontal = labelLayout === 'horizontal';
  return (
    // span 按 24 列计算，动态值用内联样式而非动态 Tailwind 类名
    <div
      className={cn(
        // 单元格自身作为容器查询容器，使横向/纵向排布由"单元格实际宽度"决定
        'min-w-0 @container/form-item col-span-24 @min-[32rem]/form:col-span-12',
        !isRange && '@min-[56rem]/form:col-span-6',
      )}
      style={span === undefined ? undefined : { gridColumn: `span ${span} / span ${span}` }}
    >
      <div
        className={cn(
          'form-item-container flex w-full flex-col gap-1.5',
          // 17rem ≈ 标签列(88) + 间距(12) + 控件最小可用宽度，低于该宽度改用纵向排布
          isHorizontal &&
            '@min-[17rem]/form-item:flex-row @min-[17rem]/form-item:items-center @min-[17rem]/form-item:gap-3',
        )}
      >
        {title && (
          <div
            className={cn(
              'form-item-label shrink-0 truncate text-sm leading-5 font-medium',
              // 横向：右对齐，标签文字紧贴自己的控件；纵向：与控件共享左边界，统一左对齐
              isHorizontal ? (labelAlign === 'right' ? 'text-right' : 'text-left') : 'text-left',
            )}
            style={
              isHorizontal
                ? { width: typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth }
                : undefined
            }
            title={title}
          >
            {title}
          </div>
        )}
        <div className="form-item-content min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
};

export default FormItemLayout;
