import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useMemoizedFn } from 'ahooks';
import type { MenuProps } from 'antd';
import { Button, Layout, message, theme } from 'antd';
import { NetUtils } from 'framework';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AvatarComponent from './comp/Avatar';
import MenuComponent from './comp/Menu';
import './styles.less';

const { Header, Content } = Layout;

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuProps['items']>([]);
  const location = useLocation();

  // 获取菜单数据
  const fetchMenuData = useMemoizedFn(async () => {
    try {
      const result = await NetUtils.get(import.meta.env.VITE_API_MENU);
      if (result.data && result.data.code === 200) {
        setMenuItems(result.data.data || []);
      } else {
        message.error(result.data?.message || '获取菜单数据失败');
      }
    } catch (error) {
      console.error('获取菜单数据失败:', error);
      message.error('获取菜单数据失败');
    }
  });

  useEffect(() => {
    NetUtils.checkToken();
    fetchMenuData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  return (
    <Layout className="main-layout">
      <MenuComponent collapsed={collapsed} menuItems={menuItems} />

      <Layout>
        <Header className="main-header" style={{ background: colorBgContainer }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="trigger-button"
          />

          <div className="tab-area">
            <div className="tab-content">Tab 标签页区域</div>
          </div>

          <AvatarComponent />
        </Header>

        {/* 路由页面区域 */}
        <Content className="main-content" style={{ background: colorBgContainer }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
