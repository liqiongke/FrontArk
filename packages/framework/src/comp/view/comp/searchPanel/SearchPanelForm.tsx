import { isArray } from 'lodash';
import type { CSSProperties } from 'react';
import { type SearchPlaneFormProps } from './interface';
import SearchPanelItem from './SearchPanelItem';
import SearchPanelTools from './SearchPanelTools';

const SearchPanelForm: React.FC<SearchPlaneFormProps> = (props) => {
  const { viewId, items, colNum = 4, onSearch, onReset } = props;

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div
      className="search-panel-form grid grid-cols-1 items-end gap-4 @min-[32rem]/search:grid-cols-2 @min-[56rem]/search:grid-cols-(--search-columns)"
      style={{ '--search-columns': `repeat(${colNum}, minmax(0, 1fr))` } as CSSProperties}
    >
      {items.map((item, index) => (
        <div
          key={index + '_' + item.field}
          className="min-w-0"
        >
          <SearchPanelItem viewId={viewId} item={item} />
        </div>
      ))}
      <div
        key="tools"
        className="col-span-full flex justify-end"
      >
        <SearchPanelTools onSearch={onSearch} onReset={onReset} />
      </div>
    </div>
  );
};

export default SearchPanelForm;
