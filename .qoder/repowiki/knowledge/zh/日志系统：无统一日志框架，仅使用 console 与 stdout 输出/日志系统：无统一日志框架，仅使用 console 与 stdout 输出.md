---
kind: logging_system
name: 日志系统：无统一日志框架，仅使用 console 与 stdout 输出
category: logging_system
scope:
    - '**'
source_files:
    - packages/mock/src/index.ts
    - packages/framework/src/utils/netUtils/index.ts
    - apps/demo/src/init/net.ts
    - .gitignore
    - apps/demo/.gitignore
---

## 1. 使用的系统/方案

该仓库**没有引入任何第三方日志框架**（如 log4js、winston、pino、bunyan 等），也没有自定义 logger 模块。前端应用与 mock 服务均依赖运行时原生输出能力：
- 前端（apps/demo）：未发现对 `console.log/info/warn/error` 的直接调用，业务通过 `NetUtils` 的错误回调机制上报异常。
- Mock 服务（packages/mock）：使用 Node.js 的 `process.stdout.write` 输出启动信息，注释明确说明“使用标准输出而不是 console.log”。

因此，本仓库的“日志系统”实质上是**零配置的原生输出 + 错误回调上报**的组合。

## 2. 关键文件

- `packages/mock/src/index.ts`：Mock 服务入口，通过 `process.stdout.write` 输出服务监听地址。
- `packages/framework/src/utils/netUtils/index.ts`：封装 axios 请求，在请求/响应拦截器中统一调用注入的 `errorHandler(code, message, source)`，将网络异常集中上报给上层处理。
- `apps/demo/src/init/net.ts`：初始化 NetUtils，并传入 errorHandler（具体实现位于同目录 net.ts）。
- `.gitignore` / `apps/demo/.gitignore`：忽略 `logs/`、`*.log`、`npm-debug.log*`、`yarn-debug.log*`、`pnpm-debug.log*`、`lerna-debug.log*` 等日志产物，表明项目预期不提交日志文件。

## 3. 架构与约定

- **无全局日志级别管理**：未定义 debug/info/warn/error 等多级日志开关，也未根据环境变量切换日志详细程度。
- **错误上报采用回调模式**：`NetUtils.init` 接收一个 `ErrorHandler` 函数，所有网络层异常（请求拦截器失败、响应拦截器失败、401 未授权、取消请求透传等）都通过该回调集中抛出，由应用层决定如何记录或展示。
- **Mock 服务仅输出启动信息**：除启动时的端口提示外，路由处理器内部未见显式日志输出，调试依赖浏览器控制台或终端输出。
- **日志文件被 git 忽略**：根与各子包均将 `logs/` 目录和常见 npm/pnpm/yarn/lerna 的 debug 日志文件加入 `.gitignore`，遵循“日志不落库”的通用约定。

## 4. 约定与约束

- **不使用 console.log**：Mock 服务入口注释明确声明“使用标准输出而不是 console.log”，体现对可被管道捕获的标准输出的偏好。
- **网络异常必须经 errorHandler 上报**：`NetUtils` 的请求/响应拦截器中所有异常路径都会调用 `errorHandler`，业务侧不应绕过该机制直接吞掉异常。
- **取消请求不触发全局错误处理**：当 `axios.isCancel(error)` 为真时，拦截器直接透传 reject，避免竞态取消场景产生噪音。
- **日志产物不纳入版本控制**：`.gitignore` 中显式排除 `logs/` 及各类包管理器 debug 日志，确保构建/运行产生的日志不会进入仓库。

总体而言，这是一个极简的前端 Monorepo，尚未建立结构化日志体系；当前阶段以“错误回调上报 + 标准输出”满足基本可观测需求。未来如需完善，可考虑在 `packages/framework` 中抽象统一的 logger 模块，并在 `NetUtils` 中按环境注入不同级别的日志输出。