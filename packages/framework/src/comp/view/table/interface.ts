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
}
export interface TableItemProps extends ViewItem {
  width?: number;
}
