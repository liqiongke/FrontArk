import useValue from '@/framework/store/useStoreValue';
import { useMemoizedFn } from 'ahooks';
import { Input } from 'antd';
import { ChangeEvent } from 'react';
import { SysCtrlProps } from '../interface';
import { CtrlInputProps } from './interface';

const CtrlInput: React.FC<SysCtrlProps<CtrlInputProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useValue(path);

  const onChange = useMemoizedFn((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  });

  return (
    <Input
      value={value}
      onChange={onChange}
    />
  );
};

export default CtrlInput;
