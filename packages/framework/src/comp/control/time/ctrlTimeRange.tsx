import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { TimePicker } from 'antd';
import { SysCtrlProps } from '../interface';
import './index.less';
import { CtrlTimeRangeProps } from './interface';

const { RangePicker } = TimePicker;

const CtrlTimeRange: React.FC<SysCtrlProps<CtrlTimeRangeProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((times: any, timeStrings: string[]) => {
    setValue(timeStrings);
  });

  return (
    <div className="ctrl-pickertime-container">
      <RangePicker
        value={value ? [value[0], value[1]] : undefined}
        onChange={onChange}
        format={ctrl?.format || 'HH:mm:ss'}
        showSecond={ctrl?.showSecond}
        placeholder={ctrl?.placeholder || ['开始时间', '结束时间']}
        disabled={ctrl?.disabled}
        style={{ width: '100%' }}
      />
    </div>
  );
};

export default CtrlTimeRange;
