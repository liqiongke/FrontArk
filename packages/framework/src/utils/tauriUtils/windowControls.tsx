import { BorderOutlined, CloseOutlined, MinusOutlined, SwitcherOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';
import { useEffect, useState } from 'react';
import TauriUtils from './index';
import './windowControls.less';

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
  const [messageApi, contextHolder] = message.useMessage();

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
      messageApi.error(failedTip);
    }
  };

  return (
    <div className={variant === 'light' ? 'window-controls window-controls-light' : 'window-controls'}>
      {contextHolder}
      <Button
        type="text"
        className="window-controls-button"
        icon={<MinusOutlined />}
        title="最小化"
        aria-label="最小化窗口"
        onClick={() => runAction(TauriUtils.minimizeCurrentWindow, '最小化窗口失败，请重试')}
      />
      <Button
        type="text"
        className="window-controls-button"
        icon={maximized ? <SwitcherOutlined /> : <BorderOutlined />}
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原窗口' : '最大化窗口'}
        onClick={() => runAction(TauriUtils.toggleMaximizeCurrentWindow, '切换窗口最大化状态失败，请重试')}
      />
      <Button
        type="text"
        className="window-controls-button window-controls-close"
        icon={<CloseOutlined />}
        title="关闭"
        aria-label="关闭系统"
        onClick={() => runAction(TauriUtils.closeCurrentWindow, '关闭窗口失败，请重试')}
      />
    </div>
  );
};

export default WindowControls;
