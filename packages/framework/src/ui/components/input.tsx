import * as React from 'react';

import { cn } from '@/ui/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        // 值统一居右：表单标签右对齐，值也贴同一条右边线，输入内容与标签形成整齐的两列。
        // 需要别的对齐（如分页每页条数居中、表格数字列）由调用方在 className 里覆盖。
        'text-right',
        // 焦点态只用「边框略微加深」表达：不加任何外发光/投影（ring 是向外的 box-shadow，
        // 会让输入框看起来胀大一圈）。ring/60 让边框比默认 ring 更浅，
        // 既区别于未聚焦的 input 灰，又保持克制。
        'focus-visible:border-ring/60',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
