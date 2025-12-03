import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { TimePicker } from 'antd';
import { type SysCtrlProps } from '../interface';
import './index.less';
import { type CtrlTimeProps } from './interface';

const CtrlTime: React.FC<SysCtrlProps<CtrlTimeProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((time: any, timeString: string | string[]) => {
    setValue(timeString);
  });

  return (
    <div className="ctrl-pickertime-container">
      <TimePicker
        value={value ? value : undefined}
        onChange={onChange}
        format={ctrl?.format || 'HH:mm:ss'}
        showSecond={ctrl?.showSecond}
        placeholder={ctrl?.placeholder || '请选择时间'}
        disabled={ctrl?.disabled}
        style={{ width: '100%' }}
      />
    </div>
  );
};

export default CtrlTime;
