import { Ctrl } from '@/comp/control/interface';
import CtrlFactory from '@/comp/ctrlFactory';
import { PathKey } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { type FC, useContext } from 'react';
import { isString } from 'lodash';
import FormItemLayout from '@view/form/formItemLayout';
import { type SearchPlaneItemProps } from './interface';

// 搜索条件的单项：与表单项共用同一套布局（标签在左、宽屏一行四项）
const SearchPanelItem: FC<SearchPlaneItemProps> = (props) => {
  const { viewId, item } = props;
  const useStore = useContext(StoreContext);
  // 搜索条件写入视图对应的请求节点 criteria(不再硬编码业务节点名),节点未就绪时不渲染
  const reqId = useStore((state) => state.getReqNodeId(viewId));

  if (!isString(reqId)) {
    return null;
  }

  return (
    <FormItemLayout title={item.title}>
      <CtrlFactory
        ctrl={item.ctrl}
        path={[PathKey.Req, reqId, 'criteria', item.field]}
        defaultCtrlType={Ctrl.Input}
      />
    </FormItemLayout>
  );
};

export default SearchPanelItem;
