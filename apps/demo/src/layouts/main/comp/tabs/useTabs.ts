import { useMemoizedFn } from 'ahooks';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MenuItem } from '../../../../interface/menu';
import type { TabState } from './interface';
import {
  closeAll,
  closeLeft,
  closeOthers,
  closeRight,
  closeTab,
  createTabState,
  openTab,
} from './tabStore';
import { resolveTabTitle } from './tabTitle';

/**
 * 顶部页签状态与操作。
 *
 * 数据流：路由变化 → 新增/激活页签；页签关闭 → 计算新的激活项 → 必要时回写路由。
 * 以 location.pathname 为唯一事实来源，因此前进后退、菜单跳转、页签点击表现一致。
 */
export const useTabs = (menuItems: MenuItem[] = []) => {
  const location = useLocation();
  const navigate = useNavigate();
  // 首帧就按当前路由构造页签，避免首个页签渲染滞后一帧
  const [state, setState] = useState<TabState>(() =>
    openTab(createTabState(), {
      key: location.pathname,
      title: resolveTabTitle(location.pathname, menuItems),
    }),
  );

  // 跟随路由同步页签：不存在则追加，已存在则激活并按最新菜单刷新标题
  useEffect(() => {
    setState((prev) =>
      openTab(prev, {
        key: location.pathname,
        title: resolveTabTitle(location.pathname, menuItems),
      }),
    );
  }, [location.pathname, menuItems]);

  // 关闭页签后激活项可能改变，需要同步路由；同路径时不重复导航
  const commit = useMemoizedFn((next: TabState) => {
    setState(next);
    if (next.activeKey && next.activeKey !== location.pathname) {
      navigate(next.activeKey);
    }
  });

  const select = useMemoizedFn((key: string) => {
    if (key !== location.pathname) {
      navigate(key);
    }
  });

  const close = useMemoizedFn((key: string) => commit(closeTab(state, key)));
  const closeOtherTabs = useMemoizedFn((key: string) => commit(closeOthers(state, key)));
  const closeLeftTabs = useMemoizedFn((key: string) => commit(closeLeft(state, key)));
  const closeRightTabs = useMemoizedFn((key: string) => commit(closeRight(state, key)));
  const closeAllTabs = useMemoizedFn(() => commit(closeAll(state)));

  return {
    tabs: state.tabs,
    activeKey: state.activeKey,
    select,
    close,
    closeOthers: closeOtherTabs,
    closeLeft: closeLeftTabs,
    closeRight: closeRightTabs,
    closeAll: closeAllTabs,
  };
};
