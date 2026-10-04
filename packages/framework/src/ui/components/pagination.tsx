import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { cn } from '@/ui/lib/utils';

/** 页码项：具体页码或折叠省略号 */
export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

/** 每页条数候选 */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * 生成页码序列：始终保留首页与末页，当前页两侧各留 siblingCount 页，中间缺口折叠成省略号。
 *
 * 总页数不超过可展示槽位时全部列出，避免出现"1 … 2"这类无意义的省略号。
 * 入参越界（当前页小于 1 或大于总页数）时先夹紧，保证输出始终可用。
 */
export const getPageItems = (current: number, totalPages: number, siblingCount = 1): PageItem[] => {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const page = Math.min(Math.max(1, Math.floor(current) || 1), total);
  // 首末页 + 当前页 + 两侧省略号 + 当前页两侧各 siblingCount
  const slots = siblingCount * 2 + 5;
  if (total <= slots) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const start = Math.max(2, page - siblingCount);
  const end = Math.min(total - 1, page + siblingCount);
  const items: PageItem[] = [1];
  if (start > 2) {
    items.push('ellipsis-start');
  }
  for (let item = start; item <= end; item += 1) {
    items.push(item);
  }
  if (end < total - 1) {
    items.push('ellipsis-end');
  }
  items.push(total);
  return items;
};

export interface PaginationProps extends Omit<React.ComponentProps<'nav'>, 'onChange'> {
  /** 当前页码（从 1 开始） */
  current: number;
  /** 每页条数 */
  pageSize: number;
  /** 总条数 */
  total: number;
  /** 每页条数候选 */
  pageSizeOptions?: number[];
  /** 请求进行中：禁用交互，避免连点造成请求竞态 */
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * 分页操作条：左侧总数、中间翻页（带省略号折叠）、右侧每页条数与跳页。
 * 纯受控组件，不感知数据来源，便于在表格以外的场景复用。
 */
const Pagination: React.FC<PaginationProps> = (props) => {
  const {
    current,
    pageSize,
    total,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    disabled = false,
    onPageChange,
    onPageSizeChange,
    className,
    ...restProps
  } = props;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const pageItems = getPageItems(current, totalPages);
  const [draft, setDraft] = React.useState('');

  // 页码或每页条数变化后清空跳页输入，避免残留上一次的输入
  React.useEffect(() => {
    setDraft('');
  }, [current, pageSize]);

  const onJump = () => {
    const parsed = Number(draft);
    if (draft === '' || !Number.isFinite(parsed)) {
      setDraft('');
      return;
    }
    const next = Math.min(Math.max(1, Math.floor(parsed)), totalPages);
    setDraft('');
    if (next !== current) {
      onPageChange(next);
    }
  };

  return (
    <nav
      data-slot="pagination"
      aria-label="分页"
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3', className)}
      {...restProps}
    >
      <span className="text-muted-foreground text-sm">
        共 {total} 条 / {totalPages} 页
      </span>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          disabled={disabled || current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft />
        </Button>
        {pageItems.map((item) =>
          typeof item === 'number' ? (
            <Button
              key={item}
              type="button"
              variant={item === current ? 'default' : 'outline'}
              size="icon-sm"
              aria-label={`第 ${item} 页`}
              aria-current={item === current ? 'page' : undefined}
              disabled={disabled}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span
              key={item}
              aria-hidden="true"
              className="text-muted-foreground flex size-8 items-center justify-center text-sm"
            >
              …
            </span>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="下一页"
          disabled={disabled || current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">每页</span>
          <Select
            value={String(pageSize)}
            disabled={disabled}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger size="sm" className="w-[76px]" aria-label="每页条数">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">条</span>
        </div>

        <form
          className="flex items-center gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            onJump();
          }}
        >
          <span className="text-muted-foreground">跳至</span>
          <Input
            value={draft}
            disabled={disabled}
            inputMode="numeric"
            aria-label="跳至页码"
            className="h-8 w-[60px] px-2 text-center"
            // 只保留数字，避免用户输入 "2e3"/"-1" 这类无法解释的内容
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
          />
          <span className="text-muted-foreground">页</span>
        </form>
      </div>
    </nav>
  );
};

export default Pagination;
