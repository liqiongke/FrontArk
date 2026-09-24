import { NetUtils, TauriUtils, notify } from '@jl/framework';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jl/framework/ui';
import { useMemoizedFn } from 'ahooks';
import { Bell, Maximize, Power, Settings, User as UserIcon } from 'lucide-react';

const AvatarComponent = () => {
  const onClick = useMemoizedFn(async (key: string) => {
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
          notify.error('关闭系统失败，请重试');
        }
        break;
      default:
        break;
    }
  });

  return (
    <div className="user-area flex items-center gap-1 pr-5">
      <Button variant="ghost" size="icon" aria-label="通知">
        <Bell className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="设置">
        <Settings className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="全屏">
        <Maximize className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="用户菜单"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <UserIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onClick('profile')}>个人中心</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onClick('settings')}>设置</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onClick('logout')}>退出登录</DropdownMenuItem>
          {TauriUtils.isAvailable() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onClick('closeSystem')}>
                <Power className="size-4" />
                关闭系统
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default AvatarComponent;
