import useValue from '@/framework/store/useStoreValue';
import { Input } from 'antd';
import { ViewType } from '../../view/interface';
import { TextAlign } from '../base/interface';
import { SysCtrlProps } from '../interface';
import './index.less';
import { CtrlTextProps } from './interface';

const CtrlText: React.FC<SysCtrlProps<CtrlTextProps>> = (props) => {
  const { ctrl, path, sourceView } = props;
  const align = ctrl?.align || TextAlign.LEFT;

  const [value] = useValue(path);

  // 表单样式
  if (sourceView === ViewType.VIEW_FORM) {
    return <Input value={value} disabled />
  }

  return (
    <div className={`ctrl-text align-${align}`}>
      {value}
    </div>
  );
};

export default CtrlText;
