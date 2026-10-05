import { isArray } from 'lodash';
import { type SearchPlaneFormProps } from './interface';
import SearchPanelItem from './SearchPanelItem';
import SearchPanelTools from './SearchPanelTools';

/**
 * 高级筛选的条件表单
 *
 * 与表单项（FormItemLayout）共用同一套栅格：24 列制、宽屏一行四项，
 * 由容器宽度决定列数，所以面板内容再宽再窄都不会退化成"一个条件独占一行"。
 * 栅格自身声明 @container/form，作为列数查询的容器基准。
 */
const SearchPanelForm: React.FC<SearchPlaneFormProps> = (props) => {
  const { viewId, items, onSearch, onReset } = props;

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div
      className="search-panel-form @container/form grid w-full items-end gap-4"
      style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
    >
      {items.map((item, index) => (
        <SearchPanelItem key={index + '_' + item.field} viewId={viewId} item={item} />
      ))}
      <div key="tools" className="col-span-full flex justify-end">
        <SearchPanelTools onSearch={onSearch} onReset={onReset} />
      </div>
    </div>
  );
};

export default SearchPanelForm;
