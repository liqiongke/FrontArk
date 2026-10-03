import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '@/ui/lib/utils';

const tagVariants = {
  default: 'border-transparent bg-primary/10 text-primary',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  outline: 'border-border bg-background text-foreground',
  // 已识别但置信度较低的推断结果(如按值形状推断出的日期字段)
  inferred: 'border-dashed border-primary/50 bg-background text-primary/80',
} as const;

export interface TagProps extends React.ComponentProps<'span'> {
  variant?: keyof typeof tagVariants;
  /** 删除按钮;传入后 Tag 呈现可删除形态 */
  onDelete?: () => void;
  /** 删除按钮的无障碍描述 */
  deleteLabel?: string;
}

/**
 * 条件标签:搜索面板的已生效条件展示单元
 * 删除交互由使用方决定语义(单值删除整条条件/多值删除其中一个)
 */
function Tag({ className, variant = 'default', onDelete, deleteLabel, children, ...props }: TagProps) {
  return (
    <span
      data-slot="tag"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-sm leading-5 whitespace-nowrap',
        tagVariants[variant],
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      {onDelete && (
        <button
          type="button"
          aria-label={deleteLabel ?? '删除条件'}
          className="hover:bg-foreground/10 -mr-1 cursor-pointer rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:ring-ring/50 focus-visible:ring-[2px] focus-visible:outline-none"
          onClick={(event) => {
            // 删除按钮位于 Tag 内,避免触发 Tag 自身的点击(编辑)行为
            event.stopPropagation();
            onDelete();
          }}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export { Tag, tagVariants };
