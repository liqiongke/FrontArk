---
kind: logging_system
name: 基于自定义 logger 的轻量级前端日志系统
category: logging_system
scope:
    - '**'
source_files:
    - packages/framework/src/utils/sysUtils/logger.ts
    - packages/framework/src/index.ts
    - packages/framework/src/vite-env.d.ts
    - packages/framework/src/stores/store/utils/storeReq.ts
    - packages/framework/src/stores/store/utils/storeData.ts
    - packages/mock/src/index.ts
    - apps/demo/src/pages/base/table/handler.ts
---

## 1. 使用的方案

仓库未引入任何第三方日志框架（如 winston、pino、log4js 等），而是自实现了一个极简的 `logger` 工具，统一封装浏览器原生 `console.log/info/warn/error`。该工具位于 `packages/framework/src/utils/sysUtils/logger.ts`，并通过 `@jl/framework` 包对外暴露 `logger`、`getLogLevel`、`setLogLevel` 以及 `LogLevel` 类型。

Mock 服务（`packages/mock`）使用 Express，启动时通过 `process.stdout.write` 输出运行地址，未集成结构化日志或请求日志中间件。

## 2. 核心文件与位置

- `packages/framework/src/utils/sysUtils/logger.ts`：日志级别定义、默认值读取、运行时切换、各等级输出方法。
- `packages/framework/src/index.ts`：将 `logger`、`getLogLevel`、`setLogLevel`、`LogLevel` 作为框架公共 API 重新导出。
- `packages/framework/src/vite-env.d.ts`：声明 `VITE_LOG_LEVEL` 环境变量类型。
- `apps/demo/src/pages/base/table/handler.ts`：Demo 中仍残留 `console.log` 调试语句（被 ESLint 规则 `no-debugger` 约束，但 `console.log` 未被全局禁用）。
- `packages/mock/src/index.ts`：Mock 服务入口，仅用 `process.stdout.write` 打印启动信息。

## 3. 架构与约定

### 3.1 日志级别模型

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
```

每个级别对应一个权重（debug=0 → silent=4），只有当 `LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel]` 时才放行输出。因此 `currentLevel` 越高，输出的日志越少。

### 3.2 默认级别策略

- 从 `import.meta.env.VITE_LOG_LEVEL` 读取用户配置；若为空或非合法字符串，则回退为：开发环境 `debug`，生产环境 `warn`。
- 该变量由 Vite 在构建期注入到框架源码中（注释明确说明“框架源码由应用消费，构建期注入”）。

### 3.3 运行时可调

提供 `setLogLevel(level)` 和 `getLogLevel()` 两个函数，允许在运行时覆盖当前级别，优先级高于环境变量。这使得在调试时可临时提升/降低输出粒度而无需重新构建。

### 3.4 输出格式

- `debug`：`console.log('[debug]', ...args)`
- `info`：`console.info('[info]', ...args)`
- `warn`：`console.warn(...args)`
- `error`：`console.error(...args)`

没有统一的 JSON 结构化字段（如 timestamp、level、module、traceId 等），也没有日志轮转、持久化或远程上报能力。

### 3.5 消费方式

框架内部 store 模块（`storeData.ts`、`storeReq.ts`）直接 `import logger from '@/utils/sysUtils/logger'` 并调用 `logger.debug/warn/error` 记录数据请求状态、重试、失败等信息。这些调用通过 `@jl/framework` 包的 barrel 文件对外暴露，供 Demo 或其他应用复用。

## 4. 约定与约束

| 约定 | 说明 | 依据 |
|---|---|---|
| 禁止引入第三方日志库 | 代码注释明确“仓库约定不引入第三方日志框架，所有调试输出统一收敛到此处” | `packages/framework/src/utils/sysUtils/logger.ts` 顶部注释 |
| 日志级别通过 `VITE_LOG_LEVEL` 控制 | 构建期注入，支持 debug/info/warn/error/silent | `logger.ts` 中 `readEnvLevel` |
| 开发默认 debug，生产默认 warn | 未配置时的回退逻辑 | `logger.ts` L24 |
| 支持运行时调整级别 | 提供 `setLogLevel` / `getLogLevel` | `logger.ts` L32-L39 |
| Mock 服务不使用 console | 启动信息走 `process.stdout.write` | `packages/mock/src/index.ts` L51 注释 |
| 禁止 debugger 断点 | ESLint 规则 `no-debugger: 'warn'` | `apps/demo/eslint.config.js` L27 |
| 业务代码应通过 `logger` 而非裸 `console.*` | 框架内 store 均使用 `logger`，但 Demo 页面仍有残留 `console.log` | 对比 `storeReq.ts` 与 `apps/demo/src/pages/base/table/handler.ts` |

## 5. 局限性与现状

- **无结构化字段**：日志不包含时间戳、模块名、请求 ID、堆栈等上下文，难以做集中式检索与分析。
- **无 sink 抽象**：仅输出到浏览器控制台，无法扩展至文件、网络或远端收集器。
- **Mock 侧缺失日志**：Express 路由层未接入任何请求/响应日志中间件，排查接口问题依赖浏览器 Network 面板。
- **Demo 中存在不一致**：部分页面仍直接使用 `console.log`，未统一收口到 `logger`。

总体而言，这是一个面向本地开发的轻量级日志方案，满足“按环境控制输出量 + 运行时可调”的基本需求，但不具备企业级日志系统的结构化、可观测性和可插拔特性。