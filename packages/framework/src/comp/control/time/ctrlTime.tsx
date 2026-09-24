import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn, useSafeState } from 'ahooks';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { type SysCtrlProps } from '../interface';
import { Input } from '@/ui/components/input';
import { DEFAULT_TIME_FORMAT } from '@/utils/dateUtils';
import { type CtrlTimeProps } from './interface';

const CtrlTime: React.FC<SysCtrlProps<CtrlTimeProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);
  // 输入草稿:非法时间只保留在草稿中,不提交无效值;失焦回显已提交值
  const [draft, setDraft] = useSafeState<string | null>(null);
  // defaultValue 仅作为初始值兜底,不覆盖已有数据或用户清空结果
  const defaultValueApplied = useRef(false);

  useEffect(() => {
    if (defaultValueApplied.current) {
      return;
    }
    defaultValueApplied.current = true;
    if ((value === undefined || value === null) && ctrl?.defaultValue !== undefined) {
      setValue(ctrl.defaultValue);
    }
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // showSecond 决定秒编辑区是否显示;显式 format 优先
  const format = ctrl?.format || (ctrl?.showSecond === false ? 'HH:mm' : DEFAULT_TIME_FORMAT);

  const isValid = (text: string) => dayjs(text, format, true).isValid();

  const onChange = useMemoizedFn((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    if (isValid(event.target.value)) {
      setValue(event.target.value);
    }
  });

  const onBlur = useMemoizedFn(() => {
    setDraft(null);
  });

  const onClear = useMemoizedFn(() => {
    // 清空使用空字符串
    setValue('');
    setDraft(null);
  });

  const display = draft ?? value ?? '';
  const invalid = draft !== null && !isValid(draft);

  return (
    <div className="ctrl-pickertime-container relative w-full">
      <Input
        placeholder={ctrl?.placeholder || '请选择时间'}
        disabled={ctrl?.disabled}
        value={display}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        className="pr-7"
      />
      {!!value && !ctrl?.disabled && (
        <button
          type="button"
          aria-label="清空时间"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};

export default CtrlTime;
