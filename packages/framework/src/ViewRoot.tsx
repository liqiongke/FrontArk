import { isString } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import CompFactory from './comp/compFactory';
import type DataBase from './data/dataBase';
import type HandlerBase from './handler/handlerBase';
import { type ViewProps } from './interface';
import createBaseStore from './stores/store/storeBase';
import StoreContext from './stores/store/storeContext';

// 绘制视图的根节点
const ViewRoot: <H extends HandlerBase, D extends DataBase>(
  props: ViewProps<H, D>,
) => React.ReactElement | null = (props) => {
  const { ViewClass, DataClass, HandlerClass } = props;

  // store 只创建一次,且创建是纯操作(无副作用);
  // 页面初始化、请求启动、运行时释放等副作用统一放在 effect 中,避免渲染期副作用
  const store = useMemo(() => createBaseStore(), []);

  // 初始化结果:rootId 与预渲染视图在 effect 提交后生效
  const [pageInfo, setPageInfo] = useState<{ rootId?: string; preIds: string[] }>({
    preIds: [],
  });

  useEffect(() => {
    // 初始化页面(幂等:重复调用时走已初始化分支直接返回视图)
    const [view, preRenderIds] = store.getState().init(ViewClass, DataClass, HandlerClass);
    const rootId = view?.getRootId();
    setPageInfo((prev) =>
      prev.rootId === rootId && prev.preIds === preRenderIds
        ? prev
        : { rootId, preIds: preRenderIds },
    );
    // 初始化提交后再启动初始数据请求
    store.getState().startRequests();
    // 卸载/重跑时释放页面运行时:提交未落盘的防抖输入、取消进行中的请求
    return () => {
      store.getState().dispose();
    };
  }, [store, ViewClass, DataClass, HandlerClass]);

  const { rootId, preIds } = pageInfo;
  if (!isString(rootId)) {
    return null;
  }

  return (
    <StoreContext value={store}>
      <CompFactory viewId={rootId} />
      {preIds.map((id) => (
        <CompFactory key={id} viewId={id} />
      ))}
    </StoreContext>
  );
};

export default ViewRoot;
