import { type SearchConditionTag } from '../interface';
import { Tag } from '@/ui/components/tag';
import { cn } from '@/ui/lib/utils';

export interface SearchTagItemProps {
  tag: SearchConditionTag;
  // 删除整条条件
  onRemove: (field: string) => void;
  // 点击载入草稿区编辑
  onEdit: (field: string) => void;
}

/**
 * 单个已生效条件:
 * 字段名 + 值 + 删除;低置信度推断(如按值形状识别)用虚线边框弱化提示
 */
const SearchTagItem: React.FC<SearchTagItemProps> = (props) => {
  const { tag, onRemove, onEdit } = props;

  return (
    <Tag
      variant={tag.confidence === 'inferred' ? 'inferred' : 'secondary'}
      className={cn('cursor-pointer', 'hover:bg-accent')}
      title={`${tag.title}：${tag.text}`}
      deleteLabel={'删除条件：' + tag.title + ' ' + tag.text}
      onDelete={() => onRemove(tag.field)}
      onClick={() => onEdit(tag.field)}
    >
      <span className="text-muted-foreground">{tag.title}</span>
      <span className="mx-1 opacity-40">:</span>
      <span>{tag.text}</span>
    </Tag>
  );
};

export default SearchTagItem;
