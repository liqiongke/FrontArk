import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { Switch } from 'antd';
import { type SysCtrlProps } from '../interface';
import './index.less';
import { type CtrlSwitchProps } from './interface';

const CtrlSwitch: React.FC<SysCtrlProps<CtrlSwitchProps>> = (props) => {
  const { path } = props;

  const [value, setValue] = useDataState(path);

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
