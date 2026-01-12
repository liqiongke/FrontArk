# FrontArk 框架设计文档

## 1. 项目架构概述

FrontArk 是一个基于 React 的企业级前端框架，采用分层架构设计，将应用层、框架层和模拟数据层分离，提供了完整的状态管理、组件库、数据请求等核心功能。

### 1.1 项目结构

```
A_FrontArk/
├── apps/                    # 应用层
│   └── demo/                # 示例应用
├── packages/                # 框架层
│   ├── framework/           # 核心框架
│   └── mock/                # 模拟数据服务
└── docs/                    # 文档
```

### 1.2 核心模块

| 模块 | 职责 | 文件位置 |
|------|------|----------|
| 状态管理 | 管理应用全局状态 | packages/framework/src/stores/ |
| 组件库 | 提供基础UI组件和控件 | packages/framework/src/comp/ |
| 数据请求 | 处理网络请求和数据流转 | packages/framework/src/utils/netUtils/ |
| 视图管理 | 管理页面视图结构和渲染 | packages/framework/src/comp/view/ |
| 业务逻辑 | 处理业务逻辑和事件 | packages/framework/src/handler/ |
| 数据模型 | 定义数据结构和请求配置 | packages/framework/src/data/ |

## 2. 代码调用过程

### 2.1 应用初始化流程

1. **入口文件执行**：`main.tsx` 作为应用入口，执行初始化函数 `init()`
2. **网络配置初始化**：`init.ts` 调用 `netInit()` 初始化网络请求配置
3. **路由配置**：定义应用路由结构，包括登录页和主应用布局
4. **React 渲染**：创建 React 根实例，渲染应用组件树

### 2.2 页面渲染流程

1. **页面组件加载**：当访问某个路由时，加载对应的页面组件
2. **ViewRoot 初始化**：页面组件使用 `ViewRoot` 组件，传入 ViewClass、DataClass 和 HandlerClass
3. **Store 初始化**：`ViewRoot` 组件调用 `store.init()` 初始化 store，创建状态管理上下文
4. **视图结构加载**：从 ViewClass 中获取视图结构定义
5. **数据请求触发**：根据 DataClass 中的配置，自动触发数据请求
6. **UI 渲染**：根据视图结构和数据，渲染最终的 UI 组件

### 2.3 数据请求流程

1. **请求触发**：页面加载或用户交互触发数据请求
2. **请求参数构建**：`storeReq.ts` 中的 `buildRequestParams` 方法构建请求参数
3. **依赖检查**：检查请求的依赖关系，递归触发依赖请求
4. **网络请求发送**：通过 `NetUtils` 发送网络请求
5. **数据处理**：对返回数据进行格式化和处理
6. **数据存储**：将处理后的数据存储到 store 中
7. **子请求触发**：如果有子请求，继续触发子请求
8. **UI 更新**：数据更新后，触发 UI 组件重新渲染

## 3. 状态流转过程

### 3.1 状态管理架构

使用 Zustand 作为状态管理库，store 包含以下核心模块：

- **data**：存储业务数据
- **req**：存储请求配置和状态
- **view**：存储视图结构定义
- **viewParams**：存储视图参数
- **handler**：存储事件处理实例

### 3.2 状态流转图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ViewRoot   │────▶│   Store     │────▶│  StoreReq   │────▶│  NetUtils   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       ▲                    ▲                    ▲                    │
       │                    │                    │                    │
       │                    │                    │                    ▼
       │                    │                    │           ┌─────────────┐
       │                    │                    └───────────│   API/ Mock │
       │                    │                                └─────────────┘
       │                    │                                       ▲
       │                    │                                       │
       │                    │                                       │
       │                    ▼                                       │
       │           ┌─────────────┐                                 │
       │           │    Data     │─────────────────────────────────┘
       │           └─────────────┘
       │                    ▲
       │                    │
       │                    │
       ▼                    │
