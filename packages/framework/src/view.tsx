import { isString, isUndefined } from 'lodash';
import { useEffect, useMemo } from 'react';
import CompFactory from './comp/compFactory';
import HandlerBase from './handler/handlerBase';
import { type ViewProps } from './interface';
import createBaseStore from './stores/store/storeBase';
import StoreContext from './stores/store/storeContext';

// 绘制视图的根节点
const ViewRoot: <H extends HandlerBase>(props: ViewProps<H>) => React.ReactElement | null = <
  H extends HandlerBase,
>(
  props: ViewProps<H>,
) => {
  const { ViewClass, DataClass, HandlerClass } = props;
  const [useStore, handler, rootId] = useMemo(() => {
    const store = createBaseStore();

    const [view, handler] = store.getState().init(ViewClass, DataClass, HandlerClass);

    return [store, handler, view?.getRootId()];
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
    </StoreContext>
  );
};

export default ViewRoot;
