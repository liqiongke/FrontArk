import { type ReactNode } from 'react';
import { type ViewItem, type ViewStructBase, type ViewType } from '../interface';
import { type SearchPlaneItem } from '../comp/searchPanel/interface';

/**
 * 框架自有表格列描述（不再依赖第三方表格列类型）
 * 仅承载当前 schema 已使用的能力：标题、宽度、字段、稳定键
 */
/** 列的值类型：数字列右对齐并按小数点对齐，文本列左对齐 */
export type TableValueType = 'text' | 'number';

/** 列对齐方式：表头与该列所有内容（数据格、统计格）共用同一取值 */
export type TableAlign = 'left' | 'center' | 'right';

export interface TableColumn {
  title: string;
  width?: number;
  dataIndex: string;
  key: string;
  /** 值类型，决定单元格对齐方式 */
  valueType: TableValueType;
  /**
   * 本列的对齐方式，由 TableUtils.resolveAlign 统一解析。
   * 表头直接复用它，保证标题与列内内容左右一致（标题不会与内容反向错位）。
   */
  align: TableAlign;
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

  /**
   * @name 服务端分页
   * @desc 置为 true 或传入配置即启用。分页参数写入数据节点 criteria 后重新请求，
   *       页码/每页条数/总条数取自响应体的 `@pagination`（后端未返回时不渲染分页条）。
   *       首次请求的每页条数由后端默认值决定；需要指定时在数据节点的 params 中声明
   *       （如 `{ field: 'pageSize', value: 20 }`），会随请求一并发出。
   */
  pagination?: boolean | TablePaginationConfig;

  /**
   * @name 通用工具
   * @desc 默认开启全屏显示与下载数据；置为 false 关闭，或传入配置单独控制
   */
  tools?: boolean | TableToolsConfig;
}

/** 服务端分页的响应元信息（响应体 `@pagination`） */
export interface TablePaginationInfo {
  /** 当前页码，从 1 开始 */
  current: number;
  /** 每页条数 */
  pageSize: number;
  /** 总条数 */
  total: number;
  /** 总页数，后端未返回时按 total/pageSize 推导 */
  totalPages?: number;
}

export interface TablePaginationConfig {
  /**
   * @name 请求里的页码字段名
   * @desc 默认 page，需与后端约定一致
   */
  pageField?: string;

  /**
   * @name 请求里的每页条数字段名
   * @desc 默认 pageSize，需与后端约定一致
   */
  pageSizeField?: string;

  /**
   * @name 每页条数候选
   * @desc 默认 [10, 20, 50, 100]
   */
  pageSizeOptions?: number[];
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
   * @desc 仅在内置统计方式下生效。默认按列内数据的最大小数位数输出固定精度
   *       （右对齐时位数一致，小数点才能与列内内容对齐）
   */
  formatter?: (value: number) => string;

  /**
   * @name 统计值的小数位数
   * @desc 默认取该列数据中的最大小数位数。列内精度不统一（如混有整数与小数）时，
   *       可显式指定以固定统计值位数
   */
  precision?: number;
}

export interface TableItemProps extends ViewItem {
  /**
   * @name 建议列宽(px)
   * @desc 表格为 fixed 布局，列宽只由这里与用户的拖拽决定，不随内容变化；
   *       未声明时按容器宽度均分
   */
  width?: number;

  /**
   * @name 列的值类型
   * @desc 默认 text；置为 number 后该列内容右对齐，并用等宽数字让小数点对齐
   */
  valueType?: TableValueType;
}

export interface TableToolsConfig {
  /**
   * @name 全屏显示
   * @desc 默认 true；对表格所在面板使用浏览器 Fullscreen API
   */
  fullscreen?: boolean;

  /**
   * @name 下载数据
   * @desc 默认 true；导出当前已加载的数据为 CSV（服务端分页时为当前页）
   */
  download?: boolean;

  /**
   * @name 导出文件名(不含扩展名)
   * @desc 默认 table
   */
  exportFileName?: string;

  /**
   * @name 列设置
   * @desc 默认 true；在工具区提供列设置入口，勾选控制是否展示、拖拽调整列顺序。
   *       列数少于 2 时无顺序/可见性可调，不渲染该入口。
   *       导出的 CSV 与展示中的列保持一致（同顺序、同可见性）。
   */
  columns?: boolean;
}

/** 列设置入口的回调集合，由表格主体提供、工具区透传 */
export interface ColumnSettingsProps {
  /** 全部列（含被隐藏的列），按当前展示顺序排列 */
  allColumns: TableColumn[];
  /** 被隐藏的列 key */
  hiddenKeys: string[];
  /** 勾选/取消勾选某一列，visible 为 false 表示隐藏 */
  onToggle: (key: string, visible: boolean) => void;
  /** 拖拽换位：把 fromKey 移到 toKey 的位置 */
  onMove: (fromKey: string, toKey: string) => void;
  /** 恢复配置顺序与全部展示 */
  onReset: () => void;
}
