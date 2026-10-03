import { useReq } from '@/stores/store/hooks/useReq';
import KeyboardKey from '@/utils/baseUtils/keyboardUtils';
import { useSafeState, useMemoizedFn } from 'ahooks';
import { isArray } from 'lodash';
import { type FC } from 'react';
import { ArrowLeft } from 'lucide-react';

import { type SearchPlaneMode, type SearchPlaneProps } from './interface';
import SearchBar from './searchBar/SearchBar';
import SearchPanelForm from './SearchPanelForm';
import { Button } from '@/ui/components/button';

// 模式记忆:按视图维度存放,失败时降级为默认单搜索框
const MODE_KEY = 'jl-search-mode:';

const readMode = (viewId: string): SearchPlaneMode => {
  try {
    return window.localStorage.getItem(MODE_KEY + viewId) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
};

const writeMode = (viewId: string, mode: SearchPlaneMode) => {
  try {
    window.localStorage.setItem(MODE_KEY + viewId, mode);
  } catch {
    // 隐私模式等场景下不可写,忽略:不影响本次会话
  }
};
/**
 * 通用的搜索面板
 *
 * 两种模式同位替换,共享同一份 criteria:
 * - simple:单个搜索框 + 条件 Tag(主动搜索,按输入推断类型)
 * - advanced:完整搜索面板(逃生门,承载区间/多选等长尾条件)
 */
const SearchPanel: FC<SearchPlaneProps> = (props) => {
  const { viewId, items, mode: controlledMode } = props;
  const [, sendReq, reset] = useReq(viewId);
  const [innerMode, setInnerMode] = useSafeState<SearchPlaneMode>(() => readMode(viewId));
  const mode = controlledMode ?? innerMode;

  const switchMode = (next: SearchPlaneMode) => {
    setInnerMode(next);
    writeMode(viewId, next);
  };

  const onSearch = useMemoizedFn(() => {
    sendReq();
  });

  const onReset = useMemoizedFn(() => {
    const resetItems = items?.map((item) => item.field);
    if (isArray(resetItems)) {
      reset(resetItems);
    }
  });

  // 处理键盘事件:simple 模式由搜索条自身处理回车,避免一次按键触发两次请求
  const handleKeyDown = useMemoizedFn((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode === 'simple') {
      return;
    }
    if (event.key === KeyboardKey.Enter) {
      onSearch();
    }
  });

  if (!isArray(items) || items.length === 0) {
    return null;
  }
  return (
    <div
      className="search-panel @container/search w-full rounded-lg border bg-card p-4 text-card-foreground sm:p-6"
      onKeyDownCapture={handleKeyDown}
    >
      {mode === 'simple' ? (
        <SearchBar viewId={viewId} items={items} onToggleAdvanced={() => switchMode('advanced')} />
      ) : (
        <div className="search-panel-advanced">
          <div className="mb-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => switchMode('simple')}>
              <ArrowLeft />
              返回快捷搜索
            </Button>
          </div>
          <SearchPanelForm viewId={viewId} items={items} onSearch={onSearch} onReset={onReset} />
        </div>
      )}
    </div>
  );
};

export default SearchPanel;