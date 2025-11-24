import { ColumnType } from 'antd/es/table';
import { ViewItem, ViewStructBase, ViewType } from '../interface';

export type TableColumn = ColumnType<any>;

export interface ViewTableProps extends ViewStructBase {
  type: ViewType.LayoutTab;
  /**
   * @ 表格行key
   */
  rowKey?: string;
  /**
   * @ 表格列
   */
  items?: TableItemProps[];
}
export interface TableItemProps extends ViewItem {
  width?: number;
}
