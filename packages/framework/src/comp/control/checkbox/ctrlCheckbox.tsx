import { type ValueType } from '@/interface';
import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn } from 'ahooks';
import { Checkbox } from 'antd';
import { isUndefined } from 'lodash';
import { type SysCtrlProps } from '../interface';
import './index.less';
import { type CtrlCheckboxProps } from './interface';

const CtrlCheckbox: React.FC<SysCtrlProps<CtrlCheckboxProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);

  const onChange = useMemoizedFn((e: any, itemValue?: ValueType) => {
    if (isUndefined(itemValue)) {
      setValue(e.target.checked);
    }

    const currentValues = Array.isArray(value) ? value : [];
    if (e.target.checked) {
      setValue([...currentValues, itemValue]);
    } else {
      setValue(currentValues.filter((v: ValueType) => v !== itemValue));
    }
  });

  // 多选项模式：渲染多个复选框
  if (ctrl?.items && ctrl.items.length > 0) {
    return (
      <div className="ctrl-checkbox-container">
        {ctrl.items.map((item, index) => (
          <div key={index} className="ctrl-checkbox-item">
            <Checkbox
              checked={Array.isArray(value) && value.includes(item.value)}
              onChange={(e) => onChange(e, item.value)}
            >
              {item.label}
            </Checkbox>
          </div>
        ))}
      </div>
    );
  }

  // 单选项模式：渲染单个复选框
  return (
    <div className="ctrl-checkbox-container">
      <Checkbox checked={!!value} onChange={onChange} />
    </div>
  );
};

export default CtrlCheckbox;
