import { Button } from 'antd';
import { isUndefined } from 'lodash';
import { type SysCtrlProps } from '../interface';
import { type CtrlButtonProps } from './interface';
import './index.less';

const CtrlButton: React.FC<SysCtrlProps<CtrlButtonProps>> = (props) => {
  const { ctrl } = props;

  if (isUndefined(ctrl)) {
    return null;
  }

  return (
    <div className="ctrl-button">
      <Button onClick={ctrl.onClick}>{ctrl.text ?? ''}</Button>
    </div>
  );
};

export default CtrlButton;
