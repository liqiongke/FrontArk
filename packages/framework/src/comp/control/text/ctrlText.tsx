import { SysCtrlProps } from '@ctrl/interface';
import useValue from '@store/useValue';
import { ViewType } from '@view/interface';
import { Input } from 'antd';
import './index.less';
import { CtrlTextProps } from './interface';

const CtrlText: React.FC<SysCtrlProps<CtrlTextProps>> = (props) => {
  const { ctrl, path, sourceView } = props;
  const align = ctrl?.align || 'left';

  const [value] = useValue(path);

  // 在表单中展现的样式
  if (sourceView === ViewType.Form) {
    return (
      <Input
        className={`align-${align}`}
        style={{ color: 'black', cursor: 'text', textAlign: align }}
        value={value}
        disabled
      />
    );
  }

  return <div className={`ctrl-text align-${align}`}>{value}</div>;
};

export default CtrlText;
