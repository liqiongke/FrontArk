import { type ValueType } from '@/interface';
import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { isArray } from 'lodash';
import { type SysCtrlProps } from '../interface';
import { type CtrlCheckboxProps } from './interface';
import { Checkbox } from '@/ui/components/checkbox';
import { Label } from '@/ui/components/label';

const CtrlCheckbox: React.FC<SysCtrlProps<CtrlCheckboxProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onItemChange = useMemoizedFn(
    (itemValue: ValueType, checked: boolean | 'indeterminate') => {
      if (checked === 'indeterminate') {
        // indeterminate 是 UI 中间态，不写入业务值
        return;
      }
      const currentValues: ValueType[] = isArray(value) ? value : [];
      if (checked) {
        setValue([...currentValues, itemValue]);
      } else {
        setValue(currentValues.filter((v: ValueType) => v !== itemValue));
      }
    },
  );

  const onChange = useMemoizedFn((checked: boolean | 'indeterminate') => {
    if (checked === 'indeterminate') {
      return;
    }
    setValue(checked);
  });

  // 多选项模式与单选项模式严格区分：
  // - 有 items → 数组语义，写入 ValueType[]（历史非法值按 [] 重新累积，不做布尔转换）
  // - 无 items → 布尔语义，直接写 boolean
  if (ctrl?.items && ctrl.items.length > 0) {
    return (
      <div className="ctrl-checkbox-container flex flex-wrap items-center gap-x-4 gap-y-2">
        {ctrl.items.map((item, index) => (
          <Label key={index} className="flex cursor-pointer items-center gap-2 font-normal">
            <Checkbox
              checked={isArray(value) && value.includes(item.value)}
              onCheckedChange={(checked) => onItemChange(item.value, checked)}
            />
            {item.label}
          </Label>
        ))}
      </div>
    );
  }

  // 单选项模式：渲染单个复选框
  return (
    <div className="ctrl-checkbox-container inline-flex">
      <Checkbox checked={!!value} onCheckedChange={onChange} />
    </div>
  );
};

export default CtrlCheckbox;
