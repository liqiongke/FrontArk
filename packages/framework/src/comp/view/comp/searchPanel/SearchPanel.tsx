import { useReq } from '@/stores/store/hooks/useReq';
import { useClickAway, useMemoizedFn, useSafeState } from 'ahooks';
import { isArray } from 'lodash';
import { type FC, useEffect, useRef } from 'react';

import { type SearchPlaneProps } from './interface';
import SearchBar from './searchBar/SearchBar';
import SearchPanelForm from './SearchPanelForm';

/**
 * 通用的搜索面板
 *
 * 面板结构固定：搜索条 + 条件行 + 右侧快捷操作（重置/高级筛选/表格工具）。
 *
 * 高级筛选是一块「浮在表格上的面板」而不是模态弹窗：
 * - 就地渲染在搜索面板内（`absolute inset-x-0`），宽度与表格严格一致；
 * - 没有遮罩：把条件铺开的同时仍能看见下面的数据，也少了弹窗的阻断感；
 * - 点击面板与触发按钮之外的任意位置即关闭，Esc 同样关闭；
 * - 绝对定位不参与文档流，展开/收起不会引起表格跳动。
 */
const SearchPanel: FC<SearchPlaneProps> = (props) => {
  const { viewId, items, tools } = props;
  const [, sendReq, reset] = useReq(viewId);
  const [advancedOpen, setAdvancedOpen] = useSafeState(false);
  const advancedRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onSearch = useMemoizedFn(() => {
    sendReq();
  });

  const onReset = useMemoizedFn(() => {
    const resetItems = items?.map((item) => item.field);
    if (isArray(resetItems)) {
      reset(resetItems);
    }
  });

  // 无遮罩的面板没有"阻止外部交互"这层语义，外部点击就是唯一的取消手势。
  // 触发按钮要排除在外，否则点它会先被判定为外部点击而关掉。
  useClickAway(() => setAdvancedOpen(false), [advancedRef, triggerRef]);

  useEffect(() => {
    if (!advancedOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAdvancedOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [advancedOpen, setAdvancedOpen]);

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    // 不再自带卡片外观：面板底色由所属容器（表格面板）统一提供，
    // mb-4 是与下方表格的间距；无搜索项时组件整体不渲染，间距随之消失。
    // relative 供高级筛选面板以 inset-x-0 对齐表格宽度
    <div className="search-panel @container/search relative mb-4 w-full">
      <SearchBar
        viewId={viewId}
        items={items}
        tools={tools}
        advancedTriggerRef={triggerRef}
        onToggleAdvanced={() => setAdvancedOpen((prev) => !prev)}
      />

      {advancedOpen && (
        <div
          ref={advancedRef}
          role="dialog"
          aria-label="高级筛选"
          data-slot="search-advanced-panel"
          // top-full 落在条件行下方并覆盖表格；z-30 高于吸顶表头(z-10)
          className="bg-card text-card-foreground absolute inset-x-0 top-full z-30 mt-2 rounded-lg border p-4 shadow-md"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">高级筛选</span>
            <span className="text-muted-foreground text-xs">
              组合多个条件精确筛选，查询后按新条件重新取数
            </span>
          </div>
          <SearchPanelForm
            viewId={viewId}
            items={items}
            onSearch={() => {
              onSearch();
              setAdvancedOpen(false);
            }}
            onReset={onReset}
          />
        </div>
      )}
    </div>
  );
};

export default SearchPanel;
