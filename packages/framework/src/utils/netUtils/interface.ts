export const AUTH_TOKEN_KEY = '@authtoken';
export const AUTH_TOKEN_EXPIRE_KEY = '@authtoken_expire';

// 错误处理函数类型定义
export type ErrorHandler = (code: number, msg: string, type: 'request' | 'response') => void;

// 应用注入的登录导航策略，框架不依赖具体路由或桌面运行时。
export interface LoginNavigation {
  getPathname(): string;
  replace(path: string): void;
}

export interface Result<T> {
  code: number;
  message: string;
  data?: T;
}
