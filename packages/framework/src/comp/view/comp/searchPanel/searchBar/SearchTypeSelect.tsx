import { ListFilter } from 'lucide-react';
import { type SearchPlaneItem } from '../interface';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { Button } from '@/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip';
import { cn } from '@/ui/lib/utils';

export interface SearchTypeSelectProps {
  items: SearchPlaneItem[];
  // 当前激活字段;为空表示未识别/未选择
  value?: string;
  // 推断置信度:none 时以主色提示需要手动选择
  unresolved?: boolean;
  onSelect: (field: string) => void;
}

/**
 * 搜索类型选择器（搜索条最左侧）
 *
 * 三条约束：
 * 1. **定宽**：不管有没有识别出类型，这里都占同一个宽度。宽度跟着文字长短变，
 *    输入区的起始位置就会边输边跳——用户刚打第一个字，整个输入区就往右挪一截。
 *    定宽后输入内容始终从同一位置开始，类型名只在槽内变化。
 * 2. 类型名常驻：边输边推断时用户需要看到「系统把这段内容当成了什么类型」，
 *    只给图标等于把这个反馈删掉。
 * 3. 类型名用弱化色（与输入内容的前景色区分开）：它是字段范围说明，不是已输入的文字，
 *    颜色拉开后才不会被误读成内容的一部分。
 */
const SearchTypeSelect: React.FC<SearchTypeSelectProps> = (props) => {
  const { items, value, unresolved, onSelect } = props;
  const current = items.find((item) => item.field === value);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              // 名称固定为「选择搜索类型」：当前字段名由可见文字、tooltip 与输入框的 aria-label 承载，
              // 避免与输入框重名
              aria-label="选择搜索类型"
              // 定宽槽 + 两端对齐：图标靠左，字段名贴住它描述的输入区
              className="h-8 w-[6.5rem] shrink-0 justify-between gap-1.5 px-2 font-normal"
            >
              <ListFilter className={cn('shrink-0', unresolved && 'text-primary')} />
              <span
                className={cn(
                  'truncate text-sm',
                  unresolved ? 'text-primary' : 'text-muted-foreground',
                )}
                // 字段名可能被截断，补 title 兜底
                title={current?.title}
              >
                {current?.title ?? '选择类型'}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{current ? '当前搜索字段：' + current.title : '选择搜索字段'}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="max-h-80 w-56">
        {items.map((item) => (
          <DropdownMenuItem key={item.field} onSelect={() => onSelect(item.field)}>
            <span className="flex-1 truncate">{item.title}</span>
            {item.example && <span className="ml-2 max-w-[9rem] truncate text-xs text-muted-foreground">{item.example}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SearchTypeSelect;
