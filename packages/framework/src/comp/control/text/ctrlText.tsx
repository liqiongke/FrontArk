import { type SysCtrlProps } from '@ctrl/interface';
import { useData } from '@/stores/store/hooks/useValue';
import { ViewType } from '@view/interface';
import { type CtrlTextProps } from './interface';
import { Input } from '@/ui/components/input';

const CtrlText: React.FC<SysCtrlProps<CtrlTextProps>> = (props) => {
  const { ctrl, path, sourceView } = props;
  const align = ctrl?.align || 'left';

  const value = useData(path);

  // 在表单中展现的样式
  if (sourceView === ViewType.Form) {
    return (
      <Input className="w-full" style={{ textAlign: align }} value={value} disabled />
    );
  }

  return (
    <div
      className="ctrl-text text-foreground line-clamp-2 overflow-hidden text-left break-all whitespace-pre-wrap"
      style={{ textAlign: align }}
    >
      {value}
    </div>
  );
};

export default CtrlText;
