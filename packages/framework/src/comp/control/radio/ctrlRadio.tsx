import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { type SysCtrlProps } from '../interface';
import { type CtrlRadioProps } from './interface';
import { Label } from '@/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@/ui/components/radio-group';
import { decodeOptionValue, encodeOptionValue } from '@/utils/optionValueUtils';
import { type ValueType } from '@/interface';

const CtrlRadio: React.FC<SysCtrlProps<CtrlRadioProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((id: string) => {
    // 键盘方向键切换等 onValueChange 场景：映射回原始值
    setValue(decodeOptionValue(id));
  });

  const onOptionClick = useMemoizedFn((optionValue: ValueType) => {
    // 已声明意图：再次点击当前选中项取消勾选
    // (重复点击选中项时 Radix 值未变化，不会触发 onValueChange，取消不会被覆盖)
    if (optionValue === value) {
      setValue(undefined);
    } else {
      setValue(optionValue);
    }
  });

  return (
    <div className="ctrl-radio-container flex flex-wrap items-center gap-x-4 gap-y-2">
      <RadioGroup
        value={encodeOptionValue(value as ValueType)}
        onValueChange={onChange}
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        {ctrl?.items?.map((option, index) => (
          <Label
            key={index}
            className="flex cursor-pointer items-center gap-2 font-normal"
            onClick={() => onOptionClick(option.value)}
          >
            <RadioGroupItem value={encodeOptionValue(option.value)} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
};

export default CtrlRadio;
