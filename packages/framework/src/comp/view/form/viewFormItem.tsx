import { type DPath } from '@/stores/store/interface';
import CtrlFactory from '../../ctrlFactory';
import { ViewType } from '../interface';
import { type FormItemProps, type FormLabelLayout } from './interface';
import { Ctrl } from '@/comp/control/interface';
import { cn } from '@/ui/lib/utils';

interface ViewFormItemProps {
  item: FormItemProps;
  path: DPath;
  /** 表单级标签布局 */
  labelLayout: FormLabelLayout;
  /** 表单级标签列宽 */
  labelWidth: number | string;
  /** 表单级标签对齐方式 */
  labelAlign: 'left' | 'right';
}

/**
 * 渲染表单组件
 *
 * 布局取舍（对齐桌面端后台表单的通行做法）：
 * - 默认「标签在左 + 控件在右」的横向排布，标签列定宽保证多字段纵向对齐，
 *   单行高度只等于控件高度（36px），相比上下排布可显著压缩表单占用的页面高度；
 * - 表单项级配置优先于表单级配置；
 * - 以栅格单元格自身为容器做查询：单元格宽度不足以容纳「标签列 + 控件」时
 *   自动回落为「标签在上」的纵向排布，避免窄容器（弹窗、窄栅格、窄屏）里控件被压扁。
 */
const ViewFormItem: React.FC<ViewFormItemProps> = (props) => {
  const { item, path, labelLayout, labelWidth, labelAlign } = props;
  const { title, ctrl, span } = item;
  const isRange = ctrl?.type === Ctrl.DateRange || ctrl?.type === Ctrl.TimeRange;
  const isHorizontal = (item.labelLayout ?? labelLayout) === 'horizontal';
  const width = item.labelWidth ?? labelWidth;
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
              isHorizontal && (labelAlign === 'right' ? 'text-right' : 'text-left'),
            )}
            style={isHorizontal ? { width: typeof width === 'number' ? `${width}px` : width } : undefined}
            title={title}
          >
            {title}
          </div>
        )}
        <div className="form-item-content min-w-0 flex-1">
          <CtrlFactory
            ctrl={ctrl}
            path={path}
            defaultCtrlType={Ctrl.Input}
            sourceView={ViewType.Form}
          />
        </div>
      </div>
    </div>
  );
};

export default ViewFormItem;
