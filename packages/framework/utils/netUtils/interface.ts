export const AUTH_TOKEN_KEY = '@authtoken';

// 错误处理函数类型定义
export type ErrorHandler = (
  code: number,
  msg: string,
  interceptorType: 'request' | 'response',
) => void;
