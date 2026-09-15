import { createContext, useContext } from 'react';

/**
 * 表格视图上下文
 * 用于向 antd 自定义行组件(TableRow)透传当前表格的 viewId,
 * 框架层不得硬编码任何业务 viewId
 */
const TableIdContext = createContext<string | undefined>(undefined);

/**
 * 获取当前行所属表格的 viewId
 * 不在表格视图内渲染时返回 undefined(此时行组件不订阅焦点高亮)
 */
export const useTableId = () => useContext(TableIdContext);

export default TableIdContext;
