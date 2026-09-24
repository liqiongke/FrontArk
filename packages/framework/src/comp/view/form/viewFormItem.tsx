import { type DPath } from '@/stores/store/interface';
import CtrlFactory from '../../ctrlFactory';
import { ViewType } from '../interface';
import { type FormItemProps } from './interface';
import { Ctrl } from '@/comp/control/interface';

interface ViewFormItemProps {
  item: FormItemProps;
  path: DPath;
}

// 渲染表单组件
const ViewFormItem: React.FC<ViewFormItemProps> = ({ item, path }) => {
  const { title, ctrl, span = 4 } = item;
  return (
    // span 按 24 列计算，动态值用内联样式而非动态 Tailwind 类名
    <div style={{ gridColumn: `span ${span} / span ${span}`, minWidth: 0 }}>
      <div className="form-item-container flex h-full w-full flex-col overflow-hidden">
        {title && (
          <div className="form-item-label mb-0.5 text-left text-sm font-bold">
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
