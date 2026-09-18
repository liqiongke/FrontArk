---
kind: configuration_system
name: 基于 Vite .env 多环境配置与 import.meta.env 注入的运行时配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - apps/demo/.env
    - apps/demo/.env.dev
    - apps/demo/.env.production
    - apps/demo/.env.mock
    - apps/demo/vite.config.ts
    - apps/demo/src/main.tsx
    - apps/demo/src/init/net.ts
    - apps/demo/src/init/init.ts
    - packages/framework/src/index.ts
---

## 1. 使用的系统与工具

- **构建期配置加载**：使用 Vite 提供的 `loadEnv(mode, process.cwd(), '')`，根据启动 `mode`（dev / production / mock）自动加载对应 `.env.*` 文件。
- **环境变量命名约定**：所有暴露给前端的变量必须以 `VITE_` 前缀开头（Vite 规范），例如 `VITE_ENV`、`VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN`、`VITE_SERVER_PORT`、`VITE_LOG_LEVEL`、`VITE_AUTH_TOKEN_EXPIRE_TIME`、`VITE_UI_DEBOUNCE_DELAY`、`VITE_TITLE`。
- **运行期访问方式**：应用代码通过 `import.meta.env.VITE_*` 直接读取；构建期常量通过 `define: { __APP_ENV__: JSON.stringify(env.VITE_ENV) }` 编译为字面量。
- **框架层日志级别**：框架导出 `logger`、`getLogLevel`、`setLogLevel`，由应用侧在初始化时按 `VITE_LOG_LEVEL` 设置（见下方约定部分）。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `apps/demo/.env` | 全局默认变量（所有环境共享的基础键） |
| `apps/demo/.env.dev` | 开发环境覆盖（端口、API、日志级别 debug） |
| `apps/demo/.env.production` | 生产环境覆盖（端口 9900、线上 API、日志级别 warn） |
| `apps/demo/.env.mock` | Mock 模式覆盖（`VITE_ENV = "mock"`） |
| `apps/demo/vite.config.ts` | 通过 `loadEnv` 加载环境变量，定义 server.port、alias、define 等 |
| `apps/demo/src/main.tsx` | 路由中直接使用 `import.meta.env.VITE_LOGIN_URL` 作为登录页路径 |
| `apps/demo/src/init/net.ts` | 网络层初始化，从 `import.meta.env` 注入 `VITE_BASE_URL`、`VITE_LOGIN_URL`、`VITE_API_LOGIN` |
| `packages/framework/src/index.ts` | 框架统一导出 `logger`、`getLogLevel`、`setLogLevel`，供应用按日志级别配置 |

## 3. 架构与设计决策

### 3.1 分层加载顺序
1. **基础层**：`.env` 提供所有环境共有的键（如 `VITE_BASE_URL`、`VITE_API_MENU`、`VITE_UI_DEBOUNCE_DELAY`、`VITE_AUTH_TOKEN_EXPIRE_TIME` 等）。
2. **环境覆盖层**：`vite.config.ts` 中 `loadEnv(mode, process.cwd(), '')` 会根据当前 mode 合并对应 `.env.<mode>` 文件，后者覆盖同名键。因此 dev/production/mock 仅声明差异项即可。
3. **注入层**：
   - 构建期常量：`__APP_ENV__` 通过 `define` 注入，用于编译期分支。
   - 运行期常量：`import.meta.env.VITE_*` 由 Vite 在浏览器端以对象形式暴露。
4. **应用初始化层**：`src/init/init.ts` → `netInit()` 调用框架 `NetUtils.init(...)`，把环境变量传入网络层；同时可在此处调用 `setLogLevel` 完成日志级别配置。

### 3.2 配置来源分布
- **构建/服务器配置**：放在 `vite.config.ts` 中（如 `server.port = Number(env.VITE_SERVER_PORT) || 3000`）。
- **前端运行时配置**：通过 `import.meta.env.VITE_*` 在业务代码中读取（如登录页路由、Base URL、API 地址）。
- **框架能力开关**：通过框架导出的 `logger`/`setLogLevel` 控制，日志级别由 `.env.*` 中的 `VITE_LOG_LEVEL` 驱动。

### 3.3 别名与框架集成
`vite.config.ts` 通过 `getFrameworkAliases()` 复用 `packages/framework` 定义的别名，保证框架内部模块解析一致；同时将 `@jl/framework` 指向源码目录以便开发调试。

## 4. 约定与约束

### 已观察到的约定
- 所有需在前端暴露的配置必须加 `VITE_` 前缀，否则不会被 Vite 注入到 `import.meta.env`。
- 每个环境只声明需要覆盖的键，公共键集中在 `.env` 中。
- 日志级别通过 `VITE_LOG_LEVEL` 指定，注释说明“未配置时开发环境为 debug、其他环境为 warn”。
- 网络层初始化统一在 `src/init/net.ts` 中完成，集中处理 401 未授权跳转与错误消息提示。
- 登录页路由路径来自 `VITE_LOGIN_URL`，而非硬编码字符串。

### 约束与规则
- **强制要求**：`vite.config.ts` 使用 `loadEnv(mode, process.cwd(), '')` 第三个参数为空字符串，表示不预过滤任何变量名——这意味着只有被 `import.meta.env` 实际引用的 `VITE_*` 变量才会被打包进产物（Vite 自身行为）。
- **安全边界**：仓库中未发现对敏感密钥（如后端 secret key）的直接引用；当前 `.env*` 仅包含前端可公开的环境信息（URL、端口、日志级别）。若未来引入密钥，应遵循同样的 `VITE_` 前缀并通过 `loadEnv` 注入。
- **环境枚举**：目前支持 `dev`、`production`、`mock` 三种 mode，分别对应 `.env.dev`、`.env.production`、`.env.mock`。

## 5. 总结

该 monorepo 采用 Vite 原生 `.env` + `loadEnv` + `import.meta.env` 的多环境配置方案，将“基础配置”和“环境覆盖”分离，再通过 `init` 流程把配置注入到网络层与日志子系统。框架层仅提供能力（logger、NetUtils），具体配置值全部由应用侧的 `.env.*` 文件决定，便于在不同部署环境中切换而不改动业务代码。