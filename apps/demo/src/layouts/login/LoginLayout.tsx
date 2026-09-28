import { NetUtils, TauriUtils, WindowControls, notify } from '@jl/framework';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@jl/framework/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, User as UserIcon } from 'lucide-react';
import { isUndefined } from 'lodash';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import type { User } from '../../interface/user';
import Store from '../../init/stores';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名!').min(3, '用户名至少3位字符!'),
  password: z.string().min(1, '请输入密码!').min(6, '密码至少6位字符!'),
});

type LoginForm = z.infer<typeof loginSchema>;

const LoginLayout: React.FC = () => {
  const navigate = useNavigate();
  const canCloseWindow = TauriUtils.isAvailable();
  const user = Store.user((state) => state.user);
  const setUser = Store.user((state) => state.setUser);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: 'admin', password: '123456' },
  });

  const onFinish = async (values: LoginForm) => {
    try {
      // 触发登录请求
      const result = await NetUtils.login<User>(values);

      if (result.code !== 200) {
        notify.error(result.message || '登录失败，请检查用户名和密码');
        return;
      }
      const data = result.data;
      if (isUndefined(data)) {
        notify.error(result.message || '登录失败，未找到返回的用户信息');
        return;
      }
      setUser(data);

      // 跳转到首页
      navigate('/');
      notify.success('登录成功!');
    } catch {
      notify.error('登录失败，请检查用户名和密码');
    }
  };

  return (
    <div className="login-container flex min-h-screen w-full items-center justify-center bg-muted/40 px-4 py-12">
      {canCloseWindow && (
        <div className="fixed inset-x-0 top-0 z-10 flex h-10 select-none">
          <div className="flex-1" data-tauri-drag-region />
          <WindowControls />
        </div>
      )}
      <Card className="w-full max-w-sm rounded-xl shadow-sm">
        <CardHeader className="gap-2 select-none">
          <CardTitle className="text-2xl font-semibold tracking-tight">欢迎登录{user?.name ? `，${user.name}` : ''}</CardTitle>
          <CardDescription>输入用户名和密码，登录工作台。</CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={handleSubmit(onFinish)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">用户名</Label>
              <div className="relative">
                <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="username"
                  aria-label="用户名"
                  className="h-11 pl-9"
                  placeholder="用户名"
                  autoComplete="off"
                  aria-invalid={errors.username ? true : undefined}
                  {...register('username')}
                />
              </div>
              {errors.username && <p className="text-destructive text-sm">{errors.username.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="password"
                  aria-label="密码"
                  className="h-11 pl-9"
                  type="password"
                  placeholder="密码"
                  autoComplete="off"
                  aria-invalid={errors.password ? true : undefined}
                  {...register('password')}
                />
              </div>
              {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              className="mt-1 h-11 w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? '登录中...' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginLayout;
