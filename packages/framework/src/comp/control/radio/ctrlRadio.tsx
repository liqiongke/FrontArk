import useValue from '@store/useValue';
import { useMemoizedFn } from 'ahooks';
import { Radio } from 'antd';
import { SysCtrlProps } from '../interface';
import './index.less';
import { CtrlRadioProps } from './interface';

const CtrlRadio: React.FC<SysCtrlProps<CtrlRadioProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useValue(path);

  const onChange = useMemoizedFn((e: any) => {
    // 如果点击的是当前选中的值，则取消勾选
    if (e.target.value === value) {
      setValue(undefined);
    } else {
      setValue(e.target.value);
    }
  });

  return (
    <div className="ctrl-radio-container">
      <Radio.Group onChange={onChange} value={value}>
        {ctrl?.items?.map((option, index) => (
          <Radio key={index} value={option.value}>
            {option.label}
          </Radio>
        ))}
      </Radio.Group>
    </div>
  );
};

export default CtrlRadio;
