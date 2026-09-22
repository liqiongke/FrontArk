import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NetUtils from './index';
import { AUTH_TOKEN_EXPIRE_KEY, AUTH_TOKEN_KEY, type LoginNavigation } from './interface';
import TokenUtils from './tokenUtils';

const createNavigation = (pathname = '/base/form') => {
  let currentPath = pathname;
  return {
    getPathname: vi.fn(() => currentPath),
    replace: vi.fn((path: string) => {
      currentPath = path;
    }),
  } satisfies LoginNavigation;
};

const createWebWindow = (pathname = '/') => ({
  location: { pathname, replace: vi.fn() },
  history: { replaceState: vi.fn() },
});

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', createWebWindow());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TokenUtils 登录导航', () => {
  it('未提供适配器时保留 Web 路径跳转，并清理 Token 与过期时间', () => {
    TokenUtils.setToken('test-token', 7200000);
    TokenUtils.clearTokenAndJumpToLogin('/login');
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_TOKEN_EXPIRE_KEY)).toBeNull();
    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/login');
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('Web 已在登录页时不重复跳转', () => {
    vi.stubGlobal('window', createWebWindow('/login'));
    TokenUtils.checkToken('/login');
    expect(window.history.replaceState).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('提供适配器时只通过适配器导航，重复未授权不重复跳转', () => {
    const navigation = createNavigation();
    TokenUtils.setToken('test-token', 7200000);
    TokenUtils.clearTokenAndJumpToLogin('/login', navigation);
    TokenUtils.clearTokenAndJumpToLogin('/login', navigation);
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/login');
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_TOKEN_EXPIRE_KEY)).toBeNull();
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it('有效 Token 不触发跳转，过期 Token 通过适配器跳转', () => {
    const navigation = createNavigation();
    TokenUtils.setToken('test-token', 7200000);
    TokenUtils.checkToken('/login', navigation);
    expect(navigation.replace).not.toHaveBeenCalled();
    localStorage.setItem(AUTH_TOKEN_EXPIRE_KEY, String(Date.now() - 1));
    TokenUtils.checkToken('/login', navigation);
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/login');
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe('NetUtils 导航注入', () => {
  it('首次初始化即使用适配器，兼容现有默认过期时间', () => {
    const navigation = createNavigation('/');
    NetUtils.init('https://api.example.com', '/login', '/login', vi.fn(), undefined, navigation);
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/login');
    expect(NetUtils.tokenExpireTime).toBe(7200000);
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it.each(['checkToken', 'handleUnauthorized'] as const)('%s 使用初始化注入的适配器', (entry) => {
    const navigation = createNavigation();
    TokenUtils.setToken('test-token', 7200000);
    NetUtils.init('https://api.example.com', '/login', '/login', vi.fn(), 3600000, navigation);
    expect(navigation.replace).not.toHaveBeenCalled();
    if (entry === 'checkToken') {
      TokenUtils.clearToken();
    }
    NetUtils[entry]();
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/login');
    expect(NetUtils.tokenExpireTime).toBe(3600000);
  });

  it('响应 401 经现有错误回调进入注入的登录导航', async () => {
    const navigation = createNavigation();
    TokenUtils.setToken('test-token', 7200000);
    const errorHandler = vi.fn((code: number) => {
      if (code === 401) NetUtils.handleUnauthorized();
    });
    NetUtils.init('https://api.example.com', '/login', '/login', errorHandler, undefined, navigation);
    const error = { response: { status: 401, data: { message: '未授权' } } };
    NetUtils.service.defaults.adapter = async () => Promise.reject(error);
    await expect(NetUtils.get('/menu')).rejects.toBe(error);
    expect(errorHandler).toHaveBeenCalledWith(401, '未授权', 'response');
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/login');
    expect(TokenUtils.getToken()).toBeNull();
  });

  it('再次初始化时可替换或清除导航策略，不残留旧适配器', () => {
    const first = createNavigation();
    const second = createNavigation();
    TokenUtils.setToken('test-token', 7200000);
    NetUtils.init('https://api.example.com', '/login', '/login', vi.fn(), undefined, first);
    NetUtils.init('https://api.example.com', '/login', '/login', vi.fn(), undefined, second);
    NetUtils.handleUnauthorized();
    expect(first.replace).not.toHaveBeenCalled();
    expect(second.replace).toHaveBeenCalledExactlyOnceWith('/login');
    NetUtils.init('https://api.example.com', '/login', '/login', vi.fn());
    expect(window.location.replace).toHaveBeenCalledWith('/login');
    expect(second.replace).toHaveBeenCalledTimes(1);
  });
});
