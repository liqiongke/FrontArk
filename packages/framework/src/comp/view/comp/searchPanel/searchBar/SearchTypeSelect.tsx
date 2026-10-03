import { ChevronDown } from 'lucide-react';
import { type SearchPlaneItem } from '../interface';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { Button } from '@/ui/components/button';

export interface SearchTypeSelectProps {
  items: SearchPlaneItem[];
  // 当前激活字段;为空表示未识别/未选择
  value?: string;
  // 推断置信度:none 时以虚线下划线提示需要手动选择
  unresolved?: boolean;
  onSelect: (field: string) => void;
}

/**
 * 搜索类型选择器:搜索条左侧的类型入口
 * 未识别到类型时显示虚线下划线的「选择搜索类型」,识别后显示字段标题
 */
const SearchTypeSelect: React.FC<SearchTypeSelectProps> = (props) => {
  const { items, value, unresolved, onSelect } = props;
  const current = items.find((item) => item.field === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-[148px] shrink-0 justify-between rounded-md px-2 font-normal"
          aria-label="选择搜索类型"
        >
          {current ? (
            <span className="truncate">{current.title}</span>
          ) : (
            <span className={unresolved ? 'text-primary underline decoration-dashed underline-offset-4' : 'text-muted-foreground'}>
              选择搜索类型
            </span>
          )}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
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
