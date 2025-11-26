import CtrlFactory from '@/comp/ctrlFactory';
import { useView } from '@/stores/store/useView';
import PathUtils from '@utils/pathUtils';
import { SysViewProps, ViewType } from '@view/interface';
import { Row } from 'antd';
import { ViewFormProps } from './interface';
import './styles/form.less';
import ViewFormItem from './viewFormItem';

const ViewForm: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewFormProps>(props.viewId);
  const { items, path, toolList } = view;
  return (
    <div className="view-form-container">
      {toolList && toolList.length > 0 && (
        <div className="view-form-toolbar">
          {toolList.map((tool, index) => (
            <CtrlFactory key={index} ctrl={tool} sourceView={ViewType.Form} />
          ))}
        </div>
      )}

      <Row className="view-form-row" gutter={[12, 6]}>
        {items?.map((item, index) => (
          <ViewFormItem
            key={item.field + index}
            item={item}
            path={PathUtils.itemPath(item, path)}
          />
        ))}
      </Row>
    </div>
  );
};

export default ViewForm;
