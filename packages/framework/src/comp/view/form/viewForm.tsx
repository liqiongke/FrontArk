import CtrlFactory from '@/comp/ctrlFactory';
import { SysViewProps, ViewType } from '@view/interface';
import { Row } from 'antd';
import PathUtils from '@utils/pathUtils';
import { ViewFormProps } from './interface';
import './styles/form.less';
import ViewFormItem from './viewFormItem';

const ViewForm: React.FC<SysViewProps<ViewFormProps>> = (props) => {
  const { view } = props;
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
