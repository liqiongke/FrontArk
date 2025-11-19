import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import './styles.less';
import { useNavigate } from 'react-router-dom';
import Store from '../../init/stores';
import { NetUtils } from 'framework';

const { Title, Text } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

const LoginLayout: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const user = Store.user((state) => state.user);
  // const setUser = Store.user((state) => state.setUser);
  // const setMenu = Store.user((state) => state.setMenu);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      console.log(values);

      // 触发登录请求
      const result = await NetUtils.login(values);

      console.log('result', result);

      // 跳转到首页
      navigate('/');
      message.success('登录成功!');
    } catch {
      message.error('登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
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
