import { type SysCtrlProps } from '@ctrl/interface';
import { useData } from '@/stores/store/hooks/useValue';
import { ViewType } from '@view/interface';
import { type CtrlTextProps } from './interface';
import { Input } from '@/ui/components/input';
import { cn } from '@/ui/lib/utils';

const CtrlText: React.FC<SysCtrlProps<CtrlTextProps>> = (props) => {
  const { ctrl, path, sourceView } = props;
  // 对齐不设默认值：表单里未声明时由 Input 基线（居右）决定；
  // 表格单元格的对齐始终由 BoundTableCell 按列配置注入，写死默认值反而会盖掉列对齐
  const align = ctrl?.align;
  const isRightAlign = align === 'right';

  const value = useData(path);

  // 在表单中展现的样式
  if (sourceView === ViewType.Form) {
    return (
      <Input
        className={cn('w-full', isRightAlign && 'tabular-nums')}
        style={{ textAlign: align }}
        // 空值统一给空串：始终受控，避免数据后到时时触发
        // 「uncontrolled -> controlled」的 React 警告（只读展示型字段很常见）
        value={value ?? ''}
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
