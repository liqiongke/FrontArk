import { NetUtils, TauriUtils, WindowControls, notify } from '@jl/framework';
import { Button } from '@jl/framework/ui';
import { useMemoizedFn } from 'ahooks';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { MenuItem } from '../../interface/menu';
import AvatarComponent from './comp/Avatar';
import MenuComponent from './comp/Menu';
import TabBar from './comp/tabs/TabBar';
import { useTabs } from './comp/tabs/useTabs';
import { getPageMeta } from './pageMeta';

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const location = useLocation();
  const dragRegion = TauriUtils.isAvailable() ? true : undefined;
  const page = getPageMeta(location.pathname);
  // 顶部页签：路由驱动增删，页签操作回写路由
  const { tabs, activeKey, select, close, closeOthers, closeLeft, closeRight, closeAll } = useTabs(menuItems);

  // 获取菜单数据
  const fetchMenuData = useMemoizedFn(async () => {
    try {
      const data = await NetUtils.get(import.meta.env.VITE_API_MENU);
      if (data && data.code === 200) {
        setMenuItems(data.data || []);
      } else {
        notify.error(data?.message || '获取菜单数据失败');
      }
    } catch (error) {
      notify.error(`获取菜单数据失败:${error}`);
    }
  });

  useEffect(() => {
    NetUtils.checkToken();
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className="main-layout flex h-screen overflow-hidden">
      <MenuComponent collapsed={collapsed} menuItems={menuItems} onExpand={() => setCollapsed(false)} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 顶部导航栏 */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="mx-2 size-8"
            aria-label={collapsed ? '展开菜单' : '收起菜单'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>

          {/* 顶部页签：点击切换路由，右键管理已打开页签 */}
          <TabBar
            tabs={tabs}
            activeKey={activeKey}
            dragRegion={dragRegion}
            onSelect={select}
            onClose={close}
            onCloseOthers={closeOthers}
            onCloseLeft={closeLeft}
            onCloseRight={closeRight}
            onCloseAll={closeAll}
          />

          <AvatarComponent />

          {/* 无边框窗口的最小化/最大化/关闭按钮组，仅桌面环境渲染 */}
          <WindowControls />
        </header>

        {/* 路由页面区域 */}
        <main className="main-content min-h-0 flex-1 overflow-hidden bg-background">
          <SimpleBar style={{ height: '100%', maxHeight: 'calc(100vh - 48px)' }}>
            {/* 内容区不限最大宽度，铺满可用空间；表格/表单自行按栅格与 span 分配列宽 */}
            <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
              {page && !page.hideHeader && (
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
                  <p className="text-sm leading-6 text-muted-foreground">{page.description}</p>
                </div>
              )}
              <Outlet />
            </div>
          </SimpleBar>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
