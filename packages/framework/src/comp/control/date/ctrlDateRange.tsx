import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { DatePicker } from 'antd';
import { type SysCtrlProps } from '../interface';
import './index.less';
import { type CtrlDateRangeProps } from './interface';

const { RangePicker } = DatePicker;

const CtrlDateRange: React.FC<SysCtrlProps<CtrlDateRangeProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((dates: any, dateStrings: string[]) => {
    setValue(dateStrings);
  });

  return (
    <div className="ctrl-pickerdate-container">
      <RangePicker
        value={value ? [value[0], value[1]] : undefined}
        onChange={onChange}
        format={ctrl?.format || 'YYYY-MM-DD'}
        showTime={ctrl?.showTime}
        placeholder={ctrl?.placeholder || ['开始日期', '结束日期']}
        disabled={ctrl?.disabled}
        style={{ width: '100%' }}
      />
    </div>
  );
};

export default CtrlDateRange;
