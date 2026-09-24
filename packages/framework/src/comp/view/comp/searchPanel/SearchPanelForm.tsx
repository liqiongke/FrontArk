import { floor, isArray } from 'lodash';
import { type SearchPlaneFormProps } from './interface';
import SearchPanelItem from './SearchPanelItem';
import SearchPanelTools from './SearchPanelTools';

const SearchPanelForm: React.FC<SearchPlaneFormProps> = (props) => {
  const { viewId, items, colNum = 6, onSearch, onReset } = props;
  const colSize = floor(24 / colNum);

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div
      className="search-panel-form grid gap-x-3 gap-y-1"
      style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
    >
      {items.map((item, index) => (
        <div
          key={index + '_' + item.field}
          style={{ gridColumn: `span ${colSize} / span ${colSize}`, minWidth: 0 }}
        >
          <SearchPanelItem viewId={viewId} item={item} />
        </div>
      ))}
      <div
        key="tools"
        style={{ gridColumn: `span ${colSize} / span ${colSize}`, minWidth: 0 }}
      >
        <SearchPanelTools onSearch={onSearch} onReset={onReset} />
      </div>
    </div>
  );
};

export default SearchPanelForm;
