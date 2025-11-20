import { useMemoizedFn } from 'ahooks';
import type { MenuProps } from 'antd';
import { Layout, Menu } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SimpleBar from 'simplebar-react';
import './Menu.less';
import 'simplebar-react/dist/simplebar.min.css';

interface MenuComponentProps {
  collapsed?: boolean;
  menuItems?: MenuProps['items'];
}

const { Sider } = Layout;

const MenuComponent = ({ collapsed, menuItems = [] }: MenuComponentProps) => {
  const [selectedKey, setSelectedKey] = useState('home');
  const navigate = useNavigate();

  const onMenuSelect = useMemoizedFn(({ key }) => {
    setSelectedKey(key);
    navigate(key);
  });

  return (
    <Sider trigger={null} collapsible collapsed={collapsed} width={240} className="main-sider">
      <div className="logo">
        <div className="logo-text">{import.meta.env.VITE_TITLE}</div>
      </div>

      <div className="menu">
        <SimpleBar
          style={{
            height: '100%',
            maxHeight: 'calc(100vh - 48px)',
          }}
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            onSelect={onMenuSelect}
            items={menuItems}
          />
        </SimpleBar>
      </div>
    </Sider>
  );
};

export default MenuComponent;
