import CtrlFactory from '../../ctrlFactory';
import { Col } from 'antd';
import { FormItemProps } from './interface';
import './styles/formItem.less';
import { ViewType } from '../interface';
import { DPath } from '../../../interface';

interface ViewFormItemProps {
  item: FormItemProps;
  path: DPath;
}

// 渲染表单组件
const ViewFormItem: React.FC<ViewFormItemProps> = ({ item, path }) => {
  const { title, ctrl, span = 4 } = item;
  return (
    <Col span={span}>
      <div className="form-item-container">
        {title && <div className="form-item-label">{title}</div>}
        <div className="form-item-content">
          <CtrlFactory ctrl={ctrl} path={path} sourceView={ViewType.VIEW_FORM} />
        </div>
      </div>
    </Col>
  );
};

export default ViewFormItem;
