import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from 'lucide-react';
import * as React from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '@/ui/lib/utils';

/**
 * shadcn/ui Calendar（react-day-picker v9 默认 label 布局精简版）
 * 组件内部使用原生 Date；业务侧的字符串 <-> Date 转换由框架 dateUtils 负责。
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('bg-background group/calendar p-3 [--cell-size:--spacing(8)]', className)}
      classNames={{
        ...defaultClassNames,
        root: cn('w-fit', defaultClassNames.root),
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        nav: 'flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between',
        button_previous: cn(
          'size-(--button-size) bg-transparent p-0 opacity-50 hover:opacity-100 select-none rounded-md border shadow-sm hover:bg-accent inline-flex items-center justify-center',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          'size-(--button-size) bg-transparent p-0 opacity-50 hover:opacity-100 select-none rounded-md border shadow-sm hover:bg-accent inline-flex items-center justify-center',
          defaultClassNames.button_next,
        ),
        month_caption:
          'flex items-center justify-center h-(--button-size) w-full px-(--button-size)',
        dropdowns:
          'w-full flex items-center text-sm font-medium justify-center h-(--button-size) gap-1.5',
        dropdown_root: 'relative has-focus:border-ring border border-input shadow-xs rounded-md',
        caption_label: 'select-none font-medium text-sm',
        table: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none',
        week: 'flex w-full mt-2',
        day: 'relative w-full h-full p-0 text-center group/day select-none',
        day_button: cn(
          'size-(--cell-size) rounded-md p-0 font-normal text-sm hover:bg-accent transition-colors inline-flex items-center justify-center cursor-pointer',
          defaultClassNames.day_button,
        ),
        range_start: 'rounded-l-md bg-accent',
        range_end: 'rounded-r-md bg-accent',
        selected:
          'bg-primary text-primary-foreground rounded-md [&_button]:bg-primary [&_button]:text-primary-foreground',
        today: 'bg-accent text-accent-foreground rounded-md',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: (props) => {
          if (props.orientation === 'left') {
            return <ChevronLeftIcon className="size-4" {...props} />;
          }
          if (props.orientation === 'right') {
            return <ChevronRightIcon className="size-4" {...props} />;
          }
          if (props.orientation === 'up') {
            return <ChevronUpIcon className="size-4" {...props} />;
          }
          return <ChevronDownIcon className="size-4" {...props} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
