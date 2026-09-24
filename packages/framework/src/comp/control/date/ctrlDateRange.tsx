import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { CalendarRange, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { type DateRange } from 'react-day-picker';
import { type SysCtrlProps } from '../interface';
import { Button } from '@/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover';
import { Calendar } from '@/ui/components/calendar';
import { DEFAULT_DATE_FORMAT, formatDate, parseDate, toRangeStrings } from '@/utils/dateUtils';
import { type CtrlDateRangeProps } from './interface';

const CtrlDateRange: React.FC<SysCtrlProps<CtrlDateRangeProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);
  const [open, setOpen] = useSafeState(false);
  // 范围选择中间态(仅选中开始):只保留在 UI,不向共享数据写入无效 Date
  const [draftRange, setDraftRange] = useSafeState<DateRange | undefined>(undefined);
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

  const format = ctrl?.format || DEFAULT_DATE_FORMAT;

  // store 保持两个字符串;读取兼容 undefined 与既有空值
  const [startText, endText] = toRangeStrings(value);
  const selected: DateRange | undefined =
    startText && endText
      ? { from: parseDate(startText, format) ?? undefined, to: parseDate(endText, format) ?? undefined }
      : draftRange;

  const display =
    startText || endText ? `${startText || '...'} ~ ${endText || '...'}` : '';

  const onRangeSelect = useMemoizedFn((range: DateRange | undefined) => {
    setDraftRange(range);
    // 只有起止都已选才提交;未选完时保持中间态并支持取消/重选
    if (range?.from && range?.to) {
      setValue([formatDate(range.from, format), formatDate(range.to, format)]);
      setDraftRange(undefined);
      setOpen(false);
    }
  });

  const onClear = useMemoizedFn((event: React.MouseEvent) => {
    event.stopPropagation();
    // 清空范围使用两个空字符串
    setValue(['', '']);
    setDraftRange(undefined);
  });

  const placeholders = ctrl?.placeholder || ['开始日期', '结束日期'];

  return (
    <div className="ctrl-pickerdate-container w-full">
      <Popover open={open} onOpenChange={(next) => (ctrl?.disabled ? undefined : setOpen(next))}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between px-3 font-normal"
            disabled={ctrl?.disabled}
          >
            <span className={display ? '' : 'text-muted-foreground'}>
              {display || `${placeholders[0]} ~ ${placeholders[1]}`}
            </span>
            {display ? (
              <X className="size-4 opacity-50 hover:opacity-100" onClick={onClear} />
            ) : (
              <CalendarRange className="size-4 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="range" numberOfMonths={2} selected={selected} onSelect={onRangeSelect} />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CtrlDateRange;
