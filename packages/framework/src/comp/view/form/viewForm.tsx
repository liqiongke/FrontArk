import CtrlFactory from '@/comp/ctrlFactory';
import { useView } from '@/stores/store/hooks/useView';
import PathUtils from '@utils/pathUtils';
import { type SysViewProps, ViewType } from '@view/interface';
import { type ViewFormProps } from './interface';
import ViewFormItem from './viewFormItem';

const ViewForm: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewFormProps>(props.viewId);
  const { items, path, toolList } = view;
  return (
    <div className="view-form-container bg-card rounded-sm px-3 py-2">
      {toolList && toolList.length > 0 && (
        <div className="view-form-toolbar mb-4 flex flex-wrap items-center gap-2">
          {toolList.map((tool, index) => (
            <CtrlFactory key={index} ctrl={tool} sourceView={ViewType.Form} />
          ))}
        </div>
      )}

      {/* 24 列 CSS Grid：span 语义与历史 antd Row/Col 保持一致，窄屏自动换行不产生横向溢出 */}
      <div
        className="view-form-row grid w-full gap-x-3"
        style={{
          gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
          rowGap: 'var(--density-form-gap-y, 0.5rem)',
        }}
      >
        {items?.map((item, index) => (
          <ViewFormItem
            key={item.field + index}
            item={item}
            path={PathUtils.itemPath(item, path)}
          />
        ))}
      </div>
    </div>
  );
};

export default ViewForm;
