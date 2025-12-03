import HandlerViewBase from '@/handler/handlerViewBase';
import { isUndefined } from 'lodash';
import React, { useContext } from 'react';
import StoreContext from '../stores/store/storeContext';
import HandlerDrawerImpl from './view/drawer/handler/handlerDrawer';
import ViewDrawer from './view/drawer/viewDrawer';
import LayoutFlex from './view/flex/layoutFlex';
import ViewForm from './view/form/viewForm';
import { ViewType } from './view/interface';
import HandlerModalImpl from './view/modal/handler/handlerModal';
import ViewModal from './view/modal/viewModal';
import ViewTab from './view/tab/viewTab';
import ViewTable from './view/table/viewTable';
import ViewToolBar from './view/toolbar/viewToolBar';

// 组件映射
const ViewTypeMap = new Map<string, React.FC<any>>([
  // 布局类组件
  [ViewType.LayoutFlex, LayoutFlex],
  [ViewType.LayoutTab, ViewTab],
  [ViewType.LayoutModal, ViewModal],
  [ViewType.LayoutDrawer, ViewDrawer],
  // 视图类组件
  [ViewType.Table, ViewTable],
  [ViewType.Form, ViewForm],
  [ViewType.Toolbar, ViewToolBar],
]);

// 组件到Handler的映射
export const ViewHandlerMap = new Map<string, typeof HandlerViewBase>([
  // 布局类组件
  [ViewType.LayoutModal, HandlerModalImpl],
  [ViewType.LayoutDrawer, HandlerDrawerImpl],
  // 视图类组件
]);

/**
 * 组件工厂
 * @param props
 * @returns
 */
const CompFactory: React.FC<{ viewId?: string }> = (props) => {
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

  return React.createElement(comp, { viewId });
};

export default CompFactory;
