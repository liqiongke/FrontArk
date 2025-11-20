export const AUTH_TOKEN_KEY = '@authtoken';
export const AUTH_TOKEN_EXPIRE_KEY = '@authtoken_expire';

// 错误处理函数类型定义
export type ErrorHandler = (code: number, msg: string, type: 'request' | 'response') => void;

export interface Result<T extends any> {
  code: number;
  message: string;
  data?: T;
}
