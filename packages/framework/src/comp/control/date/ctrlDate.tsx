import { useDataState } from '@/stores/store/hooks/useValue';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { CalendarDays, X } from 'lucide-react';
import dayjs from 'dayjs';
import { useEffect, useRef } from 'react';
import { type SysCtrlProps } from '../interface';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover';
import { Calendar } from '@/ui/components/calendar';
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT, formatDate, parseDate } from '@/utils/dateUtils';
import { type CtrlDateProps } from './interface';

const TIME_DISPLAY_FORMAT = 'HH:mm:ss';

const CtrlDate: React.FC<SysCtrlProps<CtrlDateProps>> = (props) => {
  const { ctrl, path } = props;

  const [value, setValue] = useDataState(path);
  const [open, setOpen] = useSafeState(false);
  // showTime 场景的时间输入草稿:非法输入只保留在草稿中,不提交无效值
  const [timeDraft, setTimeDraft] = useSafeState<string | null>(null);
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
  const showTime = !!ctrl?.showTime;

  // store 字符串按 format 严格解析为本地 Date;空值/非法值统一视为未选择
  const selected = parseDate(value, format);
  const display = timeDraft ?? (selected ? dayjs(selected).format(TIME_DISPLAY_FORMAT) : '');

  const commit = useMemoizedFn((date: Date | null) => {
    // 清空使用空字符串;序列化严格按 format
    setValue(date ? formatDate(date, format) : '');
  });

  const onSelect = useMemoizedFn((date: Date | undefined) => {
    if (!date) {
      commit(null);
      return;
    }
    // showTime 时保留已选值的时刻部分,避免重复选择日期后时间被重置
    let combined = date;
    if (showTime && selected) {
      combined = dayjs(date)
        .hour(dayjs(selected).hour())
        .minute(dayjs(selected).minute())
        .second(dayjs(selected).second())
        .toDate();
    }
    commit(combined);
    if (!showTime) {
      setOpen(false);
    }
  });

  const onTimeChange = useMemoizedFn((text: string) => {
    setTimeDraft(text);
    // 非法时间不提交:仅在能按 HH:mm:ss 解析时合并日期并按 format 序列化
    if (!dayjs(text, TIME_DISPLAY_FORMAT, true).isValid()) {
      return;
    }
    if (!selected) {
      return;
    }
    const time = dayjs(text, TIME_DISPLAY_FORMAT);
    const combined = dayjs(selected)
      .hour(time.hour())
      .minute(time.minute())
      .second(time.second())
      .toDate();
    commit(combined);
  });

  const onTimeBlur = useMemoizedFn(() => {
    // 失焦丢弃非法草稿,回显为已提交值
    setTimeDraft(null);
  });

  const onClear = useMemoizedFn((event: React.MouseEvent) => {
    event.stopPropagation();
    commit(null);
    setTimeDraft(null);
  });

  return (
    <div className="ctrl-pickerdate-container w-full">
      <Popover open={open} onOpenChange={(next) => ctrl?.disabled ? undefined : setOpen(next)}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between px-3 font-normal"
            disabled={ctrl?.disabled}
          >
            <span className={value ? '' : 'text-muted-foreground'}>
              {value || ctrl?.placeholder || '请选择日期'}
            </span>
            {value ? (
              <X className="size-4 opacity-50 hover:opacity-100" onClick={onClear} />
            ) : (
              <CalendarDays className="size-4 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={selected ?? undefined} onSelect={onSelect} />
          {showTime && (
            <div className="border-t p-3">
              <Input
                aria-label="时间"
                placeholder={DEFAULT_TIME_FORMAT}
                value={display}
                onChange={(event) => onTimeChange(event.target.value)}
                onBlur={onTimeBlur}
                className={timeDraft && !dayjs(timeDraft, TIME_DISPLAY_FORMAT, true).isValid() ? 'aria-invalid:border-destructive border-destructive' : ''}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CtrlDate;
