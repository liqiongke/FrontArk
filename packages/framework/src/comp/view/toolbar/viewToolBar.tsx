import CtrlFactory from '@/comp/ctrlFactory';
import { useView } from '@/stores/store/hooks/useView';
import { SysViewProps, ViewType } from '@view/interface';
import { Space } from 'antd';
import { ViewToolBarProps } from './interface';
import './styles/toolbar.less';

const ViewToolBar: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewToolBarProps>(props.viewId);
  const { items } = view;

  return (
    <div className="view-toolbar-container">
      <Space className="view-toolbar-space">
        {items?.map((item, index) => (
          <CtrlFactory key={index} ctrl={item} sourceView={ViewType.Toolbar} />
        ))}
      </Space>
    </div>
  );
};

export default ViewToolBar;
