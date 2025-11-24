import useValue from '@store/useValue';
import { useMemoizedFn } from 'ahooks';
import { Select } from 'antd';
import { SysCtrlProps } from '../interface';
import { CtrlSelectProps } from './interface';
import './index.less';

const CtrlSelect: React.FC<SysCtrlProps<CtrlSelectProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useValue(path);

  const onChange = useMemoizedFn((val: string) => {
    setValue(val);
  });

  return (
    <Select value={value} onChange={onChange} options={ctrl?.items} style={{ width: '100%' }} />
  );
};

export default CtrlSelect;
