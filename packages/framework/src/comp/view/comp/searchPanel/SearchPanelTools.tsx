import { Search, RotateCcw } from 'lucide-react';
import { type FC } from 'react';
import { Button } from '@/ui/components/button';

export interface SearchPanelToolsProps {
  /** 搜索按钮点击事件 */
  onSearch?: () => void;
  /** 撤回按钮点击事件 */
  onReset?: () => void;
}

// 搜索面板工具组件
const SearchPanelTools: FC<SearchPanelToolsProps> = (props) => {
  const { onSearch, onReset } = props;

  return (
    <div className="search-panel-tools flex items-center gap-2">
      <Button aria-label="搜索" size="icon-sm" className="rounded-full" onClick={onSearch}>
        <Search />
      </Button>
      <Button aria-label="重置" size="icon-sm" variant="outline" className="rounded-full" onClick={onReset}>
        <RotateCcw />
      </Button>
    </div>
  );
};

export default SearchPanelTools;
