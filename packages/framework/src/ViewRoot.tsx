import { get, isString, isUndefined } from 'lodash';
import { useEffect, useMemo, useRef } from 'react';
import CompFactory from './comp/compFactory';
import { ViewType } from './comp/view/interface';
import DataBase from './data/dataBase';
import HandlerBase from './handler/handlerBase';
import { type ViewProps } from './interface';
import createBaseStore from './stores/store/storeBase';
import StoreContext from './stores/store/storeContext';
import { useWhyDidYouUpdate } from 'ahooks';

// 绘制视图的根节点
const ViewRoot: <H extends HandlerBase, D extends DataBase>(
  props: ViewProps<H, D>,
) => React.ReactElement | null = (props) => {
  const { ViewClass, DataClass, HandlerClass } = props;

  // 使用useRef确保store只创建一次，避免在StrictMode下重复创建
  const storeRef = useRef<ReturnType<typeof createBaseStore> | null>(null);
  const initializedRef = useRef(false);

  const [useStore, rootId, preIds] = useMemo(() => {
    // 如果store还没有创建或者还没有初始化，则创建store
    if (!storeRef.current || !initializedRef.current) {
      const store = createBaseStore();
      storeRef.current = store;
      initializedRef.current = true;
    }

    const store = storeRef.current!;
    const [view, preRenderIds] = store.getState().init(ViewClass, DataClass, HandlerClass);

    return [store, view?.getRootId(), preRenderIds];
  }, [ViewClass, DataClass, HandlerClass]);

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
