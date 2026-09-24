import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '@jl/framework/ui';
import { menuData } from '../../../../packages/mock/src/routes/sys/menu';
import type { User } from '../interface/user';
import MainLayout from './main/MainLayout';
import LoginLayout from './login/LoginLayout';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  checkToken: vi.fn(),
  login: vi.fn(),
  setUser: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@jl/framework', () => ({
  NetUtils: { get: mocks.get, checkToken: mocks.checkToken, login: mocks.login },
  TauriUtils: { isAvailable: () => false },
  WindowControls: () => null,
  notify: { error: mocks.error, success: mocks.success },
}));
vi.mock('../init/stores', () => ({
  default: {
    user: (selector: (state: { user?: User; setUser: (user: User) => void }) => unknown) =>
      selector({ setUser: mocks.setUser }),
  },
}));
vi.mock('./main/comp/Avatar', () => ({ default: () => <span>用户菜单</span> }));
// jsdom 不提供真实布局测量；这里仅隔离滚动观察器，实际尺寸在浏览器中验证。
vi.mock('simplebar-react', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const flush = async (task: () => void | Promise<unknown>) => {
  await act(async () => {
    await task();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('界面迁移回归', () => {
  let root: Root;
  let container: HTMLDivElement;
  let router: ReturnType<typeof createMemoryRouter> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.get.mockResolvedValue({ code: 200, data: menuData });
    mocks.login.mockResolvedValue({ code: 200, data: { name: '测试用户', auth: [], menu: [] } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    router?.dispose();
    router = undefined;
    container.remove();
    vi.unstubAllGlobals();
  });

  const button = (label: string) => {
    const node = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(node, `缺少按钮：${label}`).not.toBeNull();
    return node!;
  };

  const mountApp = async (pathname = '/') => {
    router = createMemoryRouter([
      { path: '/login', element: <LoginLayout /> },
      {
        path: '/',
        element: <MainLayout />,
        children: [
          { index: true, element: <div>首页内容</div> },
          { path: 'base/form', element: <div>表单内容</div> },
          { path: 'base/table', element: <div>表格内容</div> },
        ],
      },
    ], { initialEntries: [pathname] });
    await flush(() => root.render(<RouterProvider router={router!} />));
  };

  it('输入框默认占满容器，不随内容缩放，并允许业务尺寸覆盖', async () => {
    const ref = createRef<HTMLInputElement>();
    await flush(() => root.render(<Input ref={ref} aria-label="测试输入" defaultValue="短文本" />));
    expect(ref.current?.classList.contains('w-full')).toBe(true);
    expect(ref.current?.classList.contains('h-9')).toBe(true);
    expect(ref.current?.className).not.toContain('field-sizing-content');
    await flush(() => root.render(<Input ref={ref} className="w-40 h-11 pl-9" />));
    expect(ref.current?.classList.contains('w-full')).toBe(false);
    expect(ref.current?.classList.contains('h-9')).toBe(false);
    expect(ref.current?.classList.contains('w-40')).toBe(true);
    expect(ref.current?.classList.contains('pl-9')).toBe(true);
  });

  it('使用真实 Mock 的 key/label 渲染菜单，首页和菜单导航均显示内容', async () => {
    await mountApp();
    expect(container.querySelector('main')?.textContent).toContain('首页内容');
    expect(button('首页').getAttribute('aria-current')).toBe('page');
    expect(button('基础组件').textContent).toContain('基础组件');
    expect(button('组合组件').textContent).toContain('组合组件');
    await flush(() => button('基础组件').click());
    await flush(() => button('表单').click());
    expect(router?.state.location.pathname).toBe('/base/form');
    expect(container.querySelector('main')?.textContent).toContain('表单内容');
    expect(button('表单').getAttribute('aria-current')).toBe('page');
    expect(button('首页').hasAttribute('aria-current')).toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('直达子路由、后退和前进时同步选中项并展开所在分组', async () => {
    await mountApp('/base/form');
    expect(button('基础组件').getAttribute('aria-expanded')).toBe('true');
    expect(button('表单').getAttribute('aria-current')).toBe('page');
    await flush(() => button('基础组件').click());
    expect(button('基础组件').getAttribute('aria-expanded')).toBe('false');
    await flush(() => router!.navigate('/base/table'));
    expect(button('基础组件').getAttribute('aria-expanded')).toBe('true');
    expect(button('表格').getAttribute('aria-current')).toBe('page');
    await flush(() => router!.navigate(-1));
    expect(button('基础组件').getAttribute('aria-expanded')).toBe('true');
    expect(button('表单').getAttribute('aria-current')).toBe('page');
    await flush(() => router!.navigate(1));
    expect(button('表格').getAttribute('aria-current')).toBe('page');
  });

  it('侧栏收起后保留图标和名称，点击分组重新展开且子菜单可访问', async () => {
    await mountApp('/base/form');
    await flush(() => button('收起菜单').click());
    expect(container.querySelector('aside')?.classList.contains('w-14')).toBe(true);
    expect(button('首页').querySelector('svg')).not.toBeNull();
    expect(button('基础组件').getAttribute('title')).toBe('基础组件');
    await flush(() => button('基础组件').click());
    expect(container.querySelector('aside')?.classList.contains('w-60')).toBe(true);
    expect(button('基础组件').getAttribute('aria-expanded')).toBe('true');
    expect(button('表单').getAttribute('aria-current')).toBe('page');
  });

  it('登录框使用一致尺寸和图标避让，提交后主界面与菜单可见', async () => {
    await mountApp('/login');
    for (const id of ['username', 'password']) {
      const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
      expect(input.classList.contains('w-full')).toBe(true);
      expect(input.classList.contains('h-11')).toBe(true);
      expect(input.classList.contains('pl-9')).toBe(true);
      expect(input.getAttribute('aria-label')).toBeTruthy();
    }
    await flush(() => {
      container.querySelector('form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(mocks.setUser).toHaveBeenCalledTimes(1);
    expect(router?.state.location.pathname).toBe('/');
    expect(container.querySelector('main')?.textContent).toContain('首页内容');
    expect(button('首页').getAttribute('aria-current')).toBe('page');
  });
});
