import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { NetUtils } from 'framework';
import { isUndefined } from 'lodash';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Store from '../../init/stores';
import type { User } from '../../interface/user';
import './styles.less';

const { Title, Text } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

const LoginLayout: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const user = Store.user((state) => state.user);
  const setUser = Store.user((state) => state.setUser);
  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      // 触发登录请求
      const result = await NetUtils.login<User>(values);

      if (result.code !== 200) {
        messageApi.error(result.message || '登录失败，请检查用户名和密码');
        return;
      }
      const data = result.data;
      if (isUndefined(data)) {
        messageApi.error(result.message || '登录失败，未找到返回的用户信息');
        return;
      }
      setUser(data);

      // 跳转到首页
      navigate('/');
      messageApi.success('登录成功!');
    } catch {
      messageApi.error('登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {contextHolder}
      <Card className="login-card">
        <div className="login-header">
          <Title level={2}>欢迎登录:{user?.name}</Title>
          <Text type="secondary">请输入您的登录凭据</Text>
        </div>

        <Form name="login" onFinish={onFinish} autoComplete="off" size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名!' },
              { min: 3, message: '用户名至少3位字符!' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码!' },
              { min: 6, message: '密码至少6位字符!' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="login-button"
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginLayout;
