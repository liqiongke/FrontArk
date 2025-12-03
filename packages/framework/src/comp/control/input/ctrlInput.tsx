import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { Input } from 'antd';
import { type ChangeEvent } from 'react';
import { type SysInteractiveCtrlProps } from '../interface';
import { type CtrlInputProps } from './interface';
import { ViewType } from '@/comp/view/interface';

const CtrlInput: React.FC<SysInteractiveCtrlProps<CtrlInputProps>> = (props) => {
  const { ctrl, path, sourceView } = props;
  const [value, setValue] = useDataState(path);

  const onCtrlChange = useMemoizedFn((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  });

  let textAlign = ctrl?.textAlign;
  if (sourceView === ViewType.Table) {
    textAlign = 'right';
  }
  return <Input style={{ textAlign }} value={value} onChange={onCtrlChange} />;
};

export default CtrlInput;
