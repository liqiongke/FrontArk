import { isUndefined } from 'lodash';
import { type SysCtrlProps } from '../interface';
import { type CtrlButtonProps } from './interface';
import { Button } from '@/ui/components/button';

const CtrlButton: React.FC<SysCtrlProps<CtrlButtonProps>> = (props) => {
  const { ctrl } = props;

  if (isUndefined(ctrl)) {
    return null;
  }

  return (
    <div className="ctrl-button inline-flex">
      <Button onClick={ctrl.onClick}>{ctrl.text ?? ''}</Button>
    </div>
  );
};

export default CtrlButton;
