import { type DPath } from '@/stores/store/interface';
import CtrlFactory from '../../ctrlFactory';
import { ViewType } from '../interface';
import { type FormItemProps } from './interface';
import { Ctrl } from '@/comp/control/interface';
import { cn } from '@/ui/lib/utils';

interface ViewFormItemProps {
  item: FormItemProps;
  path: DPath;
}

// 渲染表单组件
const ViewFormItem: React.FC<ViewFormItemProps> = ({ item, path }) => {
  const { title, ctrl, span } = item;
  const isRange = ctrl?.type === Ctrl.DateRange || ctrl?.type === Ctrl.TimeRange;
  return (
    // span 按 24 列计算，动态值用内联样式而非动态 Tailwind 类名
    <div
      className={cn(
        'min-w-0 col-span-24 @min-[32rem]/form:col-span-12',
        !isRange && '@min-[56rem]/form:col-span-6',
      )}
      style={span === undefined ? undefined : { gridColumn: `span ${span} / span ${span}` }}
    >
      <div className="form-item-container flex h-full w-full flex-col gap-2">
        {title && (
          <div className="form-item-label text-left text-sm leading-5 font-medium">
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
