import useValue from '@store/useValue';
import { useMemoizedFn } from 'ahooks';
import { Switch } from 'antd';
import { SysCtrlProps } from '../interface';
import './index.less';
import { CtrlSwitchProps } from './interface';

const CtrlSwitch: React.FC<SysCtrlProps<CtrlSwitchProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useValue(path);

  const onChange = useMemoizedFn((checked: boolean) => {
    setValue(checked);
  });

  return (
    <div className="ctrl-switch-container">
      <Switch checked={value} onChange={onChange} />
    </div>
  );
};

export default CtrlSwitch;
