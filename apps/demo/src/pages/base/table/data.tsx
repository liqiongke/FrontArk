import { DataBase, type DataProps } from '@jl/framework';

/**
 * 数据节点声明约定:
 * - id 使用 `as const` 保留字面量类型,配合下方 DataNodeId 联合类型约束取数路径首段
 * - 其余字段以 `satisfies DataProps` 校验结构合法性,同时不拓宽 id 的字面量类型
 */
class Data extends DataBase {
  mainTable = {
    id: 'table' as const,
    url: '/demo/base/table',
    keyAttr: 'id',
  } satisfies DataProps;

  mainForm = {
    id: 'form' as const,
    url: '/demo/base/form',
  } satisfies DataProps;

  mainFormData = {
    id: 'formData' as const,
    path: [DataBase.active(this.mainTable.id)],
  } satisfies DataProps;
}

export default Data;

/**
 * 本页面全部数据节点 ID 的联合类型
 * 用于约束 setData/getData 路径的首段:路径写错(如把 'table' 拼成 'tables')在编译期即可发现
 * 注意:新增/重命名数据节点时需同步维护此处(删改字段会因类型引用报错而被编译器提示)
 */
export type DataNodeId = Data['mainTable']['id'] | Data['mainForm']['id'] | Data['mainFormData']['id'];

// 约束首段为数据节点 ID 的取数路径类型
export type DataNodePath = [DataNodeId, ...(string | number)[]];
