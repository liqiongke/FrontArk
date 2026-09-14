---
kind: logging_system
name: 基于 console.* 的轻量级调试输出与性能追踪
category: logging_system
scope:
    - '**'
source_files:
    - packages/framework/src/utils/sysUtils/perfTrackerUtils.ts
    - packages/framework/src/stores/store/utils/storeReq.ts
    - packages/framework/src/stores/store/utils/storeData.ts
    - packages/framework/src/stores/store/hooks/useReq.ts
    - apps/demo/src/pages/base/table/handler.ts
    - .gitignore
    - apps/demo/.gitignore
---

## 1. 使用的系统/方案

仓库未引入任何第三方日志框架（如 winston、pino、log4js、bunyan 等）。所有日志输出均直接使用浏览器/Node.js 原生的 `console.log`、`console.warn`、`console.error`，以及 `console.table`。此外，在 `packages/framework/src/utils/sysUtils/perfTrackerUtils.ts` 中实现了一个自研的性能统计工具 `PerfTrackUtils`，通过装饰器模式包装函数并收集调用次数、耗时、异常次数等指标，最终仍通过 `console.log` / `console.table` 输出。

## 2. 关键文件

- `packages/framework/src/utils/sysUtils/perfTrackerUtils.ts`：性能追踪核心，提供 `PerfTrackUtils(id, fn)`、`printStats(id?)`、`resetStats(id?)` 三个导出 API。
- `packages/framework/src/stores/store/utils/storeReq.ts`：数据请求层使用 `console.warn` / `console.error` 输出请求失败、依赖未就绪等状态。
- `packages/framework/src/stores/store/utils/storeData.ts`：store 初始化阶段使用 `console.warn` 提示重复初始化或父请求不存在。
- `packages/framework/src/stores/store/hooks/useReq.ts`：调试用 `console.log('resetReq', params)`。
- `apps/demo/src/pages/base/table/handler.ts`：业务页面中使用 `console.log` 打印表格数据。
- `.gitignore` / `apps/demo/.gitignore`：将 `logs/`、`*.log`、各类包管理器 debug log 加入忽略列表，表明项目不期望生成持久化日志文件。

## 3. 架构与约定

- **无集中式 logger**：没有统一的 logger 模块或全局日志实例，各模块直接调用 `console.*`。
- **结构化字段**：仅 `perfTrackerUtils.ts` 对性能指标做了结构化建模——`PerfStats` 接口包含 `调用次数`、`总耗时_毫秒`、`最小耗时_毫秒`、`最大耗时_毫秒`、`异常次数`、`上次执行时间_毫秒`，并通过 `calculateDisplayStats` 统一格式化后以 `console.table` 输出。
- **输出目标**：全部输出到控制台；仓库未配置任何文件 sink、远程上报或日志聚合服务。
- **环境区分**：未发现基于环境变量切换日志级别或开关日志输出的逻辑；开发/生产共用同一套 `console.*` 调用。
- **错误处理**：`PerfTrackUtils` 在 try/catch 中捕获被包装函数的异常，累加 `异常次数` 并在 finally 中重新抛出，保证不影响原始函数行为；其他位置直接使用 `console.error` 输出错误信息。

## 4. 约定与约束

- **不使用第三方日志库**：整个 monorepo 中未见任何日志框架依赖，所有日志均为原生 `console.*`。
- **不产生持久化日志文件**：根目录与各子项目的 `.gitignore` 均显式忽略 `logs/` 和 `*.log`，说明项目约定不应写入磁盘日志文件。
- **性能追踪通过 PerfTrackUtils**：对需要监控性能的函数，应使用 `PerfTrackUtils(id, fn)` 包裹，并通过 `printStats()` / `resetStats()` 查看或重置统计；该工具是唯一具备结构化指标采集能力的组件。
- **调试输出分散在各模块**：store、handler、demo 页面等位置直接散落 `console.log/warn/error`，没有统一的日志入口或级别控制。
- **mock 模块注释明确避免 console.log**：`packages/mock/src/index.ts` 中注释写明“使用标准输出而不是 console.log”，但该仓库中其余代码并未遵循此约定，仍大量使用 `console.*`。

总体而言，这是一个**极简的、基于原生 console 的调试输出方案**，仅在性能追踪场景下提供了结构化工具，没有统一的日志级别、sink、格式化和开关机制。