import { get, isFunction, isString, isUndefined } from 'lodash';
import { useEffect, useMemo } from 'react';
import CompFactory from './comp/compFactory';
import HandlerBase from './handler/handlerBase';
import { type ViewProps } from './interface';
import createBaseStore from './stores/store/storeBase';
import StoreContext from './stores/store/storeContext';
import { ViewType } from './comp/view/interface';

// 预渲染类型,需要在初始化页面的时候,将组件渲染到视图上
const PreRenderType = [ViewType.LayoutModal, ViewType.LayoutDrawer];

// 绘制视图的根节点
const ViewRoot: <H extends HandlerBase>(props: ViewProps<H>) => React.ReactElement | null = <
  H extends HandlerBase,
>(
  props: ViewProps<H>,
) => {
  const { ViewClass, DataClass, HandlerClass } = props;
  const [useStore, handler, rootId, preIds] = useMemo(() => {
    const store = createBaseStore();

    const [view, handler] = store.getState().init(ViewClass, DataClass, HandlerClass);

    const preRenderIds: string[] = [];
    // 遍历view,找到所有类型符合PreRenderType的,并将其添加到preRenderIds中
    for (const v in view) {
      const viewItem = get(view, v);
      if (isUndefined(viewItem.type) || isUndefined(viewItem.id)) {
        continue;
      }
      if (PreRenderType.includes(viewItem.type) && !preRenderIds.includes(viewItem.id)) {
        preRenderIds.push(viewItem.id);
      }
    }

    return [store, handler, view?.getRootId(), preRenderIds];
  }, [ViewClass, DataClass]);

  useEffect(() => {
    handler?.initDataReq();
  }, [handler]);

  if (!isString(rootId) || isUndefined(useStore)) {
    return null;
  }

  return (
    <StoreContext value={useStore}>
      <CompFactory viewId={rootId} />
      {preIds.map((id) => (
        <CompFactory key={id} viewId={id} />
      ))}
    </StoreContext>
  );
};

export default ViewRoot;
