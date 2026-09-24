import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { type SysCtrlProps } from '../interface';
import { type CtrlSwitchProps } from './interface';
import { Switch } from '@/ui/components/switch';

const CtrlSwitch: React.FC<SysCtrlProps<CtrlSwitchProps>> = (props) => {
  const { path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((checked: boolean) => {
    setValue(checked);
  });

  return (
    <div className="ctrl-switch-container inline-flex">
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
};

export default CtrlSwitch;
