import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn, useSafeState } from 'ahooks';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { type SysCtrlProps } from '../interface';
import { Input } from '@/ui/components/input';
import { DEFAULT_TIME_FORMAT, toRangeStrings } from '@/utils/dateUtils';
import { type CtrlTimeRangeProps } from './interface';

const CtrlTimeRange: React.FC<SysCtrlProps<CtrlTimeRangeProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);
  // 输入草稿(起/止):非法时间只保留在草稿中,不提交无效值
  const [draft, setDraft] = useSafeState<[string | null, string | null]>([null, null]);
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

  const format = ctrl?.format || (ctrl?.showSecond === false ? 'HH:mm' : DEFAULT_TIME_FORMAT);
  const isValid = (text: string) => dayjs(text, format, true).isValid();

  // store 保持两个字符串;读取兼容 undefined 与既有空值
  const [startText, endText] = toRangeStrings(value);

  const onFieldChange = useMemoizedFn((fieldIndex: 0 | 1, text: string) => {
    setDraft((prev) => {
      const next: [string | null, string | null] = [prev[0], prev[1]];
      next[fieldIndex] = text;
      return next;
    });
    if (!isValid(text)) {
      return;
    }
    // useMemoizedFn 始终以最新渲染闭包执行:startText/endText 即最新提交值
    const next: [string, string] = [startText, endText];
    next[fieldIndex] = text;
    setValue(next);
  });

  const onBlur = useMemoizedFn(() => {
    setDraft([null, null]);
  });

  const onClear = useMemoizedFn(() => {
    // 清空范围使用两个空字符串
    setValue(['', '']);
    setDraft([null, null]);
  });

  const placeholders = ctrl?.placeholder || ['开始时间', '结束时间'];
  const hasValue = !!(startText || endText);

  const renderField = (fieldIndex: 0 | 1) => {
    const committed = fieldIndex === 0 ? startText : endText;
    const draftText = draft[fieldIndex];
    const display = draftText ?? committed ?? '';
    const invalid = draftText !== null && !isValid(draftText);
    return (
      <Input
        placeholder={placeholders[fieldIndex]}
        disabled={ctrl?.disabled}
        value={display}
        onChange={(event) => onFieldChange(fieldIndex, event.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      />
    );
  };

  return (
    <div className="ctrl-pickertime-container flex w-full items-center gap-1">
      {renderField(0)}
      <span className="text-muted-foreground shrink-0">~</span>
      {renderField(1)}
      {hasValue && !ctrl?.disabled && (
        <button
          type="button"
          aria-label="清空时间"
          onClick={onClear}
          className="text-muted-foreground shrink-0 cursor-pointer hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};

export default CtrlTimeRange;
