import { isTauri } from '@tauri-apps/api/core';

/** Tauri 本地能力入口；业务层无需直接引用 Tauri SDK。 */
class TauriUtils {
  /** 检测实际运行环境，普通浏览器（含桌面前端预览）和 SSR 均返回 false。 */
  static isAvailable = (): boolean => typeof window !== 'undefined' && isTauri();

  /**
   * 请求关闭当前原生窗口，保留 Tauri 的关闭事件语义，不强制退出进程。
   * 浏览器调用或原生权限错误会拒绝 Promise，由业务层决定如何提示。
   */
  static closeCurrentWindow = async (): Promise<void> => {
    if (!TauriUtils.isAvailable()) {
      throw new Error('关闭窗口功能仅在 Tauri 桌面环境中可用');
    }

    // 按需加载，避免普通 Web 页面初始化时访问原生窗口。
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  };
}

export default TauriUtils;
