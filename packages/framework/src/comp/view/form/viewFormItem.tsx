import { type DPath } from '@/stores/store/interface';
import CtrlFactory from '../../ctrlFactory';
import { ViewType } from '../interface';
import { type FormItemProps, type FormLabelLayout } from './interface';
import { Ctrl } from '@/comp/control/interface';
import FormItemLayout from './formItemLayout';

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
 * 表单项：解析表单项级配置对表单级配置的覆盖后，交给共用的布局组件渲染。
 * 布局规则（横向/纵向、栅格列数、回落阈值）统一在 FormItemLayout 中，
 * 与搜索面板共用同一份实现。
 */
const ViewFormItem: React.FC<ViewFormItemProps> = (props) => {
  const { item, path, labelLayout, labelWidth, labelAlign } = props;
  const { title, ctrl, span } = item;
  // 区间类控件本身较宽，占半行而不是 1/4 行
  const isRange = ctrl?.type === Ctrl.DateRange || ctrl?.type === Ctrl.TimeRange;
  return (
    <FormItemLayout
      title={title}
      labelLayout={item.labelLayout ?? labelLayout}
      labelWidth={item.labelWidth ?? labelWidth}
      labelAlign={labelAlign}
      span={span}
      isRange={isRange}
    >
      <CtrlFactory
        ctrl={ctrl}
        path={path}
        defaultCtrlType={Ctrl.Input}
        sourceView={ViewType.Form}
      />
    </FormItemLayout>
  );
};

export default ViewFormItem;
