import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TauriUtils from './index';

beforeEach(() => {
  vi.stubGlobal('window', { close: vi.fn() });
  vi.stubGlobal('isTauri', false);
});

afterEach(() => {
  if (typeof window !== 'undefined') clearMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TauriUtils', () => {
  it('普通浏览器不可用，误调用时不发送 IPC，也不关闭浏览器', async () => {
    const ipc = vi.fn();
    mockIPC(ipc);
    mockWindows('main');

    expect(TauriUtils.isAvailable()).toBe(false);
    await expect(TauriUtils.closeCurrentWindow()).rejects.toThrow('仅在 Tauri 桌面环境中可用');
    expect(ipc).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('无 window 的 SSR 环境也能安全检测和拒绝调用', async () => {
    vi.stubGlobal('window', undefined);
    expect(TauriUtils.isAvailable()).toBe(false);
    await expect(TauriUtils.closeCurrentWindow()).rejects.toThrow('仅在 Tauri 桌面环境中可用');
  });

  it('每次检测实际原生环境，不缓存构建目标或依赖全局 SDK 对象', () => {
    expect(TauriUtils.isAvailable()).toBe(false);
    vi.stubGlobal('isTauri', true);
    expect(TauriUtils.isAvailable()).toBe(true);
    vi.stubGlobal('isTauri', false);
    expect(TauriUtils.isAvailable()).toBe(false);
  });

  it.each(['main', 'secondary'])('通过 SDK 关闭当前窗口 %s，不硬编码窗口标签', async (label) => {
    vi.stubGlobal('isTauri', true);
    mockWindows(label);
    const ipc = vi.fn().mockResolvedValue(undefined);
    mockIPC(ipc);

    await expect(TauriUtils.closeCurrentWindow()).resolves.toBeUndefined();
    expect(ipc).toHaveBeenCalledTimes(1);
    expect(ipc).toHaveBeenCalledWith('plugin:window|close', { label });
    expect(window.close).not.toHaveBeenCalled();
  });

  it('等待原生关闭请求完成，不提前报告成功', async () => {
    vi.stubGlobal('isTauri', true);
    mockWindows('main');
    let resolveClose!: () => void;
    mockIPC(() => new Promise<void>((resolve) => { resolveClose = resolve; }));
    const onClosed = vi.fn();
    const pending = TauriUtils.closeCurrentWindow().then(onClosed);

    await vi.waitFor(() => expect(resolveClose).toBeTypeOf('function'));
    expect(onClosed).not.toHaveBeenCalled();
    resolveClose();
    await pending;
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('原生权限或关闭请求失败时向调用方传递错误', async () => {
    vi.stubGlobal('isTauri', true);
    mockWindows('main');
    const error = new Error('关闭权限被拒绝');
    mockIPC(() => Promise.reject(error));

    await expect(TauriUtils.closeCurrentWindow()).rejects.toBe(error);
  });

  it('关闭窗口与退出登录独立，不清除本地登录状态', async () => {
    vi.stubGlobal('isTauri', true);
    vi.stubGlobal('localStorage', { clear: vi.fn(), removeItem: vi.fn() });
    mockWindows('main');
    mockIPC(() => undefined);

    await TauriUtils.closeCurrentWindow();
    expect(localStorage.clear).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });
});
