import { Ctrl } from '@/comp/control/interface';
import CtrlFactory from '@/comp/ctrlFactory';
import { FC } from 'react';
import './index.less';
import { SearchPlaneItemProps } from './interface';
import { PathKey } from '@/stores/store/interface';

// 搜索下拉面板面板
const SearchPanelItem: FC<SearchPlaneItemProps> = (props) => {
  const { item } = props;

  return (
    <div className="search-panel-item">
      <div className="title">{item.title}</div>
      <div className="ctrl">
        <CtrlFactory
          ctrl={item.ctrl}
          path={[PathKey.Req, 'table', 'criteria', item.field]}
          defaultCtrlType={Ctrl.Input}
        />
      </div>
    </div>
  );
};

export default SearchPanelItem;
