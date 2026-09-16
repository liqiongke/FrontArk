import { type DPath } from '@store/interface';

// 数据类型
export default interface DataProps {
  id: string;
  // 数据请求url
  url?: string;
  // 数据请求参数(引用其他数据节点取值时自动建立父子依赖)
  params?: DataParamType[];
  // 显式声明依赖的数据节点id(与 params.path 推导的依赖合并)
  dependsOn?: string[];
  // 默认数据
  defaultData?: any;
  // 主键ID,支持属性的组合,如果未设置,则由系统分配唯一ID
  keyAttr?: string | string[];
  // 数据初始化函数
  format?: (data: any) => any;
  // 失败重试次数,默认0(不重试);重试间隔按次数线性递增(基础300ms);401/403 不重试
  retry?: number;
}

// 系统用数据类型
export interface SysDataProps extends DataProps {
  // 引用的父组件的dataId
  parentIds: string[];
  // 引用子组件的dataId
  childIds: string[];
  // 搜索条件
  criteria: Record<string, any>;
}

export interface DataParamType {
  // 字段名称
  field: string;
  // 参数值,如果存在参数值,则不使用数据引用值
  value?: any;
  // 数据引用(取数路径,首段为数据节点id时自动建立父子依赖)
  path?: DPath;
}
