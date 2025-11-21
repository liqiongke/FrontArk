import { DPath } from 'src/stores/store/interface';

// 数据类型
export default interface DataProps {
  id: string;
  // 数据请求url
  url?: string;
  // 数据请求参数
  params?: DataParamType[];
  // 获取数据路径
  path?: DPath;
  // 数据初始化函数
  format?: (data: any) => any;
}

// 系统用数据类型
export interface SysDataProps extends DataProps {
  // 引用的父组件的dataId
  parentIds: string[];
  // 引用子组件的dataId
  childIds: string[];
}

export interface DataParamType {
  // 字段名称
  field: string;
  // 数据引用
  path?: DPath | DataParamValue;
  // 当前参数是否仅使用一次
  once?: boolean;
}

// 参数引用结构
export interface DataParamValue {
  // 数据源ID,如果为空,则默认使用当前数据源
  id?: string;
  // 引用的字段ID,
  // 如果是对象数据,引用字段
  // 如果是数组数据,引用焦点行数据
  field?: string;
  // 自定义引用路径
  path?: DPath;
}
