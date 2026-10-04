import { type ReactNode } from 'react';
import { type ViewItem, type ViewStructBase, type ViewType } from '../interface';
import { type SearchPlaneItem } from '../comp/searchPanel/interface';

/**
 * 框架自有表格列描述（不再依赖第三方表格列类型）
 * 仅承载当前 schema 已使用的能力：标题、宽度、字段、稳定键
 */
export interface TableColumn {
  title: string;
  width?: number;
  dataIndex: string;
  key: string;
}

/**
 * 表格渲染模式
 * 控制 dataSource(行结构)与字段值的订阅分工
 */
export enum RenderMode {
  /**
   * 经典模式(默认):dataSource 为完整记录数组,列渲染依赖 record;
   * 兼容依赖完整 record 的本地排序/过滤/展开/行选择等能力
   */
  Record = 'record',
  /**
   * 结构订阅模式:dataSource 仅含行身份描述({@key}),字段值由单元格控件按 @Row 自行订阅;
   * 普通字段编辑只更新对应控件,不再带动表格外壳更新;
   * 行键缺失/重复/非字符串时自动回退 Record 模式(此类数据下 @Row 无法安全寻址)
   */
  Subscription = 'subscription',
}

export interface ViewTableProps extends ViewStructBase {
  type: ViewType.Table;
  /**
   * @ 表格列
   */
  items?: TableItemProps[];

  /**
   * @ 表格搜索
   */
  searchItems?: SearchPlaneItem[];

  /**
   * @name 表格高度，默认为400
   * @desc 这个属性会在初始化后缓存
   */
  height?: number | string;

  /**
   * @name 渲染模式
   * @desc 默认 Record;无本地排序/过滤/行选择依赖的表格可启用 Subscription,
   *       将行结构更新与字段值更新分离(详见 docs/design/table-cell-update-analysis.md 5.2)
   */
  renderMode?: RenderMode;

  /**
   * @name 底部统计行
   * @desc 配置需要统计的列及其统计方式，为空时不渲染统计行。
   *       统计基于表格的全部数据（含未进入虚拟窗口的行），字段编辑后会同步重算。
   */
  summaryItems?: TableSummaryItem[];

  /**
   * @name 统计行首列文案
   * @desc 默认「合计」，用于说明该行的含义
   */
  summaryText?: string;
}

/**
 * 内置统计方式
 * 参与计算的数值取自该列的非空值，字符串形式的数字按数值处理
 */
export enum SummaryType {
  /** 求和 */
  Sum = 'sum',
  /** 平均值 */
  Avg = 'avg',
  /** 计数(该列非空值个数) */
  Count = 'count',
  /** 最大值 */
  Max = 'max',
  /** 最小值 */
  Min = 'min',
}

/**
 * 自定义统计函数
 * @param values 该列的非空数值集合（空值与非数值已滤除）
 * @param rows 表格全部行数据，需要自定义过滤/换算/去重时直接使用
 * @returns 展示内容，可以是字符串、数字或任意 React 节点
 */
export type TableSummaryFn = (
  values: number[],
  rows: Array<Record<string, unknown>>,
) => ReactNode;

export interface TableSummaryItem {
  /** @name 要统计的列，与 items 中的 field 对应 */
  field: string;

  /**
   * @name 内置统计方式
   * @desc 默认 Sum；声明了 summary 时忽略该项
   */
  type?: SummaryType;

  /**
   * @name 自定义统计函数
   * @desc 优先于 type，用于占比、去重计数、按条件计数等内置方式覆盖不到的场景
   */
  summary?: TableSummaryFn;

  /**
   * @name 数值展示格式化
   * @desc 仅在内置统计方式下生效，默认整数直出、小数最多保留两位
   */
  formatter?: (value: number) => string;
}

export interface TableItemProps extends ViewItem {
  width?: number;
}
