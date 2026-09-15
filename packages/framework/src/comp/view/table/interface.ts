import { type ColumnType } from 'antd/es/table';
import { type ViewItem, type ViewStructBase, type ViewType } from '../interface';
import { type SearchPlaneItem } from '../comp/searchPanel/interface';

export type TableColumn = ColumnType<any>;

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
}
export interface TableItemProps extends ViewItem {
  width?: number;
}
