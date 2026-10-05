import { type SysCtrlProps } from '@ctrl/interface';
import { useData } from '@/stores/store/hooks/useValue';
import { ViewType } from '@view/interface';
import { type CtrlTextProps } from './interface';
import { Input } from '@/ui/components/input';
import { cn } from '@/ui/lib/utils';

const CtrlText: React.FC<SysCtrlProps<CtrlTextProps>> = (props) => {
  const { ctrl, path, sourceView } = props;
  const align = ctrl?.align || 'left';
  const isRightAlign = align === 'right';

  const value = useData(path);

  // 在表单中展现的样式
  if (sourceView === ViewType.Form) {
    return (
      <Input
        className={cn('w-full', isRightAlign && 'tabular-nums')}
        style={{ textAlign: align }}
        value={value}
        disabled
      />
    );
  }

  return (
    <div
      // 右对齐（数字列）用等宽数字：各位数字宽度一致，小数点因此自然对齐；
      // 数字列同时禁止换行，避免折行破坏对齐
      className={cn(
        'ctrl-text text-foreground line-clamp-2 overflow-hidden break-all',
        isRightAlign ? 'tabular-nums whitespace-nowrap' : 'whitespace-pre-wrap',
      )}
      style={{ textAlign: align }}
    >
      {value}
    </div>
  );
};

export default CtrlText;
