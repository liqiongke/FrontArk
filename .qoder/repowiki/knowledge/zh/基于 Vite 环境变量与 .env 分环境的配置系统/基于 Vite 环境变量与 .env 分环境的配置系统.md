---
kind: configuration_system
name: 基于 Vite 环境变量与 .env 分环境的配置系统
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
    - apps/demo/src/main.tsx
    - packages/framework/vite.config.ts
    - packages/framework/src/utils/netUtils/index.ts
---

## 1. 使用的系统与工具

本仓库采用 **Vite** 作为构建与开发服务器，利用其内置的 `loadEnv` 能力加载 `.env*` 文件，并通过 `defineConfig` 将环境变量注入到运行时。应用使用 React + TypeScript，通过 `vite-plugin-pages` 进行路由生成，框架包 `@jl/framework` 提供网络、工具等公共能力。

## 2. 核心文件与位置

- **应用级环境变量文件**：
  - `apps/demo/.env` — 基础环境配置（所有环境共享）
  - `apps/demo/.env.dev` — 开发环境覆盖（`VITE_ENV = "dev"`、端口、API 地址）
  - `apps/demo/.env.production` — 生产环境覆盖（`VITE_ENV = "production"`、端口、API 地址）
  - `apps/demo/.env.mock` — Mock 环境覆盖（`VITE_ENV = "mock"`）
- **构建期配置**：`apps/demo/vite.config.ts`，通过 `loadEnv(mode, process.cwd(), '')` 按 `mode` 加载对应 `.env` 文件，并将 `VITE_SERVER_PORT` 用于 dev server 端口，将 `VITE_ENV` 以 `__APP_ENV__` 常量形式注入。
- **运行期读取入口**：`apps/demo/src/init/net.ts` 在初始化时从 `import.meta.env` 读取 `VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN` 并传入框架的 `NetUtils.init`。
- **框架侧约定**：`packages/framework/src/utils/netUtils/index.ts` 中注释明确要求登录接口地址需从 `.env` 中的 `VITE_API_LOGIN` 配置。
- **路由/页面级配置**：`apps/demo/src/main.tsx` 通过 `import.meta.env.VITE_LOGIN_URL` 动态注册登录页路由路径。

## 3. 架构与设计约定

### 3.1 环境变量命名规范
所有需要暴露给前端运行时的变量必须以 `VITE_` 前缀命名（如 `VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN`、`VITE_TITLE`、`VITE_UI_DEBOUNCE_DELAY`、`VITE_AUTH_TOKEN_EXPIRE_TIME`、`VITE_SERVER_PORT`、`VITE_ENV`）。这是 Vite 的强制约束：只有 `VITE_*` 变量会被编译进客户端代码。

### 3.2 分层与环境覆盖
采用“基础 + 环境覆盖”的分层方式：
- `.env` 定义全局默认值；
- `.env.dev` / `.env.production` / `.env.mock` 分别覆盖 `VITE_ENV`、`VITE_SERVER_PORT`、`VITE_BASE_URL` 等环境相关项；
- 构建时通过 `mode` 参数选择加载哪个 `.env.*` 文件，实现多环境隔离。

### 3.3 构建期 vs 运行期配置
- **构建期**：`vite.config.ts` 中使用 `loadEnv` 读取 `VITE_SERVER_PORT` 配置 dev server 端口，并将 `VITE_ENV` 序列化为 `__APP_ENV__` 常量注入，供构建产物使用。
- **运行期**：业务代码通过 `import.meta.env.VITE_*` 直接访问环境变量（如 `netInit` 中读取 API 地址和登录 URL），无需额外配置中心。

### 3.4 框架与应用的解耦
应用通过 `@jl/framework` 提供的 `NetUtils` 统一发起网络请求，框架内部约定从 `.env` 读取 `VITE_API_LOGIN`，从而将“登录接口地址”这一敏感配置保留在环境变量中，不硬编码到源码。

## 4. 约定与约束

- **必须使用 `VITE_` 前缀**：只有以 `VITE_` 开头的 `.env` 变量才会被 Vite 注入到客户端，这是由 Vite 自身机制保证的。
- **每个环境需提供 `.env.<mode>` 文件**：当前仓库为 dev、production、mock 三种模式分别提供了覆盖文件，缺失时将回退到 `.env` 基础配置。
- **敏感信息不应硬编码**：API 基址、登录页路径、接口路径等通过环境变量注入，避免写入源码。
- **端口配置集中管理**：开发服务器端口通过 `VITE_SERVER_PORT` 在 `.env.*` 中配置，`vite.config.ts` 中解析后设置 `server.port`。
- **框架包复用别名配置**：`packages/framework/vite.config.ts` 导出 `getAliasConfig()`，应用通过扩展该配置统一模块别名，间接影响构建期路径解析行为。

## 5. 现状说明

- `apps/demo/config/config.ts` 当前为空文件，未承担实际配置职责；项目配置集中在 `.env*` 与 `vite.config.ts` 中。
- 目前未发现统一的运行时配置中心或 feature flag 系统，所有开关与参数均以环境变量形式存在。
- 框架包本身不包含运行时配置加载逻辑，仅通过注释约定使用者需在 `.env` 中配置 `VITE_API_LOGIN`。
