import { isArray } from 'lodash';
import { FC } from 'react';
import './index.less';
import { SearchPlaneProps } from './interface';
import SearchPanelForm from './SearchPanelForm';
import { useReq } from '@/stores/store/hooks/useReq';

// 通用的搜索面板
const SearchPanel: FC<SearchPlaneProps> = (props) => {
  const { viewId, items } = props;
  const [params, sendReq] = useReq(viewId);

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className="search-panel">
      {JSON.stringify(params)}
      <SearchPanelForm viewId={viewId} items={items} />
    </div>
  );
};

export default SearchPanel;
