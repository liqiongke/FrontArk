import { isString, isUndefined } from 'lodash';

/**
 * 统一日志工具
 * 仓库约定不引入第三方日志框架,所有调试输出统一收敛到此处,
 * 输出级别由环境变量 VITE_LOG_LEVEL 控制(框架源码由应用消费,构建期注入),支持运行时调整
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

// 读取环境变量配置的级别,未配置或非法时:开发环境 debug,其他环境 warn
const readEnvLevel = (): LogLevel => {
  const raw = import.meta.env.VITE_LOG_LEVEL;
  if (isString(raw) && !isUndefined(LEVEL_WEIGHT[raw.toLowerCase() as LogLevel])) {
    return raw.toLowerCase() as LogLevel;
  }
  return import.meta.env.DEV ? 'debug' : 'warn';
};

let currentLevel: LogLevel = readEnvLevel();

/**
 * 运行时调整日志级别,优先级高于环境变量
 */
export const setLogLevel = (level: LogLevel) => {
  currentLevel = level;
};

/**
 * 查询当前日志级别
 */
export const getLogLevel = (): LogLevel => currentLevel;

const enabled = (level: Exclude<LogLevel, 'silent'>) =>
  LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel];

export const logger = {
  debug: (...args: unknown[]) => {
    if (enabled('debug')) {
      console.log('[debug]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (enabled('info')) {
      console.info('[info]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (enabled('warn')) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (enabled('error')) {
      console.error(...args);
    }
  },
};

export default logger;
