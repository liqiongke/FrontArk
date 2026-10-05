import { useMemo } from 'react';
import { isArray } from 'lodash';

import { type SearchConditionTag } from '../interface';
import SearchTagItem from './SearchTagItem';
import { Button } from '@/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover';

export interface SearchTagBarProps {
  tags: SearchConditionTag[];
  onRemove: (field: string) => void;
  onEdit: (field: string) => void;
  onClearAll?: () => void;
  // 超出该数量后折叠为「+N 更多」
  maxVisible?: number;
}

/**
 * 已生效条件区:Tag 列表即 criteria 的可视化,删除/编辑直接作用于条件本身
 * Tag 由 criteria 派生,自身不持有状态,因此与高级筛选面板天然双向同步
 */
const SearchTagBar: React.FC<SearchTagBarProps> = (props) => {
  const { tags, onRemove, onEdit, onClearAll, maxVisible = 6 } = props;
  const visible = useMemo(() => (isArray(tags) ? tags.slice(0, maxVisible) : []), [tags, maxVisible]);
  const rest = useMemo(() => (isArray(tags) ? tags.slice(maxVisible) : []), [tags, maxVisible]);

  if (!isArray(tags) || tags.length === 0) {
    return null;
  }

  return (
    // 与搜索框同处一行，不再为「独占一行的提示文本」留上边距
    <div className="search-tag-bar flex flex-wrap items-center gap-1.5">
      {visible.map((tag) => (
        <SearchTagItem key={tag.field} tag={tag} onRemove={onRemove} onEdit={onEdit} />
      ))}
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground">
              {'+' + rest.length + ' 更多'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <div className="flex flex-wrap gap-1.5">
              {rest.map((tag) => (
                <SearchTagItem key={tag.field} tag={tag} onRemove={onRemove} onEdit={onEdit} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {onClearAll && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={onClearAll}>
          清空条件
        </Button>
      )}
    </div>
  );
};

export default SearchTagBar;
