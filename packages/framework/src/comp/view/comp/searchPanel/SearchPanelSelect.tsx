import { ChevronDown, Search } from 'lucide-react';
import { isArray } from 'lodash';
import { type FC, useMemo } from 'react';
import { type SearchPlaneSelectProps } from './interface';
import CtrlFactory from '@/comp/ctrlFactory';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';

// 通用的搜索面板(下拉式)
const SearchPanelSelect: FC<SearchPlaneSelectProps> = (props) => {
  const { items } = props;

  const options = useMemo(() => {
    if (!isArray(items)) {
      return [];
    }
    return items.map((item) => ({
      label: item.title,
      key: item.field,
    }));
  }, [items]);

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className="search-panel-select flex w-[360px] items-center justify-center rounded-md border">
      <div className="title flex w-[132px] shrink-0 items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            选择类型
            <ChevronDown className="size-4 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {options.map((option) => (
              <DropdownMenuItem key={option.key}>{option.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="content h-(--density-control-height) w-full min-w-0">
        <CtrlFactory />
      </div>
      <div className="btn flex w-[48px] shrink-0 cursor-pointer items-center justify-center">
        <Search className="size-4" />
      </div>
    </div>
  );
};

export default SearchPanelSelect;
