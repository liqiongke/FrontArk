import { useMemoizedFn } from 'ahooks';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface MenuComponentProps {
  collapsed?: boolean;
  menuItems?: MenuProps['items'];
}

const MenuComponent = ({ menuItems = [] }: MenuComponentProps) => {
  const [selectedKey, setSelectedKey] = useState('home');
  const navigate = useNavigate();

  const onMenuSelect = useMemoizedFn(({ key }) => {
    setSelectedKey(key);
    navigate(key);
  });

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      onSelect={onMenuSelect}
      items={menuItems}
    />
  );
};

export default MenuComponent;
