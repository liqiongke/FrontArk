import { Avatar, Button, Dropdown, Space, message } from 'antd';
import { BellOutlined, FullscreenOutlined, PoweroffOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import '../styles.less';
import { useMemoizedFn } from 'ahooks';
import { NetUtils, TauriUtils } from '@jl/framework';

const AvatarComponent = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', label: '个人中心' },
    { key: 'settings', label: '设置' },
    { key: 'logout', label: '退出登录' },
  ];
  if (TauriUtils.isAvailable()) {
    userMenuItems.push(
      { type: 'divider' },
      { key: 'closeSystem', label: '关闭系统', icon: <PoweroffOutlined />, danger: true },
    );
  }

  const onClick = useMemoizedFn(async ({ key }: { key: string }) => {
    switch (key) {
      case 'profile':
        break;
      case 'settings':
        break;
      case 'logout':
        NetUtils.handleUnauthorized();
        break;
      case 'closeSystem':
        try {
          await TauriUtils.closeCurrentWindow();
        } catch {
          messageApi.error('关闭系统失败，请重试');
        }
        break;
      default:
        break;
    }
  });

  return (
    <div className="user-area">
      {contextHolder}
      <Space size="small">
        <Button type="text" icon={<BellOutlined />} />
        <Button type="text" icon={<SettingOutlined />} />
        <Button type="text" icon={<FullscreenOutlined />} />
        <Dropdown menu={{ items: userMenuItems, onClick }} placement="bottomRight" trigger={['click']}>
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
