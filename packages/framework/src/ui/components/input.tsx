import * as React from 'react';

import { cn } from '@/ui/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        // 焦点环用 1px 而不是 3px：ring 是向外扩展的投影，3px 光环会让输入框
        // 视觉上"胀大一圈"，读起来像控件变大了。改为 1px 后外轮廓几乎不变，
        // 焦点状态由边框变色（border-ring）承担，可见度不减。
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-1',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
