---
kind: configuration_system
name: 基于 Vite 多环境 .env 文件的前端配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - apps/demo/.env
    - apps/demo/.env.dev
    - apps/demo/.env.production
    - apps/demo/.env.mock
    - apps/demo/vite.config.ts
    - apps/demo/src/init/net.ts
    - packages/framework/src/utils/sysUtils/logger.ts
    - packages/framework/src/utils/netUtils/index.ts
    - packages/framework/src/vite-env.d.ts
---

## 1. 使用的系统与方案

本仓库采用 **Vite 原生环境变量机制** 作为前端配置体系的核心：
- 通过 `.env`、`.env.dev`、`.env.production`、`.env.mock` 等多份 `.env*` 文件按环境区分配置。
- `vite.config.ts` 中使用 `loadEnv(mode, process.cwd(), '')` 根据构建 mode（dev / production / mock）加载对应环境变量，并通过 `defineConfig` 的 `define` 注入全局常量 `__APP_ENV__`。
- 应用代码通过 `import.meta.env.VITE_*` 读取配置项；框架包（`@jl/framework`）同样通过 `import.meta.env` 消费这些变量，因为框架源码经别名直接由应用消费，在应用构建期完成注入。

## 2. 关键文件与位置

| 文件 | 作用 |
|---|---|
| `apps/demo/.env` | 基础配置（标题、端口、API 地址、UI 防抖延迟、日志级别说明等），所有环境共享 |
| `apps/demo/.env.dev` | 开发环境覆盖：`VITE_ENV=dev`、`VITE_SERVER_PORT=7000`、`VITE_BASE_URL=http://127.0.0.1:3001/api`、`VITE_LOG_LEVEL=debug` |
| `apps/demo/.env.production` | 生产环境覆盖：`VITE_ENV=production`、端口 9900、线上 API 地址、`VITE_LOG_LEVEL=warn` |
| `apps/demo/.env.mock` | Mock 模式覆盖：`VITE_ENV=mock`、本地 mock API、`VITE_LOG_LEVEL=debug` |
| `apps/demo/vite.config.ts` | 使用 `loadEnv` 加载环境变量，设置 dev server 端口、定义 `__APP_ENV__`、配置别名指向框架源码 |
| `apps/demo/src/init/net.ts` | 启动时调用 `NetUtils.init`，将 `VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN` 注入网络层 |
| `packages/framework/src/utils/sysUtils/logger.ts` | 统一日志工具，从 `import.meta.env.VITE_LOG_LEVEL` 读取日志级别，支持运行时 `setLogLevel` 调整 |
| `packages/framework/src/utils/netUtils/index.ts` | 网络层，注释明确登录接口路径来自 `.env` 中的 `VITE_API_LOGIN` |
| `packages/framework/src/vite-env.d.ts` | 为框架源码声明 `ImportMetaEnv` 扩展，仅暴露 `VITE_LOG_LEVEL` 类型 |

## 3. 架构与设计约定

### 3.1 配置分层
- **基础层**：`.env` 中定义所有业务可用的配置键（如 `VITE_TITLE`、`VITE_UI_DEBOUNCE_DELAY`、`VITE_AUTH_TOKEN_EXPIRE_TIME` 等），并附带中文注释说明用途。
- **环境覆盖层**：每个环境文件只覆盖需要差异化的键（如 `VITE_ENV`、`VITE_SERVER_PORT`、`VITE_BASE_URL`、`VITE_LOG_LEVEL`），其余继承自基础 `.env`。
- **构建期注入**：`vite.config.ts` 中 `loadEnv(mode, ...)` 合并后，通过 `define.__APP_ENV__` 把 `VITE_ENV` 以编译时常量形式注入到运行时代码中，用于分支逻辑。

### 3.2 配置读取方式
- **应用侧**：在 `apps/demo/src/init/net.ts` 中通过 `import.meta.env.VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN` 初始化网络请求基地址和登录路由。
- **框架侧**：`packages/framework/src/utils/sysUtils/logger.ts` 在模块加载时读取 `import.meta.env.VITE_LOG_LEVEL`，若未配置或非法则回退为：开发环境 `debug`，其他环境 `warn`。同时提供 `setLogLevel` / `getLogLevel` 支持运行时调整，优先级高于环境变量。
- **类型安全**：框架通过 `packages/framework/src/vite-env.d.ts` 扩展 `ImportMetaEnv`，仅声明 `VITE_LOG_LEVEL?: string`，使框架源码能获得 TS 提示。

### 3.3 网络层与认证配置
- 应用启动时调用 `NetUtils.init(baseUrl, loginUrl, apiLogin, errorHandler)`，其中三个 URL 全部来自 `.env` 的 `VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN`。
- 登录接口路径默认拼接为 `${baseUrl}${loginAPI || 'login'}`，当 `.env` 未配置 `VITE_API_LOGIN` 时回退到 `/login`。
- 401 响应触发 `NetUtils.handleUnauthorized()`，跳转至 `VITE_LOGIN_URL`。

### 3.4 日志级别策略
- 日志级别由 `VITE_LOG_LEVEL` 控制，取值限定为 `debug | info | warn | error | silent`。
- 默认行为：开发环境 `debug`，非开发环境 `warn`。
- 运行时可通过 `setLogLevel` 覆盖，便于调试时动态提升/降低输出。

## 4. 约定与约束

1. **所有前端可配置项必须以 `VITE_` 前缀命名**，这是 Vite 暴露给客户端的唯一规则，仓库内所有 `.env` 键均遵循此约定。
2. **基础配置集中放在根 `.env`**，环境差异通过同名键覆盖实现，避免重复定义。
3. **`VITE_ENV` 必须显式声明**于各环境文件中，用于区分 dev / production / mock 等构建模式。
4. **日志级别必须从 `VITE_LOG_LEVEL` 读取**，框架 logger 对非法值做降级处理，不抛错。
5. **网络相关配置（`VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN`）必须在应用启动阶段传入 `NetUtils.init`**，否则网络请求无法正确拼接 baseUrl。
6. **框架源码通过别名直接消费**（`@jl/framework` → `../../packages/framework/src`），因此框架内的 `import.meta.env` 在应用构建期解析，而非打包框架产物后再注入。
7. **Mock 服务独立部署**（`packages/mock` 使用 Express + nodemon），其 API 地址通过 `VITE_BASE_URL` 指向同一端口，与前端配置解耦。
8. **未显式声明的 `VITE_*` 变量不会出现在框架的 `ImportMetaEnv` 类型中**，框架内部仅声明了 `VITE_LOG_LEVEL`，应用侧自由扩展其他 `VITE_*` 键。

## 5. 总结

该仓库的配置系统围绕 Vite 的 `.env` + `loadEnv` 机制构建，采用“基础配置 + 环境覆盖”的分层模式，通过 `import.meta.env` 在应用与框架源码中共享配置。核心约束是：所有客户端可见配置必须使用 `VITE_` 前缀；网络与日志等基础设施在各自模块启动时主动读取相应 `VITE_*` 变量；构建期通过 `define` 注入 `__APP_ENV__` 用于条件编译。整个体系简单、无第三方依赖，且兼顾开发体验（运行时可调日志级别）与安全性（敏感信息不进入构建产物）。