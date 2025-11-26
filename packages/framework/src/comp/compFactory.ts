import HandlerViewBase from '@/handler/handlerViewBase';
import { isUndefined } from 'lodash';
import React, { useContext } from 'react';
import StoreContext from '../stores/store/storeContext';
import LayoutFlex from './view/flex/layoutFlex';
import ViewForm from './view/form/viewForm';
import { ViewType } from './view/interface';
import HandlerModalImpl from './view/modal/handler/handlerModal';
import ViewModal from './view/modal/viewModal';
import ViewTab from './view/tab/viewTab';
import ViewTable from './view/table/viewTable';

// 组件映射
const ViewTypeMap = new Map<string, React.FC<any>>([
  // 布局类组件
  [ViewType.LayoutFlex, LayoutFlex],
  [ViewType.LayoutTab, ViewTab],
  [ViewType.LayoutModal, ViewModal],
  // 视图类组件
  [ViewType.Table, ViewTable],
  [ViewType.Form, ViewForm],
]);

// 组件到Handler的映射
export const ViewHandlerMap = new Map<string, typeof HandlerViewBase>([
  // 布局类组件
  [ViewType.LayoutModal, HandlerModalImpl],
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
