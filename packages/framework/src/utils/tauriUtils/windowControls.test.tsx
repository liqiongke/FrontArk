// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WindowControls from './windowControls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 渲染、点击后等待订阅等异步副作用全部落定。 */
const flush = async (task?: () => void) => {
  await act(async () => {
    task?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const button = (container: HTMLElement, label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

const internals = () =>
  (window as unknown as { __TAURI_INTERNALS__: { callbacks: Map<number, unknown> } }).__TAURI_INTERNALS__;

describe('WindowControls', () => {
  let root: Root;
  let container: HTMLDivElement;
  let unmounted = false;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    })));
    const getStyle = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => getStyle(el));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    unmounted = false;
  });

  afterEach(() => {
    act(() => {
      if (!unmounted) {
        root.unmount();
      }
    });
    container.remove();
    clearMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('普通浏览器不渲染窗口控制按钮', () => {
    act(() => {
      root.render(<WindowControls />);
    });

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('桌面环境渲染三个控制按钮，点击触发对应原生命令', async () => {
    vi.stubGlobal('isTauri', true);
    mockWindows('main');
    const ipc = vi.fn().mockResolvedValue(undefined);
    mockIPC(ipc);

    act(() => {
      root.render(<WindowControls />);
    });
    await flush();

    expect(button(container, '最小化窗口')).toBeTruthy();
    expect(button(container, '最大化窗口')).toBeTruthy();
    expect(button(container, '关闭系统')).toBeTruthy();

    await flush(() => button(container, '最小化窗口')!.click());
    expect(ipc).toHaveBeenCalledWith('plugin:window|minimize', { label: 'main' });

    await flush(() => button(container, '最大化窗口')!.click());
    expect(ipc).toHaveBeenCalledWith('plugin:window|toggle_maximize', { label: 'main' });

    await flush(() => button(container, '关闭系统')!.click());
    expect(ipc).toHaveBeenCalledWith('plugin:window|close', { label: 'main' });
  });

  it('最大化状态随原生 resize 事件同步图标，卸载时取消订阅', async () => {
    vi.stubGlobal('isTauri', true);
    mockWindows('main');
    let maximized = false;
    const ipc = vi.fn().mockImplementation((command: string) => {
      if (command === 'plugin:window|is_maximized') {
        return Promise.resolve(maximized);
      }
      return Promise.resolve(1);
    });
    mockIPC(ipc, { shouldMockEvents: true });

    act(() => {
      root.render(<WindowControls />);
    });
    await flush();

    // 初始未最大化时展示最大化动作，点击按钮切换窗口状态。
    expect(button(container, '最大化窗口')).toBeTruthy();
    expect(button(container, '最大化窗口')!.getAttribute('title')).toBe('最大化');

    // 拖动区双击、系统贴靠等外部最大化也会触发 resize 事件。
    maximized = true;
    const { emit } = await import('@tauri-apps/api/event');
    await flush(async () => {
      await emit('tauri://resize', { width: 800, height: 600 });
    });

    expect(button(container, '还原窗口')).toBeTruthy();
    expect(button(container, '还原窗口')!.getAttribute('title')).toBe('还原');

    await act(async () => {
      root.unmount();
      unmounted = true;
    });
    expect(internals().callbacks.size).toBe(0);
  });
});
