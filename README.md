# FrontArk

一个基于 React 的企业级前端框架，提供完整的状态管理、组件库、数据请求等核心功能，支持复杂的业务场景和大规模应用开发。

## 项目亮点

### 1. 分层架构设计

采用清晰的分层架构，将应用层、框架层和模拟数据层分离，实现了良好的模块化和可扩展性。

- **应用层**：存放具体的业务应用
- **框架层**：提供核心功能和工具
- **模拟数据层**：提供模拟 API 服务，支持离线开发

### 2. 强大的状态管理

基于 Zustand 实现的高效状态管理，支持：

- 自动数据请求和依赖管理
- 父子级联请求
- 数据持久化
- 状态版本管理

### 3. 组件化开发

提供丰富的 UI 组件和控件库，支持：

- 表单组件（Form）
- 表格组件（Table）
- 弹出框组件（Modal）
- 抽屉组件（Drawer）
- 标签页组件（Tab）
- 工具栏组件（ToolBar）

### 4. 灵活的数据请求

封装了完整的数据请求机制，支持：

- 自动请求依赖关系处理
- 请求参数构建和格式化
- 响应数据处理和转换
- 错误处理和重试机制

### 5. 业务逻辑分离

采用 View-Data-Handler 三层架构，实现业务逻辑、数据模型和 UI 视图的分离：

- **View**：负责视图结构定义和渲染
- **Data**：负责数据结构和请求配置
- **Handler**：负责业务逻辑和事件处理

### 6. 类型安全

全面支持 TypeScript，提供完善的类型定义，提高代码的安全性和可维护性。

### 7. 开发效率提升

提供完整的开发工具链和最佳实践，支持：

- 热更新和快速刷新
- 代码生成器
- 开发调试工具
- 自动化测试流程

## 项目结构

```
A_FrontArk/
├── apps/                    # 应用层
│   └── demo/                # 示例应用
├── packages/                # 框架层
│   ├── framework/           # 核心框架
│   └── mock/                # 模拟数据服务
└── docs/                    # 文档
```

## 核心功能

### 1. 状态管理

```tsx
// 创建和使用 store
import { createBaseStore } from '@jl/framework';

const store = createBaseStore();
store.init(ViewClass, DataClass, HandlerClass);

// 获取和设置数据
const data = store.getData('dataPath');
store.setData('dataPath', newData);

// 重新发送请求
store.refreshByViewId('viewId');
```

### 2. 组件库

```tsx
// 定义视图结构
class View extends ViewBase {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    dataId: this.data.mainTable.id,
    items: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
      // ...
    ],
  };

  getRootId = () => this.table1.id;
}
```

### 3. 数据请求

```tsx
// 定义数据结构和请求配置
class Data extends DataBase {
  mainTable = {
    id: 'mainTable',
    url: '/api/products',
    criteria: {
      page: 1,
      pageSize: 10,
    },
    params: [
      { field: 'category', path: 'form1.category' },
    ],
  };
}
```

### 4. 业务逻辑

```tsx
// 处理业务逻辑和事件
class Handler extends HandlerBase {
  onPrintData = () => {
    const data = this.store.getData('mainTable');
    console.log('打印数据:', data);
  };

  btnGetReqData = async () => {
    await this.store.refreshByViewId('table1');
  };
}
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动开发服务

```bash
pnpm dev
```

### 3. 访问应用

打开浏览器访问 `http://localhost:5173`

## 构建和部署

### 1. 构建应用

```bash
pnpm build
```

### 2. 启动模拟数据服务

```bash
pnpm mock
```

## 文档

- [框架设计文档](docs/design/framework-design.md)
- [运行与构建](docs/1.运行与构建.md)
- [组件用法](docs/2.组件用法.md)

## 技术栈

- **框架**：React 18
- **状态管理**：Zustand
- **路由**：React Router 6
- **UI 组件**：Ant Design
- **类型系统**：TypeScript
- **构建工具**：Vite
- **包管理**：PNPM

## 开发规范

- 遵循 ESLint 和 Prettier 代码规范
- 采用 TypeScript 编写所有代码
- 实现单元测试和集成测试
- 保持代码的可维护性和可扩展性

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
