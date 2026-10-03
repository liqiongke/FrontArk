import { NetUtils, TauriUtils, WindowControls, notify } from '@jl/framework';
import { Button } from '@jl/framework/ui';
import { useMemoizedFn } from 'ahooks';
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { MenuItem } from '../../interface/menu';
import AvatarComponent from './comp/Avatar';
import MenuComponent from './comp/Menu';

const pageMeta: Record<string, { title: string; description: string; hideHeader?: boolean }> = {
  '/': { title: '首页', description: '浏览基础组件与组合示例。' },
  '/home': { title: '首页', description: '浏览基础组件与组合示例。' },
  '/base/table': {
    title: '表格',
    description: '查询产品数据，点击数据行可在上方表单中查看和编辑。',
    hideHeader: true,
  },
  '/base/form': { title: '表单', description: '预览字段控件，体验数据绑定与表单交互。' },
  '/base/modal': { title: '弹出框', description: '在对话框中查看和编辑信息。' },
  '/base/drawer': { title: '抽屉', description: '在侧边面板中处理信息，保留当前页面上下文。' },
  '/base/tab': { title: '标签页', description: '在表格与表单之间切换，保留各页签的内容状态。' },
  '/composite/formAndTable': { title: '表单与表格', description: '组合组件示例。' },
};

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const location = useLocation();
  const dragRegion = TauriUtils.isAvailable() ? true : undefined;
  const page = pageMeta[location.pathname];

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

          <div className="h-full min-w-0 flex-1" data-tauri-drag-region={dragRegion}>
            <div className="flex h-full items-center gap-2 text-sm" data-tauri-drag-region={dragRegion}>
              <span className="text-muted-foreground" data-tauri-drag-region={dragRegion}>工作台</span>
              {page && (
                <>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-medium" data-tauri-drag-region={dragRegion}>{page.title}</span>
                </>
              )}
            </div>
          </div>

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
