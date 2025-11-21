import { isUndefined } from 'lodash';
import React, { useContext } from 'react';
import LayoutFlex from './view/flex/layoutFlex';
import ViewForm from './view/form/viewForm';
import { ViewType } from './view/interface';
import ViewTable from './view/table/viewTable';
import StoreContext from '../stores/store/storeContext';

// 组件映射
const ViewTypeMap = new Map<string, React.FC<any>>([
  // 布局类组件
  [ViewType.LAYOUT_FLEX, LayoutFlex],
  // 视图类组件
  [ViewType.VIEW_TABLE, ViewTable],
  [ViewType.VIEW_FORM, ViewForm],
]);

/**
 * 组件工厂
 * @param props
 * @returns
 */
const CompFactory: React.FC<{ viewId: string }> = (props) => {
  const { viewId } = props;
  const useStore = useContext(StoreContext);
  const view = useStore((state) => state.getView(viewId));

  if (isUndefined(view)) {
    return null;
  }

  const comp = ViewTypeMap.get(view.type);
  if (isUndefined(comp)) {
    return null;
  }

  return React.createElement(comp, { view });
};

export default CompFactory;
