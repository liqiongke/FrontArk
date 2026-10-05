import { type ReactNode } from 'react';
import { type CtrlCheckboxProps } from '@/comp/control/checkbox/interface';
import { type CtrlDateProps, type CtrlDateRangeProps } from '@/comp/control/date/interface';
import { type CtrlInputProps } from '@/comp/control/input/interface';
import { type CtrlRadioProps } from '@/comp/control/radio/interface';
import { type CtrlSelectProps } from '@/comp/control/select/interface';
import { type CtrlSwitchProps } from '@/comp/control/switch/interface';
import { type CtrlTimeProps, type CtrlTimeRangeProps } from '@/comp/control/time/interface';

export interface SearchPlaneProps {
  viewId: string;
  items?: SearchPlaneItem[];
  /**
   * @name 条件行右侧插槽
   * @desc 由调用方挂载表格通用工具等；面板只负责布局，不关心具体内容
   */
  tools?: ReactNode;
}

export interface SearchPlaneFormProps {
  viewId: string;
  // 每行有多少列搜索项
  colNum?: 3 | 4 | 6 | 8;
  // 搜索项
  items?: SearchPlaneItem[];
  // 搜索时触发
  onSearch?: () => void;
  // 清空数据时触发
  onReset?: () => void;
}

export interface SearchPlaneSelectProps {
  viewId: string;
  items?: SearchPlaneItem[];
}

export interface SearchPlaneItemProps {
  viewId: string;
  item: SearchPlaneItem;
}

// 搜索面板中支持的数据类型
export type CtrlSearchPlaneType =
  | CtrlInputProps
  | CtrlSelectProps
  | CtrlSwitchProps
  | CtrlRadioProps
  | CtrlCheckboxProps
  | CtrlDateProps
  | CtrlDateRangeProps
  | CtrlTimeProps
  | CtrlTimeRangeProps;

/**
 * 搜索值形态:决定「类型推断」的形状规则与值区渲染何种控件
 * 未显式声明时按 ctrl.type 推导,再缺省为 text
 */
export type SearchValueKind =
  | 'text'
  | 'number'
  | 'bool'
  | 'date'
  | 'dateRange'
  | 'timeRange'
  | 'enum';

/** 传给后端的比较语义,fuzzy 走模糊匹配,exact 走全等,range 走区间 */
export type SearchMatchMode = 'exact' | 'fuzzy' | 'range';

/** 同字段多值语义:or 合并为一个条件(默认),and 由后端按多条件处理 */
export type SearchValueOperator = 'and' | 'or';

/**
 * 推断置信度:
 * - locked 用户显式选择,输入不再改写类型
 * - exact 正则/显式语法命中,静默锁定
 * - inferred 形状/别名推断,需视觉降级并提示
 * - none 未识别,交还用户手动选择
 */
export type SearchInferConfidence = 'locked' | 'exact' | 'inferred' | 'none';

export interface SearchPlaneItem {
  // 标题
  title: string;

  // 搜索字段
  field: string;

  // 搜索栏的控件,默认是输入框
  ctrl?: CtrlSearchPlaneType;

  // 匹配的正则表达式,根据用户输入,可以快速匹配当前节点
  regExp?: RegExp;

  /**
   * @name 推断元信息 - 别名
   * @desc 关键词/中文名/英文名,如 ['品名','名称','name'];用于「名称」这类输入的识别
   */
  keywords?: string[];

  /**
   * @name 推断元信息 - 值形态
   * @desc 缺省时按 ctrl.type 推导,再缺省为 text
   */
  valueKind?: SearchValueKind;

  /**
   * @name 比较语义
   * @desc 默认 fuzzy
   */
  match?: SearchMatchMode;

  /**
   * @name 同字段多值语义
   * @desc 默认 or(合并为一个条件)
   */
  operator?: SearchValueOperator;

  /**
   * @name 同级竞争权重
   * @desc 多个字段同时命中时取值大者,默认 0
   */
  weight?: number;

  // 输入区占位提示,如 'TR 开头的运输单号'
  example?: string;

  /**
   * @name 兜底字段
   * @desc 未识别到类型时按该字段提交;单表最多声明一个
   */
  primary?: boolean;
}

// 条件 Tag:由 criteria 派生,不维护第二份状态
export interface SearchConditionTag {
  // 字段名(criteria 键)
  field: string;
  // 字段标题
  title: string;
  // 展示文本(多值为 'A / B',区间为 'start ~ end')
  text: string;
  // 原始值
  value: any;
  // 推断置信度,low 用于「已识别为...」的弱提示样式
  confidence: SearchInferConfidence;
}

// 类型推断结果
export interface SearchInferResult {
  // 命中字段;confidence 为 none 时可能为兜底字段
  field?: string;
  confidence: SearchInferConfidence;
  // 命中的规则标识,便于埋点与调试
  rule?: string;
  // 显式语法解析出的值(如 'tr:TR001' 解析出 'TR001')
  value?: string;
  // 显式语法里用户写的 key
  key?: string;
}

// 值规范化结果
export type SearchNormalizeResult =
  | { ok: true; value: any }
  | { ok: false; message: string };
