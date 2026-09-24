import { Button } from '@/ui/components/button';
import { cn } from '@/ui/lib/utils';
import { notify } from '@utils/notify';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import TauriUtils from './index';

interface WindowControlsProps {
  /** 图标配色：light 适配登录页等深色背景的窗口栏，默认使用常规深色图标。 */
  variant?: 'dark' | 'light';
}

/**
 * 无边框桌面窗口右上角的最小化 / 最大化 / 关闭按钮组；
 * 仅在 Tauri 桌面环境渲染，普通浏览器与 SSR 返回 null。
 */
const WindowControls: React.FC<WindowControlsProps> = ({ variant = 'dark' }) => {
  const available = TauriUtils.isAvailable();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!available) {
      return undefined;
    }

    // 订阅原生窗口状态，拖动区双击最大化、系统贴靠分屏等外部变化也能同步图标。
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    TauriUtils.watchCurrentWindowMaximized((state) => {
      if (!cancelled) {
        setMaximized(state);
      }
    })
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        unlisten = stop;
      })
      // 订阅失败时保持初始图标，点击按钮仍可正常切换窗口状态。
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [available]);

  if (!available) {
    return null;
  }

  /** 执行窗口控制动作，失败时统一提示，不打断页面其余交互。 */
  const runAction = async (action: () => Promise<void>, failedTip: string) => {
    try {
      await action();
    } catch {
      notify.error(failedTip);
    }
  };

  // 浅色变体：非关闭按钮使用白色图标与半透明悬停，适配深色背景（登录页）。
  const normalButtonClass =
    variant === 'light'
      ? 'text-white hover:bg-white/25! hover:text-white! focus-visible:bg-white/25! focus-visible:text-white!'
      : '';
  // 关闭按钮遵循 Windows 标题栏惯例：悬停红色背景、白色图标。
  const closeButtonClass =
    'hover:bg-[#c42b1c]! hover:text-white! focus-visible:bg-[#c42b1c]! focus-visible:text-white!';

  return (
    <div data-slot="window-controls" className="flex h-full items-stretch select-none">
      <Button
        type="button"
        variant="ghost"
        title="最小化"
        aria-label="最小化窗口"
        className={cn('h-full w-[46px] rounded-none', normalButtonClass)}
        onClick={() => runAction(TauriUtils.minimizeCurrentWindow, '最小化窗口失败，请重试')}
      >
        <Minus />
      </Button>
      <Button
        type="button"
        variant="ghost"
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原窗口' : '最大化窗口'}
        className={cn('h-full w-[46px] rounded-none', normalButtonClass)}
        onClick={() => runAction(TauriUtils.toggleMaximizeCurrentWindow, '切换窗口最大化状态失败，请重试')}
      >
        {maximized ? <Copy /> : <Square />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        title="关闭"
        aria-label="关闭系统"
        className={cn('h-full w-[46px] rounded-none', closeButtonClass)}
        onClick={() => runAction(TauriUtils.closeCurrentWindow, '关闭窗口失败，请重试')}
      >
        <X />
      </Button>
    </div>
  );
};

export default WindowControls;
