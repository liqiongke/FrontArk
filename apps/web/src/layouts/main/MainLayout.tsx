import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout, Menu, Button, Avatar, Dropdown, Space, theme } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, FullscreenOutlined, SettingOutlined, UserOutlined, BellOutlined } from '@ant-design/icons';
import './styles.less';

const { Header, Sider, Content } = Layout;

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('home');
  
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  // 菜单数据示例
  const menuItems = [
    {
      key: 'home',
      label: '首页',
    },
    {
      key: 'dashboard',
      label: '仓储管理系统',
    },
    {
      key: 'system',
      label: '系统管理',
      children: [
        {
          key: 'users',
          label: '用户管理',
        },
        {
          key: 'roles',
          label: '角色管理',
        },
      ],
    },
  ];

  // 用户菜单
  const userMenuItems = [
    {
      key: 'profile',
      label: '个人中心',
    },
    {
      key: 'settings',
      label: '设置',
    },
    {
      key: 'logout',
      label: '退出登录',
    },
  ];

  return (
    <Layout className="main-layout">
      {/* 左侧布局 */}
      <Sider trigger={null} collapsible collapsed={collapsed} width={240} className="main-sider">
        {/* Logo 区域 */}
        <div className="logo">
          <div className="logo-text">WMS</div>
        </div>
        
        {/* 菜单区域 */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onSelect={({ key }) => setSelectedKey(key)}
          items={menuItems}
        />
      </Sider>
      
      {/* 右侧布局 */}
      <Layout>
        {/* 右上角标题栏 */}
        <Header className="main-header" style={{ background: colorBgContainer }}>
          {/* 折叠展开按钮 */}
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="trigger-button"
          />
          
          {/* Tab 标签页占位 */}
          <div className="tab-area">
            {/* 这里可以放置 Tabs 组件 */}
            <div className="tab-content">
              Tab 标签页区域
            </div>
          </div>
          
          {/* 用户信息区域 */}
          <div className="user-area">
            <Space size="small">
              <Button type="text" icon={<BellOutlined />} />
              <Button type="text" icon={<SettingOutlined />} />
              <Button type="text" icon={<FullscreenOutlined />} />
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Avatar style={{ backgroundColor: '#1890ff' }} icon={<UserOutlined />} />
              </Dropdown>
            </Space>
          </div>
        </Header>
        
        {/* 路由页面区域 */}
        <Content
          className="main-content"
          style={{
            background: colorBgContainer,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;