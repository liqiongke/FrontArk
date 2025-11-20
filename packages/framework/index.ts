import createUserStore from './src/stores/user/userStore';
import NetUtils from './src/utils/netUtils';
import type { Result } from './src/utils/netUtils/interface';
import ViewRoot from './src/view';
import DataProps from './src/data/interface';
import { ViewFormProps } from './src/comp/view/form/interface';
import { ViewStructBase, ViewType } from './src/comp/view/interface';
import { ViewTableProps } from './src/comp/view/table/interface';

// store 数据
// store 用户类型
export { createUserStore };

// 数据类型
export type { Result };

// 工具类型
export { NetUtils };

// 根视图
export { ViewRoot };

// handler类
export { default as HandlerBase } from './src/handler/handlerBase';

// 数据类型
export { default as DataBase } from './src/data/dataBase';
export type { DataProps };

// 组件类型
export { ViewType };
export { default as ViewBase } from './src/comp/viewBase';
export type { ViewStructBase };
// 表单组件
export type { ViewFormProps };
// 表格组件
export type { ViewTableProps };

// 控件类型
export { CtrlType } from './src/comp/control/interface';
