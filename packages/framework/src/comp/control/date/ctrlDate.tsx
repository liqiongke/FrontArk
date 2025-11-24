import useValue from '@store/useValue';
import { useMemoizedFn } from 'ahooks';
import { DatePicker } from 'antd';
import { SysCtrlProps } from '../interface';
import './index.less';
import { CtrlDateProps } from './interface';

const CtrlDate: React.FC<SysCtrlProps<CtrlDateProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useValue(path);

  const onChange = useMemoizedFn((date: any, dateString: string | string[]) => {
    setValue(dateString);
  });

  return (
    <div className="ctrl-pickerdate-container">
      <DatePicker
        value={value ? value : undefined}
        onChange={onChange}
        format={ctrl?.format || 'YYYY-MM-DD'}
        showTime={ctrl?.showTime}
        placeholder={ctrl?.placeholder || '请选择日期'}
        disabled={ctrl?.disabled}
        style={{ width: '100%' }}
      />
    </div>
  );
};

export default CtrlDate;
