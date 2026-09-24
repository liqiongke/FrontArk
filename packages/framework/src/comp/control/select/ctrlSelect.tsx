import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { type SysCtrlProps } from '../interface';
import { type CtrlSelectProps } from './interface';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { decodeOptionValue, encodeOptionValue } from '@/utils/optionValueUtils';

const CtrlSelect: React.FC<SysCtrlProps<CtrlSelectProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((id: string) => {
    // UI 字符串 ID 映射回原始 OptionItem 值，保留数字/布尔/字符串类型
    setValue(decodeOptionValue(id));
  });

  // 值未匹配任何选项时不选中（value 为 undefined/null/非选项值时显示占位符）
  const matched = ctrl?.items?.find((item) => item.value === value && value !== undefined);

  return (
    <div className="ctrl-select w-full">
      <UiSelect
        value={matched ? encodeOptionValue(matched.value) : undefined}
        onValueChange={onChange}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          {ctrl?.items?.map((item, index) => (
            <SelectItem key={index} value={encodeOptionValue(item.value)}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </div>
  );
};

export default CtrlSelect;
