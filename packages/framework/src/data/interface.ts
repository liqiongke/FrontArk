import { DPath } from '@store/interface';

// 数据类型
export default interface DataProps {
  id: string;
  // 引用数据路径,如果当前值存在,则不发送数据请求
  path?: DPath;
  // 数据请求url
  url?: string;
  // 数据请求参数
  params?: DataParamType[];
  // 默认数据
  defaultData?: any;
  // 主键ID,支持属性的组合,如果未设置,则由系统分配唯一ID
  keyAttr?: string | string[];
  // 数据初始化函数
  format?: (data: any) => any;
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
  // 数据引用
  path?: DPath;
}
