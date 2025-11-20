import { Button } from 'antd';
import { isUndefined } from 'lodash';
import { SysCtrlProps } from '../interface';
import { CtrlButtonProps } from './interface';
import './index.less';

const CtrlButton: React.FC<SysCtrlProps<CtrlButtonProps>> = (props) => {
  const { ctrl } = props;
  // const store = useContext(StoreContext);

  if (isUndefined(ctrl)) {
    return null;
  }

  return (
    <div className="ctrl-button">
      <Button onClick={ctrl.onClick}>测试</Button>
    </div>
  );
};

export default CtrlButton;
