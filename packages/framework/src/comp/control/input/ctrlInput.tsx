import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { type ChangeEvent } from 'react';
import { type SysInteractiveCtrlProps } from '../interface';
import { type CtrlInputProps } from './interface';
import { Input } from '@/ui/components/input';
import { cn } from '@/ui/lib/utils';

const CtrlInput: React.FC<SysInteractiveCtrlProps<CtrlInputProps>> = (props) => {
  const { ctrl, path } = props;
  const [value, setValue] = useDataState(path);

  const onCtrlChange = useMemoizedFn((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  });

  // 对齐方式由列配置决定：数字列由 BoundTableCell 注入 textAlign: 'right'。
  // 表格单元格不再无条件右对齐，否则文本列与数字列混在一起，看不出列的值类型。
  const textAlign = ctrl?.textAlign;
  return (
    <Input
      // 右对齐（数字列）配合等宽数字：各位数字宽度一致，小数点因此自然对齐
      className={cn('w-full', textAlign === 'right' && 'tabular-nums')}
      style={{ textAlign }}
      value={value ?? ''}
      onChange={onCtrlChange}
    />
  );
};

export default CtrlInput;
