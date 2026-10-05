import { useReq } from '@/stores/store/hooks/useReq';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { isArray } from 'lodash';
import { type FC } from 'react';

import { type SearchPlaneProps } from './interface';
import SearchBar from './searchBar/SearchBar';
import SearchPanelForm from './SearchPanelForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';

/**
 * 通用的搜索面板
 *
 * 面板结构固定：搜索条位于右上角，条件行右侧挂通用工具；
 * 「高级筛选」改为弹窗承载全部搜索条件，不再替换面板内容——
 * 打开条件时面板不会重排，表格位置保持稳定（旧实现整块替换会导致表格跳动）。
 */
const SearchPanel: FC<SearchPlaneProps> = (props) => {
  const { viewId, items, tools } = props;
  const [, sendReq, reset] = useReq(viewId);
  const [advancedOpen, setAdvancedOpen] = useSafeState(false);

  const onSearch = useMemoizedFn(() => {
    sendReq();
  });

  const onReset = useMemoizedFn(() => {
    const resetItems = items?.map((item) => item.field);
    if (isArray(resetItems)) {
      reset(resetItems);
    }
  });

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    // 不再自带卡片外观：面板底色由所属容器（表格面板）统一提供，
    // mb-4 是与下方表格的间距；无搜索项时组件整体不渲染，间距随之消失
    <div className="search-panel @container/search mb-4 w-full">
      <SearchBar
        viewId={viewId}
        items={items}
        tools={tools}
        onToggleAdvanced={() => setAdvancedOpen(true)}
      />

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>高级筛选</DialogTitle>
            <DialogDescription>
              组合多个条件精确筛选，查询后按新条件重新取数。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto px-1 py-2">
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
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SearchPanel;
