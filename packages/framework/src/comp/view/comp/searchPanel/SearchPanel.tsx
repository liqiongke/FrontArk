import { useReq } from '@/stores/store/hooks/useReq';
import KeyboardKey from '@/utils/baseUtils/keyboardUtils';
import { useMemoizedFn } from 'ahooks';
import { isArray } from 'lodash';
import { FC } from 'react';
import './index.less';
import { SearchPlaneProps } from './interface';
import SearchPanelForm from './SearchPanelForm';

// 通用的搜索面板
const SearchPanel: FC<SearchPlaneProps> = (props) => {
  const { viewId, items } = props;
  const [params, sendReq, reset] = useReq(viewId);

  const onSearch = useMemoizedFn(() => {
    sendReq();
  });

  const onReset = useMemoizedFn(() => {
    const resetItems = items?.map((item) => item.field);
    if (isArray(resetItems)) {
      reset(resetItems);
    }
  });

  // 处理键盘事件
  const handleKeyDown = useMemoizedFn((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === KeyboardKey.Enter) {
      onSearch();
    }
  });

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className="search-panel" onKeyDownCapture={handleKeyDown}>
      <SearchPanelForm viewId={viewId} items={items} onSearch={onSearch} onReset={onReset} />
    </div>
  );
};

export default SearchPanel;
