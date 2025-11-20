import { Avatar, Button, Dropdown, Space } from 'antd';
import { BellOutlined, FullscreenOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import '../styles.less';
import { useMemoizedFn } from 'ahooks';
import { NetUtils } from 'framework';

const AvatarComponent = () => {
  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', label: '个人中心' },
    { key: 'settings', label: '设置' },
    { key: 'logout', label: '退出登录' },
  ];

  const onClick = useMemoizedFn(({ key }) => {
    switch (key) {
      case 'profile':
        break;
      case 'settings':
        break;
      case 'logout':
        NetUtils.handleUnauthorized();
        break;
      default:
        break;
    }
  });

  return (
    <div className="user-area">
      <Space size="small">
        <Button type="text" icon={<BellOutlined />} />
        <Button type="text" icon={<SettingOutlined />} />
        <Button type="text" icon={<FullscreenOutlined />} />
        <Dropdown menu={{ items: userMenuItems, onClick }} placement="bottomRight">
          <Avatar
            style={{ backgroundColor: '#1890ff', cursor: 'pointer' }}
            icon={<UserOutlined />}
          />
        </Dropdown>
      </Space>
    </div>
  );
};

export default AvatarComponent;