┌─────────────┐     ┌─────────────┐
│    UI       │◀────│   Handler   │
└─────────────┘     └─────────────┘
```

### 3.3 核心状态流转场景

#### 3.3.1 页面加载场景

1. 用户访问页面，触发路由跳转
2. 页面组件加载，创建 `ViewRoot` 实例
3. `ViewRoot` 调用 `store.init()`，初始化 store 状态
4. `store.init()` 加载 ViewClass、DataClass 和 HandlerClass
5. 根据 DataClass 中的配置，调用 `StoreReq.fetchAllReq()` 触发数据请求
6. 请求完成后，数据存储到 store 的 `data` 模块中
7. UI 组件通过 store 钩子获取数据，完成渲染

#### 3.3.2 用户交互场景

1. 用户操作 UI 组件，触发事件
2. 事件传递到 Handler 中对应的处理方法
3. Handler 方法可能会：
   - 直接修改 store 中的数据
   - 调用 `store.refreshByViewId()` 重新发送请求
   - 调用其他业务逻辑方法
4. Store 中的数据更新后，触发相关 UI 组件重新渲染

#### 3.3.3 数据依赖场景

1. 数据请求 A 依赖于数据请求 B
2. 当触发请求 A 时，`StoreReq.checkDependencies()` 检查依赖关系
3. 发现依赖请求 B 未完成，先触发请求 B
4. 请求 B 完成后，继续执行请求 A
5. 请求 A 完成后，更新 store 并触发 UI 更新

## 4. 核心 API 和工具类

### 4.1 Store API

| 方法 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| init | 初始化 store | ViewClass, DataClass, HandlerClass | void |
| setData | 设置数据 | path: DPath, value: any | void |
| getData | 获取数据 | path: DPath | any |
| setView | 设置视图结构 | viewId: string, view: any | void |
| getView | 获取视图结构 | viewId?: string | any |
| refreshByViewId | 重新发送视图请求 | viewId: string | Promise<any> |

### 4.2 StoreReq 工具类

| 方法 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| fetchAllReq | 触发所有数据请求 | 无 | void |
| fetchData | 发送单个数据请求 | reqId: string | Promise<any> |
| checkDependencies | 检查请求依赖 | parentIds: string[] | Promise<boolean> |
| send | 重新发送视图请求 | viewId: string | Promise<any> |
| getReqParams | 获取请求参数 | viewId: string | any |

### 4.3 NetUtils 工具类

| 方法 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| init | 初始化网络配置 | baseUrl, loginUrl, loginApi, errorHandler | void |
| get | 发送 GET 请求 | url, params | Promise<any> |
| post | 发送 POST 请求 | url, data | Promise<any> |
| put | 发送 PUT 请求 | url, data | Promise<any> |
| delete | 发送 DELETE 请求 | url, params | Promise<any> |
| handleUnauthorized | 处理未授权错误 | 无 | void |

## 5. 代码优化建议

### 5.1 架构层面优化

1. **完善文档体系**：
   - 添加详细的 API 文档和使用示例
   - 编写组件库文档
   - 完善设计文档和开发指南

2. **增强类型定义**：
   - 完善 TypeScript 类型定义，提高类型安全性
   - 添加接口契约验证
   - 增强运行时类型检查

3. **优化状态管理**：
   - 添加状态持久化支持
   - 实现状态版本管理
   - 优化状态更新性能，减少不必要的渲染

### 5.2 代码层面优化

1. **增强错误处理**：
   - 添加全局错误捕获机制
   - 完善错误日志记录
   - 提供友好的错误提示

2. **性能优化**：
   - 添加请求缓存机制
   - 实现数据懒加载
   - 优化组件渲染性能
   - 添加性能监控和分析工具

3. **代码复用性**：
   - 抽象通用业务逻辑
   - 封装常用组件和工具
   - 实现模板化页面生成

4. **测试覆盖率**：
   - 添加单元测试和集成测试
   - 实现自动化测试流程
   - 提高测试覆盖率

### 5.3 开发体验优化

1. **添加开发工具**：
   - 实现代码生成器
   - 添加开发调试工具
   - 实现热更新和快速刷新

2. **完善开发规范**：
   - 统一代码风格
   - 制定开发规范和最佳实践
   - 添加代码检查和 lint 规则

## 6. 总结

FrontArk 框架采用了分层架构设计，将应用层、框架层和模拟数据层分离，实现了良好的模块化和可扩展性。框架提供了完整的状态管理、组件库、数据请求等核心功能，支持复杂的业务场景和大规模应用开发。

通过清晰的代码调用过程和状态流转机制，框架实现了业务逻辑、数据模型和 UI 视图的分离，提高了代码的可维护性和可扩展性。同时，框架还支持依赖关系管理和父子级联请求，能够处理复杂的数据请求场景。

虽然框架已经具备了完整的功能和良好的设计，但在文档完善、类型定义、错误处理、性能优化等方面还有进一步提升的空间。通过持续的优化和改进，FrontArk 框架可以更好地支持企业级应用开发，提高开发效率和代码质量。