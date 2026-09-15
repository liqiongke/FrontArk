/// <reference types="vite/client" />

// 框架源码由应用通过 alias 直接消费,import.meta.env 在应用构建期注入
interface ImportMetaEnv {
  /** 日志输出级别:debug | info | warn | error | silent,未配置时开发环境 debug、其他环境 warn */
  readonly VITE_LOG_LEVEL?: string;
}
