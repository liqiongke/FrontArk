import { Ctrl } from '@/comp/control/interface';
import CtrlFactory from '@/comp/ctrlFactory';
import { PathKey } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { type FC, useContext } from 'react';
import { isString } from 'lodash';
import { type SearchPlaneItemProps } from './interface';

// 搜索下拉面板面板
const SearchPanelItem: FC<SearchPlaneItemProps> = (props) => {
  const { viewId, item } = props;
  const useStore = useContext(StoreContext);
  // 搜索条件写入视图对应的请求节点 criteria(不再硬编码业务节点名),节点未就绪时不渲染
  const reqId = useStore((state) => state.getReqNodeId(viewId));

  if (!isString(reqId)) {
    return null;
  }

  return (
    <div className="search-panel-item flex h-(--density-control-height) items-center">
      <div className="title w-[30%] shrink-0 truncate pr-1 text-sm text-muted-foreground">{item.title}</div>
      <div className="ctrl w-[70%] min-w-0">
        <CtrlFactory
          ctrl={item.ctrl}
          path={[PathKey.Req, reqId, 'criteria', item.field]}
          defaultCtrlType={Ctrl.Input}
        />
      </div>
    </div>
  );
};

export default SearchPanelItem;
