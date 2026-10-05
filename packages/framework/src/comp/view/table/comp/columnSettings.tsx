import { Columns3, GripVertical } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/components/button';
import { Checkbox } from '@/ui/components/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip';
import { type ColumnSettingsProps } from '../interface';

/**
 * 列设置：勾选控制列是否展示，拖拽调整列顺序。
 *
 * 拖拽用原生 HTML5 拖放并把「正在拖的列」记在组件状态里，不依赖 dataTransfer：
 * 一是 dataTransfer 在部分环境（含测试环境）不可用，二是同一次拖拽内
 * 不涉及跨窗口/跨组件传递数据，状态足够。
 * 顺序在 dragover 时就地更新（实时预览），放下即完成，无需 drop 才生效。
 */
const ColumnSettings: React.FC<ColumnSettingsProps> = (props) => {
  const { allColumns, hiddenKeys, onToggle, onMove, onReset } = props;
  const [open, setOpen] = useState(false);
  // 正在拖拽的列：ref 承载判定（dragstart 与紧随的 dragover 之间不保证有渲染），
  // state 只用于拖拽中的样式
  const dragKeyRef = useRef<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const visibleCount = useMemo(
    () => allColumns.filter((col) => !hiddenKeys.includes(col.key)).length,
    [allColumns, hiddenKeys],
  );

  const onDragStart = useCallback((key: string) => {
    dragKeyRef.current = key;
    setDragKey(key);
  }, []);

  const onDragEnd = useCallback(() => {
    dragKeyRef.current = null;
    setDragKey(null);
  }, []);

  const onDragOverItem = useCallback(
    (event: React.DragEvent<HTMLLIElement>, key: string) => {
      // 阻止默认行为才会持续派发 dragover，实时换位才有后续事件
      event.preventDefault();
      const from = dragKeyRef.current;
      if (!from || from === key) {
        return;
      }
      onMove(from, key);
    },
    [onMove],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="列设置"
              aria-expanded={open}
              className={cn(open && 'border-ring/60')}
            >
              <Columns3 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>列设置：勾选展示、拖拽排序</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-sm font-medium">列设置</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="恢复默认列设置"
            className="h-7 px-2 text-xs"
            onClick={onReset}
          >
            重置
          </Button>
        </div>
        <ul className="max-h-72 overflow-auto" data-slot="column-settings-list">
          {allColumns.map((col) => {
            const visible = !hiddenKeys.includes(col.key);
            // 至少要留一列：仅剩最后一列可见时不允许再取消勾选
            const lastVisible = visible && visibleCount <= 1;
            return (
              <li
                key={col.key}
                draggable
                data-column-settings-item={col.key}
                onDragStart={() => onDragStart(col.key)}
                onDragOver={(event) => onDragOverItem(event, col.key)}
                onDragEnd={onDragEnd}
                onDrop={(event) => {
                  event.preventDefault();
                  onDragEnd();
                }}
                className={cn(
                  'group/col-item flex cursor-grab items-center gap-2 rounded-sm px-1 py-1.5 text-sm select-none',
                  'hover:bg-accent hover:text-accent-foreground',
                  dragKey === col.key && 'bg-muted opacity-60',
                )}
              >
                <GripVertical
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0 opacity-60 group-hover/col-item:opacity-100"
                />
                <Checkbox
                  checked={visible}
                  disabled={lastVisible}
                  aria-label={`展示「${col.title}」列`}
                  onCheckedChange={(checked) => onToggle(col.key, checked === true)}
                />
                <span className="truncate" title={col.title}>
                  {col.title}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground px-1 pt-1.5 text-xs">拖拽调整列顺序，勾选控制是否展示</p>
      </PopoverContent>
    </Popover>
  );
};

export default ColumnSettings;
