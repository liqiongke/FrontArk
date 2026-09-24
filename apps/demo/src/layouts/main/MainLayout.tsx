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

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const location = useLocation();
  const dragRegion = TauriUtils.isAvailable() ? true : undefined;

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
            className="size-12"
            aria-label={collapsed ? '展开菜单' : '收起菜单'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>

          <div className="h-full flex-1 pl-5" data-tauri-drag-region={dragRegion}>
            <div className="flex h-full items-center" data-tauri-drag-region={dragRegion}>
              Tab 标签页区域
            </div>
          </div>

          <AvatarComponent />

          {/* 无边框窗口的最小化/最大化/关闭按钮组，仅桌面环境渲染 */}
          <WindowControls />
        </header>

        {/* 路由页面区域 */}
        <main className="main-content min-h-0 flex-1 overflow-hidden bg-background">
          <SimpleBar style={{ height: '100%', maxHeight: 'calc(100vh - 48px)' }}>
            <Outlet />
          </SimpleBar>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
