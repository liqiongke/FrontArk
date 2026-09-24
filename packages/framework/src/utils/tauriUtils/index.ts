import { isTauri } from '@tauri-apps/api/core';

/** Tauri 本地能力入口；业务层无需直接引用 Tauri SDK。 */
class TauriUtils {
  /** 浏览器或 SSR 环境误调用窗口能力时的统一错误文案。 */
  private static readonly desktopOnlyMessage = '窗口控制功能仅在 Tauri 桌面环境中可用';

  /** 检测实际运行环境，普通浏览器（含桌面前端预览）和 SSR 均返回 false。 */
  static isAvailable = (): boolean => typeof window !== 'undefined' && isTauri();

  /** 窗口能力只允许在原生环境执行，普通浏览器与 SSR 统一抛出环境错误。 */
  private static assertDesktop = (): void => {
    if (!TauriUtils.isAvailable()) {
      throw new Error(TauriUtils.desktopOnlyMessage);
    }
  };

  /** 按需加载窗口 SDK，避免普通 Web 页面初始化时访问原生窗口。 */
  private static loadCurrentWindow = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  };

  /**
   * 请求关闭当前原生窗口，保留 Tauri 的关闭事件语义，不强制退出进程。
   * 浏览器调用或原生权限错误会拒绝 Promise，由业务层决定如何提示。
   */
  static closeCurrentWindow = async (): Promise<void> => {
    TauriUtils.assertDesktop();
    await (await TauriUtils.loadCurrentWindow()).close();
  };

  /** 请求最小化当前原生窗口。浏览器调用或原生权限错误会拒绝 Promise。 */
  static minimizeCurrentWindow = async (): Promise<void> => {
    TauriUtils.assertDesktop();
    await (await TauriUtils.loadCurrentWindow()).minimize();
  };

  /**
   * 在最大化与还原之间切换当前原生窗口，与系统标题栏最大化按钮行为一致。
   * 浏览器调用或原生权限错误会拒绝 Promise，由业务层决定如何提示。
   */
  static toggleMaximizeCurrentWindow = async (): Promise<void> => {
    TauriUtils.assertDesktop();
    await (await TauriUtils.loadCurrentWindow()).toggleMaximize();
  };

  /**
   * 订阅当前原生窗口的最大化状态：先同步一次初始值，之后随窗口尺寸变化推送，
   * 返回取消订阅函数。用于自定义标题栏同步最大化/还原图标，
   * 覆盖拖动区双击、系统贴靠分屏等不经过本工具的窗口状态变化。
   */
  static watchCurrentWindowMaximized = async (onChange: (maximized: boolean) => void): Promise<() => void> => {
    TauriUtils.assertDesktop();
    const appWindow = await TauriUtils.loadCurrentWindow();
    const emit = async () => onChange(await appWindow.isMaximized());
    await emit();
    return appWindow.onResized(() => {
      void emit();
    });
  };
}

export default TauriUtils;
