import CtrlFactory from '@/comp/ctrlFactory';
import { cn } from '@/ui/lib/utils';
import { useView } from '@/stores/store/hooks/useView';
import PathUtils from '@utils/pathUtils';
import { type SysViewProps, ViewType } from '@view/interface';
import { type ViewFormProps } from './interface';
import ViewFormItem from './viewFormItem';

const ViewForm: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewFormProps>(props.viewId);
  const {
    items,
    path,
    toolList,
    bordered = true,
    labelLayout = 'horizontal',
    labelWidth = 88,
    // 默认右对齐：让标签文字紧贴自己的控件，避免短标签在视觉上归属到左侧相邻控件
    labelAlign = 'right',
  } = view;
  return (
    // 无边框形态下不提供内边距:面板自身不再套一层留白,统一交给页面/布局容器的 gutter
    <div
      className={cn(
        'view-form-container @container/form min-w-0',
        bordered && 'rounded-lg border bg-card p-4 text-card-foreground sm:p-6',
      )}
    >
      {/* 工具栏与表单项之间仅用间距分隔,不再插入分割线 */}
      {toolList && toolList.length > 0 && (
        <div className="view-form-toolbar mb-4 flex flex-wrap items-center gap-2">
          {toolList.map((tool, index) => (
            <CtrlFactory key={index} ctrl={tool} sourceView={ViewType.Form} />
          ))}
        </div>
      )}

      {/* 24 列 CSS Grid：span 语义与历史 antd Row/Col 保持一致，窄屏自动换行不产生横向溢出 */}
      <div
        className="view-form-row grid w-full gap-x-4"
        style={{
          gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
          rowGap: 'var(--density-form-gap-y, 1.5rem)',
        }}
      >
        {items?.map((item, index) => (
          <ViewFormItem
            key={item.field + index}
            item={item}
            path={PathUtils.itemPath(item, path)}
            labelLayout={labelLayout}
            labelWidth={labelWidth}
            labelAlign={labelAlign}
          />
        ))}
      </div>
    </div>
  );
};

export default ViewForm;
