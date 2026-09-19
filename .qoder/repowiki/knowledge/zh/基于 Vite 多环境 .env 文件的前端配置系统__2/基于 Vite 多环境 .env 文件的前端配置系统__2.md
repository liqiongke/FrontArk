---
kind: configuration_system
name: 基于 Vite 多环境 .env 文件的前端配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - apps/demo/vite.config.ts
    - apps/demo/.env
    - apps/demo/.env.dev
    - apps/demo/.env.production
    - apps/demo/.env.mock
    - apps/demo/src/init/net.ts
    - apps/demo/src/main.tsx
    - apps/demo/src/theme/themeCompact.ts
    - apps/demo/src/theme/themeDefault.ts
---

## 1. 采用的方案

该仓库采用 **Vite 原生环境变量机制**作为前端应用的唯一配置来源。通过 `.env`、`.env.dev`、`.env.production`、`.env.mock` 等多份环境文件，配合 `vite.config.ts` 中的 `loadEnv(mode, process.cwd(), '')` 按构建模式（mode）加载对应变量，并以 `import.meta.env.*` 在运行时读取。

- 所有业务可配置项统一以 `VITE_` 前缀命名（Vite 要求），如 `VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN`、`VITE_API_MENU`、`VITE_SERVER_PORT`、`VITE_ENV`、`VITE_LOG_LEVEL`、`VITE_TITLE`、`VITE_AUTH_TOKEN_EXPIRE_TIME`、`VITE_UI_DEBOUNCE_DELAY`。
- 非 `VITE_` 前缀的变量不会被注入到客户端代码中，因此应用内只依赖 `import.meta.env` 暴露的变量。

## 2. 关键文件

- `apps/demo/.env`：全局默认配置（标题、端口、登录页路径、接口地址、UI 防抖延迟、日志级别说明等）
- `apps/demo/.env.dev`：开发环境覆盖（`VITE_ENV=dev`、本地 API 地址、`VITE_LOG_LEVEL=debug`）
- `apps/demo/.env.production`：生产环境覆盖（`VITE_ENV=production`、线上 API 地址、`VITE_LOG_LEVEL=warn`）
- `apps/demo/.env.mock`：Mock 环境覆盖（`VITE_ENV=mock`、本地 Mock API 地址、`VITE_LOG_LEVEL=debug`）
- `apps/demo/vite.config.ts`：使用 `loadEnv(mode, process.cwd(), '')` 加载环境变量；将 `VITE_SERVER_PORT` 用于 dev server 端口；通过 `define: { __APP_ENV__: JSON.stringify(env.VITE_ENV) }` 将环境名编译期注入为常量；同时从框架包引入别名配置。
- `apps/demo/src/init/net.ts`：启动时调用 `NetUtils.init`，传入 `import.meta.env.VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN` 完成网络层初始化。
- `apps/demo/src/main.tsx`：路由定义中使用 `import.meta.env.VITE_LOGIN_URL` 动态注册登录页路由。
- `apps/demo/src/theme/themeCompact.ts` / `themeDefault.ts`：Ant Design 主题配置，作为“界面外观”这一类运行期配置被集中管理。

## 3. 架构与约定

- **分层加载**：`vite.config.ts` 根据 Turborepo/pnpm script 传入的 `mode`（dev / production / mock）选择对应的 `.env.*` 文件，再与基础 `.env` 合并，形成最终 `env` 对象。
- **集中初始化**：应用入口 `main.tsx` 先执行 `init()` → `netInit()`，把环境变量一次性注入到框架的 `NetUtils`，之后业务模块不再直接访问 `import.meta.env`，而是通过框架提供的工具函数发起请求。
- **运行时 vs 编译期**：`VITE_*` 变量在构建时被 Vite 替换为字面量（如 `__APP_ENV__` 通过 `define` 注入），因此它们适合做环境标识、API 基址、路由路径等静态配置；而 Ant Design 主题通过 `ConfigProvider` 在 React 根组件挂载时提供，属于运行时可切换的配置。
- **无外部配置中心**：当前实现没有引入 JSON/YAML/TOML 配置文件或远程配置服务，所有配置都以内置 `.env` 文件为主。

## 4. 约定与约束

- **命名约定**：所有需要暴露给客户端的变量必须以 `VITE_` 开头，否则 Vite 不会将其注入到 `import.meta.env`。
- **环境文件职责分离**：基础值放在 `.env`，各环境（dev / production / mock）仅覆盖差异项（`VITE_ENV`、`VITE_BASE_URL`、`VITE_SERVER_PORT`、`VITE_LOG_LEVEL`）。
- **日志级别策略**：`.env` 注释明确约定“未配置时开发环境为 debug、其他环境为 warn”，由上层逻辑根据 `VITE_LOG_LEVEL` 或默认值决定。
- **网络配置集中化**：`src/init/net.ts` 是唯一的网络层入口，业务代码不应自行拼接 URL，必须通过 `@jl/framework` 的 `NetUtils` 发起请求。
- **主题配置模块化**：Ant Design 主题拆分为 `themeCompact.ts`、`themeDefault.ts` 两个独立文件，便于按需切换。
- **构建期常量**：`__APP_ENV__` 通过 `define` 注入，适合在条件编译或日志标签中使用；其余 `VITE_*` 变量通过 `import.meta.env` 在运行时代码中被 Vite 替换为字面量。

总体而言，这是一个轻量但结构清晰的前端配置体系：以 Vite `.env` 为核心，通过 `vite.config.ts` 按 mode 装配，再由 `src/init` 在应用启动时集中消费，避免散落的配置读取逻辑。